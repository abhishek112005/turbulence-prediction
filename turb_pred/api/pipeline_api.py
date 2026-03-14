import joblib
import numpy as np
import os
import pandas as pd
import requests
import secrets
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.auth import get_access_token
from database.db_connection import get_connection
from database.insert_planes import insert_planes
from predictions.predict_live import insert_predictions
from preprocessing.feature_engineering import clean_dataframe


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


def load_allowed_origins():
    raw_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
    if raw_origins.strip():
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    return ["http://localhost:5173", "http://127.0.0.1:5173"]


app = FastAPI(title="Turbulence Pipeline API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=load_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_current_model = None
_future_model = None


class GoogleAuthRequest(BaseModel):
    token: str


class GoogleSignupRequest(BaseModel):
    token: str
    role: str


def get_models():
    global _current_model
    global _future_model

    if _current_model is None:
        _current_model = joblib.load(CURRENT_MODEL_PATH)
    if _future_model is None:
        _future_model = joblib.load(FUTURE_MODEL_PATH)

    return _current_model, _future_model


def fetch_and_store_live_states():
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get("https://opensky-network.org/api/states/all", headers=headers, timeout=30)
    response.raise_for_status()
    payload = response.json()
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
    access_token = get_access_token()
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers, params=params or {}, timeout=30)
    response.raise_for_status()
    return response.json()


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


def run_live_pipeline(db_limit=5000, display_limit=120):
    live_count = fetch_and_store_live_states()
    raw_df = fetch_latest_batch(limit=db_limit)

    if raw_df.empty:
        raise ValueError("No rows available in planes_table after fetch.")

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

    latest_per_icao = (
        processed_df.sort_values("fetched_at")
        .groupby("icao24", as_index=False)
        .tail(1)
        .sort_values("fetched_at", ascending=False)
    )

    insert_predictions(latest_per_icao[["icao24", "prediction", "confidence"]])

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
        },
        "turbulenceSplit": summarize_levels(latest_per_icao["prediction"]),
        "futureRisk": build_future_risk(latest_per_icao),
        "flights": flights,
        "source": "pipeline-live",
        "fetchedAt": pd.Timestamp.utcnow().isoformat(),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


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


@app.post("/api/pipeline/run-live")
def run_pipeline(db_limit: int = 5000, display_limit: int = 120):
    try:
        return run_live_pipeline(db_limit=db_limit, display_limit=display_limit)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
            return {"state": None}

        state = states[0]
        return {
            "state": {
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
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
