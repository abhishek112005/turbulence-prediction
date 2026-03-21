import joblib
import math
import numpy as np
import os
import pandas as pd
import requests
import secrets
from collections import defaultdict
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from api.auth import get_access_token
from communication.alerts import dispatch_alert, ensure_alerts_table
from communication.websocket_routes import router as communication_router
from config.settings import AVIATIONSTACK_ACCESS_KEY, AVIATIONSTACK_BASE_URL
from database.db_connection import get_connection
from database.insert_planes import insert_planes
from predictions.predict_live import insert_predictions
from preprocessing.feature_engineering import clean_dataframe


class RoomManager:
    def __init__(self):
        self.rooms = defaultdict(set)
        self.last_level = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        self.rooms[room_code].add(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        self.rooms[room_code].discard(websocket)

    async def broadcast(self, room_code: str, payload: dict):
        if not self.rooms[room_code]:
            return {"sent": 0, "skipped": False}
        level = payload.get("t")
        if self.last_level.get(room_code) == level:
            return {"sent": 0, "skipped": True}
        self.last_level[room_code] = level
        message = json.dumps(payload)
        dead = set()
        for websocket in list(self.rooms[room_code]):
            try:
                await websocket.send_text(message)
            except Exception:
                dead.add(websocket)
        self.rooms[room_code] -= dead
        return {"sent": len(self.rooms[room_code]), "skipped": False}

    def get_status(self, room_code: str):
        return {
            "connected": len(self.rooms[room_code]),
            "last_level": self.last_level.get(room_code),
        }


room_manager = RoomManager()
ROUTE_CACHE = {}
ROUTE_CACHE_TTL_SECONDS = 300
PROVIDER_BACKOFF_UNTIL = None
_LAST_AVIATIONSTACK_KEY = None
OPENSKY_BACKOFF_UNTIL = None


FEATURE_COLUMNS = [
    "baro_altitude",
    "velocity",
    "altitude_km",
    "speed_altitude_ratio",
    "vertical_acceleration",
    "velocity_acceleration",
    "vertical_rate_std_3",
    "velocity_std_3",
]

CURRENT_MODEL_PATH = "turbulence_model.pkl"
FUTURE_MODEL_PATH = "future_turbulence_model.pkl"
BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIST_DIR = BASE_DIR.parent / "frontend" / "dist"
FRONTEND_INDEX_FILE = FRONTEND_DIST_DIR / "index.html"


def load_allowed_origins():
    return ["*"]


app = FastAPI(title="Turbulence Pipeline API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=load_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(communication_router)

ensure_alerts_table()

if FRONTEND_DIST_DIR.exists():
    assets_dir = FRONTEND_DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

_current_model = None
_future_model = None


class GoogleAuthRequest(BaseModel):
    token: str


class GoogleSignupRequest(BaseModel):
    token: str
    role: str


class PilotFlightAssignmentRequest(BaseModel):
    pilot_email: str
    icao24: str


def get_models():
    global _current_model
    global _future_model

    if _current_model is None:
        _current_model = joblib.load(CURRENT_MODEL_PATH)
    if _future_model is None:
        _future_model = joblib.load(FUTURE_MODEL_PATH)

    return _current_model, _future_model

# fetching data from OPENSKYI API

def fetch_and_store_live_states():
    try:
        payload = opensky_get("https://opensky-network.org/api/states/all")
    except HTTPException as exc:
        # OpenSky throttles aggressively. If we're rate-limited, keep serving from DB.
        if exc.status_code == 429:
            return 0
        raise
    states = payload.get("states") or []

    if states:
        insert_planes(states)

    return len(states)


def fetch_latest_batch(limit=5000):
    conn = get_connection()
    query = """
        SELECT *
        FROM planes_table
        ORDER BY fetched_at DESC
        LIMIT %s;
    """
    cursor = conn.cursor()
    cursor.execute(query, (limit,))
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    cursor.close()
    conn.close()
    df = pd.DataFrame(rows, columns=columns)
    return df


def fetch_recent_rows_for_icao24(icao24, limit=200):
    conn = get_connection()
    query = """
        SELECT *
        FROM planes_table
        WHERE LOWER(icao24) = LOWER(%s)
        ORDER BY fetched_at DESC
        LIMIT %s;
    """
    cursor = conn.cursor()
    cursor.execute(query, (icao24, limit))
    rows = cursor.fetchall()
    columns = [desc[0] for desc in cursor.description]
    cursor.close()
    conn.close()
    return pd.DataFrame(rows, columns=columns)


def fetch_latest_db_state_for_icao24(icao24):
    df = fetch_recent_rows_for_icao24(icao24, limit=1)
    if df.empty:
        return None

    row = df.iloc[0].to_dict()
    # Keep keys aligned with parse_opensky_state so the frontend can render telemetry consistently.
    return {
        "icao24": str(row.get("icao24") or "").strip().lower(),
        "callsign": str(row.get("callsign") or "").strip(),
        "origin_country": row.get("origin_country"),
        "time_position": None,
        "last_contact": row.get("last_contact"),
        "longitude": row.get("longitude"),
        "latitude": row.get("latitude"),
        "baro_altitude": row.get("baro_altitude"),
        "on_ground": row.get("on_ground"),
        "velocity": row.get("velocity"),
        "true_track": row.get("true_track"),
        "vertical_rate": row.get("vertical_rate"),
        "geo_altitude": None,
    }


def parse_opensky_state(state):
    return {
        "icao24": state[0],
        "callsign": state[1],
        "origin_country": state[2],
        "time_position": state[3],
        "last_contact": state[4],
        "longitude": state[5],
        "latitude": state[6],
        "baro_altitude": state[7],
        "on_ground": state[8],
        "velocity": state[9],
        "true_track": state[10],
        "vertical_rate": state[11],
        "geo_altitude": state[13],
    }


def fetch_direct_opensky_state(icao24):
    data = opensky_get(
        "https://opensky-network.org/api/states/all",
        params={"icao24": normalize_icao24(icao24)},
    )
    states = data.get("states") or []
    if not states:
        return None

    parsed = parse_opensky_state(states[0])
    fetched_at = pd.Timestamp.utcnow()
    if parsed.get("last_contact"):
        fetched_at = pd.to_datetime(parsed["last_contact"], unit="s", utc=True, errors="coerce")
        if pd.isna(fetched_at):
            fetched_at = pd.Timestamp.utcnow()

    parsed["fetched_at"] = fetched_at
    return parsed


def lookup_user_role(email):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
        SELECT role
        FROM users
        WHERE LOWER(email) = LOWER(%s)
          AND is_active = TRUE
        LIMIT 1;
    """
    cursor.execute(query, (email,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return None

    return row[0]


def lookup_user(email):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
        SELECT email, role, is_active
        FROM users
        WHERE LOWER(email) = LOWER(%s)
        LIMIT 1;
    """
    cursor.execute(query, (email,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return None

    return {
        "email": row[0],
        "role": row[1],
        "is_active": bool(row[2]),
    }


def upsert_user(email, role, is_active=True):
    conn = get_connection()
    cursor = conn.cursor()
    query = """
        INSERT INTO users (email, role, is_active)
        VALUES (%s, %s, %s)
        ON CONFLICT (email)
        DO UPDATE SET
            role = EXCLUDED.role,
            is_active = EXCLUDED.is_active;
    """
    cursor.execute(query, (email, role, is_active))
    conn.commit()
    cursor.close()
    conn.close()


def get_table_columns(table_name: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s;
        """,
        (table_name,),
    )
    cols = {row[0] for row in cursor.fetchall()}
    cursor.close()
    conn.close()
    return cols


def require_admin(request: Request):
    email = (request.headers.get("x-user-email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Missing X-User-Email header.")

    user = lookup_user(email)
    if not user or not user.get("is_active") or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    return email


def normalize_icao24(icao24):
    return str(icao24 or "").strip().lower()


def ensure_pilot_assignment_table():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS pilot_flight_assignments (
            pilot_email TEXT PRIMARY KEY,
            icao24 VARCHAR(32) NOT NULL,
            callsign TEXT,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.commit()
    cursor.close()
    conn.close()


def upsert_pilot_assignment(pilot_email, icao24, callsign=""):
    ensure_pilot_assignment_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO pilot_flight_assignments (pilot_email, icao24, callsign, updated_at)
        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (pilot_email)
        DO UPDATE SET
            icao24 = EXCLUDED.icao24,
            callsign = EXCLUDED.callsign,
            updated_at = CURRENT_TIMESTAMP;
        """,
        (pilot_email, normalize_icao24(icao24), (callsign or "").strip()),
    )
    conn.commit()
    cursor.close()
    conn.close()


def get_pilot_assignment(pilot_email):
    ensure_pilot_assignment_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT pilot_email, icao24, callsign, updated_at
        FROM pilot_flight_assignments
        WHERE LOWER(pilot_email) = LOWER(%s)
        LIMIT 1;
        """,
        (pilot_email,),
    )
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if not row:
        return None

    return {
        "pilotEmail": row[0],
        "icao24": row[1],
        "callsign": (row[2] or "").strip(),
        "updatedAt": row[3].isoformat() if row[3] else None,
    }


def list_pilot_assignments():
    ensure_pilot_assignment_table()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT pilot_email, icao24, callsign, updated_at
        FROM pilot_flight_assignments
        ORDER BY updated_at DESC;
        """
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    assignments = []
    for row in rows:
        assignments.append(
            {
                "pilotEmail": row[0],
                "icao24": row[1],
                "callsign": (row[2] or "").strip(),
                "updatedAt": row[3].isoformat() if row[3] else None,
            }
        )
    return assignments


def verify_google_token_and_get_email(token):
    verify_response = requests.get(
        "https://oauth2.googleapis.com/tokeninfo",
        params={"id_token": token},
        timeout=20,
    )

    if verify_response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token.")

    token_info = verify_response.json()
    email = token_info.get("email")

    if not email:
        raise HTTPException(status_code=401, detail="Google token missing email.")

    return email


def opensky_get(url, params=None):
    global OPENSKY_BACKOFF_UNTIL
    now = pd.Timestamp.utcnow()
    if OPENSKY_BACKOFF_UNTIL and now < OPENSKY_BACKOFF_UNTIL:
        raise HTTPException(
            status_code=429,
            detail=f"OpenSky rate-limited. Retry after {OPENSKY_BACKOFF_UNTIL.isoformat()}.",
        )

    access_token = get_access_token()
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers, params=params or {}, timeout=30)
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After")
        backoff_seconds = 60
        try:
            if retry_after:
                backoff_seconds = max(10, int(retry_after))
        except Exception:
            backoff_seconds = 60
        OPENSKY_BACKOFF_UNTIL = now + pd.Timedelta(seconds=backoff_seconds)
        raise HTTPException(
            status_code=429,
            detail=f"OpenSky rate-limited. Retry after {OPENSKY_BACKOFF_UNTIL.isoformat()}.",
        )
    response.raise_for_status()
    return response.json()


def aviationstack_get(path, params=None):
    if not AVIATIONSTACK_ACCESS_KEY:
        raise HTTPException(
            status_code=503,
            detail="Route provider is not configured. Set AVIATIONSTACK_ACCESS_KEY.",
        )

    global PROVIDER_BACKOFF_UNTIL
    global _LAST_AVIATIONSTACK_KEY
    now = pd.Timestamp.utcnow()

    # If the access key changes at runtime (common during dev), clear any old backoff
    # so a previously rate-limited key doesn't block the new one.
    if _LAST_AVIATIONSTACK_KEY != AVIATIONSTACK_ACCESS_KEY:
        _LAST_AVIATIONSTACK_KEY = AVIATIONSTACK_ACCESS_KEY
        PROVIDER_BACKOFF_UNTIL = None

    if PROVIDER_BACKOFF_UNTIL and now < PROVIDER_BACKOFF_UNTIL:
        raise HTTPException(
            status_code=429,
            detail=f"Route provider rate-limited. Retry after {PROVIDER_BACKOFF_UNTIL.isoformat()}.",
        )

    base_url = AVIATIONSTACK_BASE_URL.rstrip("/")
    query = {"access_key": AVIATIONSTACK_ACCESS_KEY}
    if params:
        query.update(params)

    response = requests.get(f"{base_url}/{path.lstrip('/')}", params=query, timeout=30)
    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After")
        backoff_seconds = 60
        try:
            if retry_after:
                backoff_seconds = max(10, int(retry_after))
        except Exception:
            backoff_seconds = 60
        PROVIDER_BACKOFF_UNTIL = now + pd.Timedelta(seconds=backoff_seconds)
        raise HTTPException(
            status_code=429,
            detail=f"Route provider rate-limited (429). Retry after {PROVIDER_BACKOFF_UNTIL.isoformat()}.",
        )
    response.raise_for_status()
    payload = response.json()
    error = payload.get("error")
    if error:
        message = error.get("message") or "Route provider request failed."
        raise HTTPException(status_code=502, detail=message)
    return payload


def normalize_callsign(callsign):
    return "".join(str(callsign or "").strip().upper().split())


def pick_first_nonempty(*values):
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def extract_airport_reference(block):
    block = block or {}
    return {
        "name": pick_first_nonempty(block.get("airport"), block.get("airport_name")),
        "iata": pick_first_nonempty(block.get("iata"), block.get("iataCode"), block.get("iata_code")),
        "icao": pick_first_nonempty(block.get("icao"), block.get("icaoCode"), block.get("icao_code")),
        "scheduled": pick_first_nonempty(block.get("scheduled"), block.get("scheduledTime")),
        "estimated": pick_first_nonempty(block.get("estimated"), block.get("estimatedTime")),
        "actual": pick_first_nonempty(block.get("actual"), block.get("actualTime")),
    }


def lookup_aviationstack_airport(icao_code="", iata_code=""):
    filters = {}
    if icao_code:
        filters["icao_code"] = icao_code
    elif iata_code:
        filters["iata_code"] = iata_code
    else:
        return None

    payload = aviationstack_get("airports", filters)
    for airport in payload.get("data") or []:
        lat = airport.get("latitude")
        lon = airport.get("longitude")
        try:
            latitude = float(lat)
            longitude = float(lon)
        except (TypeError, ValueError):
            latitude = None
            longitude = None

        return {
            "name": pick_first_nonempty(airport.get("airport_name")),
            "iata": pick_first_nonempty(airport.get("iata_code")),
            "icao": pick_first_nonempty(airport.get("icao_code")),
            "city": pick_first_nonempty(airport.get("city_iata_code"), airport.get("country_name")),
            "lat": latitude,
            "lon": longitude,
        }

    return None


def enrich_airport_reference(airport_ref):
    airport_ref = airport_ref or {}
    details = lookup_aviationstack_airport(
        icao_code=airport_ref.get("icao", ""),
        iata_code=airport_ref.get("iata", ""),
    )
    merged = {
        "name": airport_ref.get("name", ""),
        "iata": airport_ref.get("iata", ""),
        "icao": airport_ref.get("icao", ""),
        "scheduled": airport_ref.get("scheduled", ""),
        "estimated": airport_ref.get("estimated", ""),
        "actual": airport_ref.get("actual", ""),
        "city": "",
        "lat": None,
        "lon": None,
    }
    if details:
        merged["name"] = merged["name"] or details.get("name", "")
        merged["iata"] = merged["iata"] or details.get("iata", "")
        merged["icao"] = merged["icao"] or details.get("icao", "")
        merged["city"] = details.get("city", "")
        merged["lat"] = details.get("lat")
        merged["lon"] = details.get("lon")
    return merged


def rank_aviationstack_flights(flights, callsign):
    normalized_callsign = normalize_callsign(callsign)
    ranked = []
    for flight in flights or []:
        flight_block = flight.get("flight") or {}
        score = 0
        candidates = [
            flight_block.get("icao"),
            flight_block.get("icaoNumber"),
            flight_block.get("iata"),
            flight_block.get("iataNumber"),
        ]
        if any(normalize_callsign(candidate) == normalized_callsign for candidate in candidates):
            score += 100

        status = pick_first_nonempty(flight.get("flight_status"), flight.get("status")).lower()
        if status in {"active", "scheduled"}:
            score += 10
        if status == "landed":
            score += 5

        schedule_bias = pick_first_nonempty(
            (flight.get("departure") or {}).get("estimated"),
            (flight.get("departure") or {}).get("scheduled"),
            (flight.get("arrival") or {}).get("estimated"),
            (flight.get("arrival") or {}).get("scheduled"),
        )
        ranked.append((score, schedule_bias, flight))

    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in ranked]


def lookup_route_by_callsign(callsign):
    normalized_callsign = normalize_callsign(callsign)
    if not normalized_callsign:
        raise HTTPException(status_code=400, detail="Callsign is required.")

    payload = aviationstack_get("flights", {"flight_icao": normalized_callsign, "limit": 5})
    matches = rank_aviationstack_flights(payload.get("data") or [], normalized_callsign)
    if not matches:
        raise HTTPException(status_code=404, detail=f"No route data found for {normalized_callsign}.")

    selected = matches[0]
    departure = enrich_airport_reference(extract_airport_reference(selected.get("departure")))
    arrival = enrich_airport_reference(extract_airport_reference(selected.get("arrival")))
    airline = selected.get("airline") or {}
    flight_block = selected.get("flight") or {}

    return {
        "provider": "aviationstack",
        "callsign": normalized_callsign,
        "flightStatus": pick_first_nonempty(selected.get("flight_status"), selected.get("status")),
        "airline": {
            "name": pick_first_nonempty(airline.get("name")),
            "iata": pick_first_nonempty(airline.get("iata"), airline.get("iataCode")),
            "icao": pick_first_nonempty(airline.get("icao"), airline.get("icaoCode")),
        },
        "flight": {
            "number": pick_first_nonempty(flight_block.get("number")),
            "iata": pick_first_nonempty(flight_block.get("iata"), flight_block.get("iataNumber")),
            "icao": pick_first_nonempty(flight_block.get("icao"), flight_block.get("icaoNumber")),
        },
        "departure": departure,
        "arrival": arrival,
        "rawMatchCount": len(matches),
    }


def get_cached_route_by_callsign(callsign, max_age_seconds=ROUTE_CACHE_TTL_SECONDS, allow_fetch=True):
    normalized_callsign = normalize_callsign(callsign)
    if not normalized_callsign:
        return None

    cached = ROUTE_CACHE.get(normalized_callsign)
    now = pd.Timestamp.utcnow()
    if cached:
        age_seconds = (now - cached["stored_at"]).total_seconds()
        if age_seconds <= max_age_seconds:
            return cached["payload"]

    if not allow_fetch:
        return None

    payload = lookup_route_by_callsign(normalized_callsign)
    ROUTE_CACHE[normalized_callsign] = {
        "stored_at": now,
        "payload": payload,
    }
    return payload


def route_matches_query(route_payload, origin="", destination=""):
    origin_query = str(origin or "").strip().upper()
    destination_query = str(destination or "").strip().upper()
    departure = route_payload.get("departure") or {}
    arrival = route_payload.get("arrival") or {}

    def matches_airport(airport_data, query):
        if not query:
            return True

        candidates = [
            airport_data.get("icao", ""),
            airport_data.get("iata", ""),
            airport_data.get("city", ""),
            airport_data.get("name", ""),
        ]
        normalized_candidates = [str(candidate or "").strip().upper() for candidate in candidates]
        return any(query == candidate or query in candidate for candidate in normalized_candidates if candidate)

    return matches_airport(departure, origin_query) and matches_airport(arrival, destination_query)


def build_live_route_flights(origin="", destination="", scan_limit=80, match_limit=20, allow_fetch=True):
    pipeline_payload = run_live_pipeline(db_limit=5000, display_limit=scan_limit)
    matches = []
    skipped_no_callsign = 0
    skipped_not_cached_or_failed = 0

    for flight in pipeline_payload.get("flights") or []:
        callsign = str(flight.get("callsign") or "").strip()
        if not callsign or callsign == "N/A":
            skipped_no_callsign += 1
            continue

        try:
            route_payload = get_cached_route_by_callsign(callsign, allow_fetch=allow_fetch)
        except HTTPException:
            skipped_not_cached_or_failed += 1
            continue
        except Exception:
            skipped_not_cached_or_failed += 1
            continue
        if not route_payload:
            skipped_not_cached_or_failed += 1
            continue

        if not route_matches_query(route_payload, origin=origin, destination=destination):
            continue

        matches.append(
            {
                **flight,
                "route": {
                    "provider": route_payload.get("provider"),
                    "flightStatus": route_payload.get("flightStatus"),
                    "departure": route_payload.get("departure"),
                    "arrival": route_payload.get("arrival"),
                },
            }
        )

        if len(matches) >= match_limit:
            break

    return {
        "origin": origin,
        "destination": destination,
        "flights": matches,
        "stats": {
            "scanned": int(len(pipeline_payload.get("flights") or [])),
            "matched": int(len(matches)),
            "skippedNoCallsign": int(skipped_no_callsign),
            "skippedRouteLookup": int(skipped_not_cached_or_failed),
        },
        "source": "pipeline-live-route-filter",
        "fetchedAt": pd.Timestamp.utcnow().isoformat(),
    }


def airport_option_from_route(airport):
    airport = airport or {}
    code = pick_first_nonempty(airport.get("icao"), airport.get("iata"))
    name = pick_first_nonempty(airport.get("name"))
    city = pick_first_nonempty(airport.get("city"))
    if not code:
        return None

    return {
        "code": code,
        "icao": pick_first_nonempty(airport.get("icao")),
        "iata": pick_first_nonempty(airport.get("iata")),
        "name": name,
        "city": city,
        "label": " - ".join(
            [part for part in [city, name] if part]
        ) + (f" ({code})" if code else ""),
    }


def build_live_route_options(scan_limit=80, option_limit=30):
    # Important: do NOT call the provider here. This endpoint must be cheap and rely only on cached routes.
    payload = build_live_route_flights(
        origin="",
        destination="",
        scan_limit=scan_limit,
        match_limit=scan_limit,
        allow_fetch=False,
    )
    origin_map = {}
    destination_map = {}

    for flight in payload.get("flights") or []:
        route = flight.get("route") or {}
        origin_option = airport_option_from_route(route.get("departure"))
        destination_option = airport_option_from_route(route.get("arrival"))
        if origin_option and origin_option["code"] not in origin_map:
            origin_map[origin_option["code"]] = origin_option
        if destination_option and destination_option["code"] not in destination_map:
            destination_map[destination_option["code"]] = destination_option

    origins = sorted(origin_map.values(), key=lambda item: item["label"])[:option_limit]
    destinations = sorted(destination_map.values(), key=lambda item: item["label"])[:option_limit]

    return {
        "origins": origins,
        "destinations": destinations,
        "flights": payload.get("flights") or [],
        "stats": payload.get("stats") or {},
        "source": "pipeline-live-route-options",
        "fetchedAt": payload.get("fetchedAt"),
    }


def level_name(level):
    mapping = {0: "Calm", 1: "Light", 2: "Moderate", 3: "Severe"}
    return mapping.get(int(level), "Unknown")


def summarize_levels(level_series):
    counts = level_series.value_counts().reindex([0, 1, 2, 3], fill_value=0)
    return [
        {"level": "Calm", "value": int(counts.loc[0]), "color": "#2dd4bf"},
        {"level": "Light", "value": int(counts.loc[1]), "color": "#f59e0b"},
        {"level": "Moderate", "value": int(counts.loc[2]), "color": "#fb7185"},
        {"level": "Severe", "value": int(counts.loc[3]), "color": "#ef4444"},
    ]


def build_future_risk(df):
    total = max(1, len(df))
    severe_ratio = (df["future_prediction"] == 3).sum() / total
    return [
        {"window": "T+2 steps", "severeRisk": float(severe_ratio), "confidence": 0.82},
        {"window": "T+5 steps", "severeRisk": float(min(0.95, severe_ratio + 0.06)), "confidence": 0.76},
        {"window": "T+10 steps", "severeRisk": float(min(0.95, severe_ratio + 0.12)), "confidence": 0.70},
    ]


def build_turbulence_alert_payload(latest_per_icao):
    if latest_per_icao.empty:
        return None

    ranked = latest_per_icao.copy()
    if "future_prob_2" not in ranked.columns:
        ranked["future_prob_2"] = 0.0
    if "future_prob_3" not in ranked.columns:
        ranked["future_prob_3"] = 0.0

    ranked["turbulence_probability"] = ranked["future_prob_2"] + ranked["future_prob_3"]
    ranked = ranked.sort_values("turbulence_probability", ascending=False)
    top_row = ranked.iloc[0]
    top_probability = float(top_row.get("turbulence_probability", 0.0))

    if top_probability <= 0.7:
        return None

    severe_probability = float(top_row.get("future_prob_3", 0.0))
    severity = "severe" if severe_probability >= 0.4 else "moderate"
    callsign = str((top_row.get("callsign") or "N/A")).strip()
    flight_id = str(top_row.get("icao24", "unknown"))

    return {
        "type": "turbulence_alert",
        "severity": severity,
        "eta_minutes": 3,
        "message": (
            f"{severity.title()} turbulence expected for {callsign or flight_id}. "
            "Please fasten seatbelts."
        ),
        "flight_id": flight_id,
        "probability": round(top_probability, 3),
    }


def build_inference_features(df):
    enriched = df.copy()
    enriched["fetched_at"] = pd.to_datetime(enriched["fetched_at"], errors="coerce")
    enriched = enriched.dropna(subset=["fetched_at"])
    enriched = enriched.sort_values(["icao24", "fetched_at"])

    enriched["abs_vertical_rate"] = enriched["vertical_rate"].abs()
    enriched["speed_altitude_ratio"] = enriched["velocity"] / (enriched["baro_altitude"] + 1)
    enriched["altitude_km"] = enriched["baro_altitude"] / 1000

    enriched["time_diff"] = (
        enriched.groupby("icao24")["fetched_at"].diff().dt.total_seconds()
    )
    enriched["vertical_rate_diff"] = enriched.groupby("icao24")["vertical_rate"].diff()
    enriched["velocity_diff"] = enriched.groupby("icao24")["velocity"].diff()

    enriched["vertical_acceleration"] = enriched["vertical_rate_diff"] / enriched["time_diff"]
    enriched["velocity_acceleration"] = enriched["velocity_diff"] / enriched["time_diff"]

    enriched["vertical_rate_std_3"] = (
        enriched.groupby("icao24")["vertical_rate"]
        .rolling(3, min_periods=2)
        .std()
        .reset_index(level=0, drop=True)
    )
    enriched["velocity_std_3"] = (
        enriched.groupby("icao24")["velocity"]
        .rolling(3, min_periods=2)
        .std()
        .reset_index(level=0, drop=True)
    )

    enriched = enriched.replace([np.inf, -np.inf], np.nan)
    return enriched


def run_live_pipeline(db_limit=5000, display_limit=120, fetch_live=True):
    live_count = 0
    live_fetch_status = "skipped"
    if fetch_live:
        try:
            live_count = fetch_and_store_live_states()
            live_fetch_status = "ok" if live_count else "ok-empty"
        except HTTPException as exc:
            if exc.status_code == 429:
                live_fetch_status = "rate_limited"
                live_count = 0
            else:
                live_fetch_status = f"error:{exc.status_code}"
                live_count = 0
        except Exception:
            live_fetch_status = "error"
            live_count = 0

    raw_df = fetch_latest_batch(limit=db_limit)

    if raw_df.empty:
        raise ValueError("No rows available in planes_table. Live fetch may be rate-limited.")

    processed_df = clean_dataframe(raw_df)
    processed_df = build_inference_features(processed_df)

    if processed_df.empty:
        raise ValueError("No rows available after preprocessing.")

    model, future_model = get_models()
    current_features = list(getattr(model, "feature_names_in_", FEATURE_COLUMNS))
    future_features = list(getattr(future_model, "feature_names_in_", FEATURE_COLUMNS))
    all_features = sorted(set(current_features + future_features))

    for feature in all_features:
        if feature not in processed_df.columns:
            processed_df[feature] = 0.0
        processed_df[feature] = pd.to_numeric(processed_df[feature], errors="coerce")
        processed_df[feature] = processed_df[feature].fillna(0.0)

    X_current = processed_df[current_features]
    X_future = processed_df[future_features]

    predictions = model.predict(X_current)
    probabilities = model.predict_proba(X_current)
    future_predictions = future_model.predict(X_future)
    future_probabilities = future_model.predict_proba(X_future)

    processed_df["prediction"] = predictions.astype(int)
    processed_df["confidence"] = probabilities.max(axis=1).astype(float)
    processed_df["future_prediction"] = future_predictions.astype(int)
    processed_df["future_confidence"] = future_probabilities.max(axis=1).astype(float)
    for index, class_label in enumerate(getattr(future_model, "classes_", [])):
        processed_df[f"future_prob_{int(class_label)}"] = future_probabilities[:, index].astype(float)

    latest_per_icao = (
        processed_df.sort_values("fetched_at")
        .groupby("icao24", as_index=False)
        .tail(1)
        .sort_values("fetched_at", ascending=False)
    )

    insert_predictions(latest_per_icao[["icao24", "prediction", "confidence"]])
    alert_payload = build_turbulence_alert_payload(latest_per_icao)
    if alert_payload:
        dispatch_alert(alert_payload, dedupe_seconds=45)

    display_df = latest_per_icao.head(display_limit).copy()

    flights = []
    for _, row in display_df.iterrows():
        flights.append(
            {
                "icao24": str(row.get("icao24", "unknown")),
                "callsign": str((row.get("callsign") or "N/A")).strip(),
                "altitude": float(row.get("baro_altitude", 0) or 0),
                "velocity": float(row.get("velocity", 0) or 0),
                "verticalRate": float(row.get("vertical_rate", 0) or 0),
                "currentLevel": int(row.get("prediction", 0)),
                "predictedLevel": int(row.get("future_prediction", 0)),
                "confidence": float(row.get("future_confidence", 0)),
                "currentLabel": level_name(row.get("prediction", 0)),
                "futureLabel": level_name(row.get("future_prediction", 0)),
            }
        )

    return {
        "summary": {
            "rowsInLastBatch": int(len(raw_df)),
            "activeAircraft": int(len(latest_per_icao)),
            "predictionCount": int(len(latest_per_icao)),
            "modelName": "turbulence_model.pkl",
            "futureModelName": "future_turbulence_model.pkl",
            "liveStatesFetched": int(live_count),
            "liveFetchStatus": live_fetch_status,
        },
        "turbulenceSplit": summarize_levels(latest_per_icao["prediction"]),
        "futureRisk": build_future_risk(latest_per_icao),
        "flights": flights,
        "source": "pipeline-live" if fetch_live and live_fetch_status.startswith("ok") else "pipeline-cached",
        "fetchedAt": pd.Timestamp.utcnow().isoformat(),
    }


def build_flight_response_from_row(row):
    return {
        "icao24": str(row.get("icao24", "unknown")),
        "callsign": str((row.get("callsign") or "N/A")).strip(),
        "altitude": float(row.get("baro_altitude", 0) or 0),
        "velocity": float(row.get("velocity", 0) or 0),
        "verticalRate": float(row.get("vertical_rate", 0) or 0),
        "currentLevel": int(row.get("prediction", 0)),
        "predictedLevel": int(row.get("future_prediction", 0)),
        "confidence": float(row.get("future_confidence", row.get("confidence", 0)) or 0),
        "currentLabel": level_name(row.get("prediction", 0)),
        "futureLabel": level_name(row.get("future_prediction", 0)),
    }


def get_latest_known_flight_payload(icao24, history_limit=200):
    normalized_icao24 = normalize_icao24(icao24)
    raw_df = fetch_recent_rows_for_icao24(normalized_icao24, limit=history_limit)
    direct_state = None

    try:
        direct_state = fetch_direct_opensky_state(normalized_icao24)
    except Exception:
        direct_state = None

    if direct_state is not None:
        direct_df = pd.DataFrame([direct_state])
        raw_df = pd.concat([direct_df, raw_df], ignore_index=True, sort=False)

    if raw_df.empty:
        raise HTTPException(status_code=404, detail=f"Flight {normalized_icao24} was not found.")

    processed_df = clean_dataframe(raw_df)
    processed_df = build_inference_features(processed_df)

    if processed_df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"Flight {normalized_icao24} has no usable telemetry for prediction.",
        )

    model, future_model = get_models()
    current_features = list(getattr(model, "feature_names_in_", FEATURE_COLUMNS))
    future_features = list(getattr(future_model, "feature_names_in_", FEATURE_COLUMNS))
    all_features = sorted(set(current_features + future_features))

    for feature in all_features:
        if feature not in processed_df.columns:
            processed_df[feature] = 0.0
        processed_df[feature] = pd.to_numeric(processed_df[feature], errors="coerce")
        processed_df[feature] = processed_df[feature].fillna(0.0)

    processed_df["prediction"] = model.predict(processed_df[current_features]).astype(int)
    processed_df["confidence"] = model.predict_proba(processed_df[current_features]).max(axis=1).astype(float)
    processed_df["future_prediction"] = future_model.predict(processed_df[future_features]).astype(int)
    processed_df["future_confidence"] = (
        future_model.predict_proba(processed_df[future_features]).max(axis=1).astype(float)
    )

    latest_row = (
        processed_df.sort_values("fetched_at")
        .groupby("icao24", as_index=False)
        .tail(1)
        .iloc[0]
    )

    return {
        "flight": build_flight_response_from_row(latest_row),
        "fetchedAt": pd.Timestamp.utcnow().isoformat(),
        "source": "pipeline-direct-state" if direct_state is not None else "pipeline-fallback-history",
        "summary": {
            "rowsInLastBatch": int(len(raw_df)),
            "activeAircraft": 1,
            "predictionCount": 1,
            "modelName": "turbulence_model.pkl",
            "futureModelName": "future_turbulence_model.pkl",
            "liveStatesFetched": 1 if direct_state is not None else 0,
        },
    }


def get_flight_payload(icao24, db_limit=5000):
    normalized_icao24 = normalize_icao24(icao24)
    # Avoid hammering OpenSky on every request; use the latest stored telemetry and fall back to history.
    pipeline_payload = run_live_pipeline(db_limit=db_limit, display_limit=db_limit, fetch_live=False)
    flights = pipeline_payload.get("flights") or []
    selected_flight = next(
        (flight for flight in flights if normalize_icao24(flight.get("icao24")) == normalized_icao24),
        None,
    )

    if not selected_flight:
        return get_latest_known_flight_payload(normalized_icao24)

    return {
        "flight": selected_flight,
        "fetchedAt": pipeline_payload.get("fetchedAt"),
        "source": pipeline_payload.get("source"),
        "summary": pipeline_payload.get("summary"),
    }


def build_flight_lookup(flights):
    lookup = {}
    for flight in flights or []:
        lookup[normalize_icao24(flight.get("icao24"))] = flight
    return lookup


@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await room_manager.connect(websocket, room_code)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        room_manager.disconnect(websocket, room_code)


@app.post("/api/alerts/broadcast/{room_code}")
async def broadcast_alert(room_code: str, payload: dict):
    return await room_manager.broadcast(room_code, payload)


@app.get("/api/rooms/{room_code}/status")
async def room_status(room_code: str):
    return room_manager.get_status(room_code)


@app.post("/api/auth/google")
def auth_google(payload: GoogleAuthRequest):
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Google token is required.")

    email = verify_google_token_and_get_email(token)

    role = lookup_user_role(email)
    if not role:
        raise HTTPException(
            status_code=403,
            detail="User is not authorized. Ask admin to add your email in users table.",
        )

    app_token = secrets.token_urlsafe(32)
    return {
        "email": email,
        "role": role,
        "token": app_token,
    }


@app.post("/api/auth/google-signup")
def auth_google_signup(payload: GoogleSignupRequest):
    token = (payload.token or "").strip()
    role = (payload.role or "").strip().lower()
    allowed_roles = {"passenger", "pilot", "admin"}

    if not token:
        raise HTTPException(status_code=400, detail="Google token is required.")
    if role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role. Use passenger, pilot, or admin.")

    email = verify_google_token_and_get_email(token)
    existing_user = lookup_user(email)

    if existing_user and existing_user.get("is_active"):
        assigned_role = existing_user["role"]
    else:
        upsert_user(email, role, True)
        assigned_role = role

    app_token = secrets.token_urlsafe(32)
    return {
        "email": email,
        "role": assigned_role,
        "token": app_token,
    }


@app.get("/api/admin/users")
def admin_list_users(request: Request, include_inactive: bool = True, limit: int = 500):
    require_admin(request)

    limit = max(1, min(int(limit or 500), 2000))
    columns = get_table_columns("users")
    if not columns:
        raise HTTPException(status_code=503, detail="users table not found.")

    select_cols = ["email", "role"]
    if "is_active" in columns:
        select_cols.append("is_active")
    if "created_at" in columns:
        select_cols.append("created_at")

    where_clause = ""
    if (not include_inactive) and ("is_active" in columns):
        where_clause = "WHERE is_active = TRUE"

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"""
        SELECT {", ".join(select_cols)}
        FROM users
        {where_clause}
        ORDER BY LOWER(email) ASC
        LIMIT %s;
        """,
        (limit,),
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    users = []
    for row in rows:
        item = {
            "email": row[0],
            "role": row[1],
            "is_active": bool(row[2]) if "is_active" in columns else True,
        }
        if "created_at" in columns:
            created_index = select_cols.index("created_at")
            created_at = row[created_index]
            item["created_at"] = created_at.isoformat() if created_at else None
        users.append(item)

    return {
        "users": users,
        "count": len(users),
        "fetchedAt": pd.Timestamp.utcnow().isoformat(),
    }


@app.delete("/api/admin/users/{email}")
def admin_delete_user(email: str, request: Request):
    requester = require_admin(request)
    target = (email or "").strip().lower()

    if not target:
        raise HTTPException(status_code=400, detail="User email is required.")
    if target == requester:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")

    columns = get_table_columns("users")
    if not columns:
        raise HTTPException(status_code=503, detail="users table not found.")

    conn = get_connection()
    cursor = conn.cursor()

    if "is_active" in columns:
        cursor.execute(
            """
            UPDATE users
            SET is_active = FALSE
            WHERE LOWER(email) = LOWER(%s)
            RETURNING email, role, is_active;
            """,
            (target,),
        )
        row = cursor.fetchone()
        conn.commit()
        cursor.close()
        conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="User not found.")

        return {
            "message": "User deactivated.",
            "user": {"email": row[0], "role": row[1], "is_active": bool(row[2])},
        }

    cursor.execute(
        """
        DELETE FROM users
        WHERE LOWER(email) = LOWER(%s)
        RETURNING email, role;
        """,
        (target,),
    )
    row = cursor.fetchone()
    conn.commit()
    cursor.close()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "message": "User deleted.",
        "user": {"email": row[0], "role": row[1], "is_active": False},
    }


def continent_from_lat_lon(lat: float, lon: float):
    if lat is None or lon is None:
        return "Unknown"

    lat = float(lat)
    lon = float(lon)

    if lat <= -60:
        return "Antarctica"
    if 7 <= lat <= 83 and -168 <= lon <= -52:
        return "North America"
    if -56 <= lat <= 13 and -82 <= lon <= -34:
        return "South America"
    if 35 <= lat <= 71 and -25 <= lon <= 45:
        return "Europe"
    if -35 <= lat <= 37 and -17 <= lon <= 51:
        return "Africa"
    if 5 <= lat <= 77 and 45 <= lon <= 180:
        return "Asia"
    if -50 <= lat <= 10 and 110 <= lon <= 180:
        return "Oceania"
    return "Other"


@app.get("/api/admin/analytics/turbulence")
def admin_turbulence_analytics(
    request: Request,
    max_cells: int = 900,
    grid_deg: int = 5,
    since_minutes: int = 360,
):
    require_admin(request)

    max_cells = max(50, min(int(max_cells or 900), 2500))
    grid_deg = max(1, min(int(grid_deg or 5), 15))
    since_minutes = max(0, min(int(since_minutes or 0), 7 * 24 * 60))

    pred_cols = get_table_columns("predictions")
    if not pred_cols:
        raise HTTPException(status_code=503, detail="predictions table not found.")

    state_cols = get_table_columns("planes_table")
    if not state_cols:
        raise HTTPException(status_code=503, detail="planes_table not found.")

    level_col = "predicted_turbulence" if "predicted_turbulence" in pred_cols else "prediction"
    if level_col not in pred_cols:
        raise HTTPException(status_code=500, detail="predictions table is missing turbulence level column.")

    conf_col = "confidence" if "confidence" in pred_cols else None

    time_col = None
    for candidate in ("created_at", "predicted_at", "inserted_at", "timestamp"):
        if candidate in pred_cols:
            time_col = candidate
            break

    id_col = "id" if "id" in pred_cols else None

    order_terms = []
    if time_col:
        order_terms.append(f"{time_col} DESC NULLS LAST")
    if id_col:
        order_terms.append(f"{id_col} DESC NULLS LAST")
    if conf_col:
        order_terms.append(f"{conf_col} DESC NULLS LAST")
    if not order_terms:
        order_terms.append(f"{level_col} DESC NULLS LAST")

    where_terms = []
    if since_minutes and time_col:
        where_terms.append(f"{time_col} >= NOW() - INTERVAL '{int(since_minutes)} minutes'")

    where_sql = f"WHERE {' AND '.join(where_terms)}" if where_terms else ""

    fetch_limit = min(12000, max(2500, max_cells * 20))

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"""
        WITH latest_pred AS (
            SELECT DISTINCT ON (LOWER(icao24))
                icao24,
                {level_col} AS level
                {"," if conf_col else ""}
                {conf_col + " AS confidence" if conf_col else ""}
            FROM predictions
            {where_sql}
            ORDER BY LOWER(icao24), {", ".join(order_terms)}
        ),
        latest_state AS (
            SELECT DISTINCT ON (LOWER(icao24))
                icao24,
                latitude,
                longitude,
                origin_country,
                fetched_at
            FROM planes_table
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            ORDER BY LOWER(icao24), fetched_at DESC
        )
        SELECT
            s.latitude,
            s.longitude,
            s.origin_country,
            p.level
            {"," if conf_col else ""}
            {"p.confidence" if conf_col else ""}
        FROM latest_pred p
        JOIN latest_state s
          ON LOWER(s.icao24) = LOWER(p.icao24)
        WHERE p.level IS NOT NULL
        LIMIT %s;
        """,
        (fetch_limit,),
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    points = []
    level_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    continents = {}

    for row in rows:
        lat = row[0]
        lon = row[1]
        country = row[2]
        level = int(row[3]) if row[3] is not None else 0
        confidence = float(row[4]) if conf_col and row[4] is not None else None

        try:
            lat = float(lat)
            lon = float(lon)
        except Exception:
            continue
        if not (math.isfinite(lat) and math.isfinite(lon)):
            continue

        level = max(0, min(level, 3))
        level_counts[level] = level_counts.get(level, 0) + 1

        continent = continent_from_lat_lon(lat, lon)
        if continent not in continents:
            continents[continent] = {"count": 0, "level_sum": 0.0, "severe": 0}
        continents[continent]["count"] += 1
        continents[continent]["level_sum"] += float(level)
        continents[continent]["severe"] += 1 if level == 3 else 0

        points.append(
            {
                "lat": lat,
                "lon": lon,
                "level": level,
                "confidence": confidence,
                "continent": continent,
                "country": country,
            }
        )

    grid = {}

    def bin_center(value: float, size: int):
        return (np.floor(value / size) * size) + (size / 2.0)

    for point in points:
        level = point["level"]
        conf = point.get("confidence")
        weight = (level / 3.0) * (0.55 + 0.45 * float(conf)) if conf is not None else (level / 3.0)

        lat_c = bin_center(point["lat"], grid_deg)
        lon_c = bin_center(point["lon"], grid_deg)
        key = (float(lat_c), float(lon_c))
        if key not in grid:
            grid[key] = {"count": 0, "weight_sum": 0.0, "level_sum": 0.0, "severe": 0}

        grid[key]["count"] += 1
        grid[key]["weight_sum"] += float(weight)
        grid[key]["level_sum"] += float(level)
        grid[key]["severe"] += 1 if level == 3 else 0

    cells = []
    for (lat_c, lon_c), agg in grid.items():
        count = int(agg["count"])
        if count <= 0:
            continue
        avg_level = agg["level_sum"] / count
        intensity = agg["weight_sum"] / count
        severe_pct = agg["severe"] / count
        cells.append(
            {
                "lat": lat_c,
                "lon": lon_c,
                "count": count,
                "avgLevel": round(float(avg_level), 3),
                "intensity": round(float(intensity), 4),
                "severePct": round(float(severe_pct), 4),
                "continent": continent_from_lat_lon(lat_c, lon_c),
            }
        )

    cells = sorted(cells, key=lambda item: (item["intensity"], item["count"]), reverse=True)[:max_cells]

    continent_stats = []
    for name, agg in continents.items():
        count = int(agg["count"])
        if count <= 0:
            continue
        continent_stats.append(
            {
                "continent": name,
                "count": count,
                "avgLevel": round(float(agg["level_sum"] / count), 3),
                "severePct": round(float(agg["severe"] / count), 4),
            }
        )
    continent_stats = sorted(continent_stats, key=lambda item: item["count"], reverse=True)

    return {
        "gridDeg": grid_deg,
        "cells": cells,
        "levelSplit": [
            {"level": "Calm", "value": int(level_counts.get(0, 0)), "color": "#2dd4bf"},
            {"level": "Light", "value": int(level_counts.get(1, 0)), "color": "#f59e0b"},
            {"level": "Moderate", "value": int(level_counts.get(2, 0)), "color": "#fb7185"},
            {"level": "Severe", "value": int(level_counts.get(3, 0)), "color": "#ef4444"},
        ],
        "continentStats": continent_stats,
        "pointsSampled": len(points),
        "source": "db",
        "fetchedAt": pd.Timestamp.utcnow().isoformat(),
    }


@app.post("/api/pipeline/run-live")
def run_pipeline(db_limit: int = 5000, display_limit: int = 120):
    try:
        return run_live_pipeline(db_limit=db_limit, display_limit=display_limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/pipeline/flight/{icao24}/live")
def run_flight_pipeline(icao24: str, db_limit: int = 5000):
    try:
        return get_flight_payload(icao24=icao24, db_limit=db_limit)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/pilot/assign-flight")
def assign_pilot_flight(payload: PilotFlightAssignmentRequest):
    pilot_email = (payload.pilot_email or "").strip().lower()
    icao24 = normalize_icao24(payload.icao24)

    if not pilot_email:
        raise HTTPException(status_code=400, detail="Pilot email is required.")
    if not icao24:
        raise HTTPException(status_code=400, detail="Flight ICAO24 is required.")

    user = lookup_user(pilot_email)
    if not user or not user.get("is_active") or user.get("role") != "pilot":
        raise HTTPException(status_code=403, detail="Only active pilot accounts can assign a flight.")

    flight_payload = get_flight_payload(icao24=icao24)
    selected_flight = flight_payload["flight"]
    upsert_pilot_assignment(
        pilot_email=pilot_email,
        icao24=selected_flight["icao24"],
        callsign=selected_flight.get("callsign", ""),
    )

    assignment = get_pilot_assignment(pilot_email)
    return {
        "message": "Pilot flight assignment saved.",
        "assignment": assignment,
        "flight": selected_flight,
    }


@app.get("/api/pilot/assign-flight/{pilot_email}")
def fetch_pilot_flight_assignment(pilot_email: str):
    assignment = get_pilot_assignment(pilot_email)
    if not assignment:
        return {"assignment": None}
    return {"assignment": assignment}


@app.get("/api/pilot/shared-flights")
def fetch_shared_pilot_flights():
    assignments = list_pilot_assignments()
    if not assignments:
        return {"sharedFlights": []}

    # This endpoint is hit frequently by passengers; do not perform a live OpenSky fetch here.
    pipeline_payload = run_live_pipeline(db_limit=5000, display_limit=5000, fetch_live=False)
    flight_lookup = build_flight_lookup(pipeline_payload.get("flights"))
    shared_flights = []

    for assignment in assignments:
        flight = flight_lookup.get(normalize_icao24(assignment["icao24"]))
        source = pipeline_payload.get("source")
        fetched_at = pipeline_payload.get("fetchedAt")
        route = None

        if not flight:
            try:
                fallback_payload = get_latest_known_flight_payload(assignment["icao24"])
                flight = fallback_payload.get("flight")
                source = fallback_payload.get("source")
                fetched_at = fallback_payload.get("fetchedAt")
            except HTTPException:
                flight = None

        callsign = ""
        if flight:
            callsign = str(flight.get("callsign") or "").strip()
        if not callsign:
            callsign = str(assignment.get("callsign") or "").strip()
        if callsign and callsign != "N/A":
            try:
                route = get_cached_route_by_callsign(callsign)
            except HTTPException:
                route = None
            except Exception:
                route = None

        shared_flights.append(
            {
                **assignment,
                "flight": flight,
                "route": route,
                "fetchedAt": fetched_at,
                "source": source,
            }
        )

    return {"sharedFlights": shared_flights}


@app.get("/api/opensky/flights/departure")
def opensky_departures(airport: str, begin: int, end: int):
    try:
        data = opensky_get(
            "https://opensky-network.org/api/flights/departure",
            params={"airport": airport, "begin": begin, "end": end},
        )
        return {"flights": data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/opensky/tracks")
def opensky_tracks(icao24: str, time: int = 0):
    try:
        data = opensky_get(
            "https://opensky-network.org/api/tracks/all",
            params={"icao24": icao24, "time": time},
        )
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/opensky/states/{icao24}")
def opensky_state(icao24: str):
    try:
        data = opensky_get(
            "https://opensky-network.org/api/states/all",
            params={"icao24": icao24},
        )
        states = data.get("states") or []
        if not states:
            fallback = fetch_latest_db_state_for_icao24(icao24)
            return {"state": fallback}

        state = states[0]
        return {
            "state": parse_opensky_state(state)
        }
    except HTTPException as exc:
        # When OpenSky is rate-limiting or unreachable, serve the latest stored telemetry instead.
        fallback = fetch_latest_db_state_for_icao24(icao24)
        if fallback is not None:
            return {"state": fallback}
        raise exc
    except Exception as exc:
        fallback = fetch_latest_db_state_for_icao24(icao24)
        if fallback is not None:
            return {"state": fallback}
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/routes/by-callsign/{callsign}")
def get_route_by_callsign(callsign: str):
    try:
        return get_cached_route_by_callsign(callsign)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/routes/live-flights")
def get_live_route_flights(origin: str = "", destination: str = "", scan_limit: int = 80, match_limit: int = 20):
    try:
        return build_live_route_flights(
            origin=origin,
            destination=destination,
            scan_limit=max(1, min(scan_limit, 120)),
            match_limit=max(1, min(match_limit, 30)),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/routes/live-options")
def get_live_route_options(scan_limit: int = 80, option_limit: int = 30):
    try:
        return build_live_route_options(
            scan_limit=max(1, min(scan_limit, 120)),
            option_limit=max(1, min(option_limit, 50)),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
def serve_frontend_root():
    if FRONTEND_INDEX_FILE.exists():
        return FileResponse(FRONTEND_INDEX_FILE)
    return JSONResponse(
        status_code=503,
        content={"detail": "Frontend build not found. Run 'npm run build' in frontend/."},
    )


@app.get("/{full_path:path}")
def serve_frontend_app(full_path: str):
    if full_path.startswith(("api/", "ws/", "docs", "openapi.json", "redoc", "assets/")):
        raise HTTPException(status_code=404, detail="Not found.")

    if FRONTEND_INDEX_FILE.exists():
        return FileResponse(FRONTEND_INDEX_FILE)

    return JSONResponse(
        status_code=503,
        content={"detail": "Frontend build not found. Run 'npm run build' in frontend/."},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
