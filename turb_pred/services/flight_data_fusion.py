from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.auth import get_access_token
from config.settings import AVIATIONSTACK_ACCESS_KEY, AVIATIONSTACK_BASE_URL


def normalize_icao24(icao24: str) -> str:
    return str(icao24 or "").strip().lower()


def normalize_callsign(callsign: str) -> str:
    return "".join(str(callsign or "").strip().upper().split())


@dataclass
class FlightFusionService:
    db: Session

    def get_fused_flight(self, icao24: str) -> dict:
        normalized_icao24 = normalize_icao24(icao24)
        opensky_payload = self._get_opensky_state(normalized_icao24)
        if not opensky_payload:
            raise HTTPException(status_code=404, detail=f"No live or cached flight data found for ICAO24 '{normalized_icao24}'.")

        callsign = normalize_callsign(opensky_payload.get("callsign"))
        aviationstack_payload = None
        aviationstack_state = "unavailable"
        if callsign:
            try:
                aviationstack_payload = self._get_aviationstack_flight(callsign)
                aviationstack_state = "matched" if aviationstack_payload else "not-found"
            except requests.RequestException:
                aviationstack_state = "provider-error"
            except HTTPException:
                aviationstack_state = "provider-error"

        route = None
        flight_number = None
        status = None
        if aviationstack_payload:
            route = {
                "departure": self._airport_payload(aviationstack_payload.get("departure")),
                "arrival": self._airport_payload(aviationstack_payload.get("arrival")),
            }
            flight_block = aviationstack_payload.get("flight") or {}
            flight_number = flight_block.get("icao") or flight_block.get("number") or flight_block.get("iata")
            status = aviationstack_payload.get("flight_status") or aviationstack_payload.get("status")

        return {
            "icao24": normalized_icao24,
            "callsign": callsign or "N/A",
            "flightNumber": flight_number,
            "flightStatus": status,
            "liveState": {
                "latitude": opensky_payload.get("latitude"),
                "longitude": opensky_payload.get("longitude"),
                "baroAltitude": opensky_payload.get("baro_altitude"),
                "velocity": opensky_payload.get("velocity"),
                "verticalRate": opensky_payload.get("vertical_rate"),
                "trueTrack": opensky_payload.get("true_track"),
                "onGround": bool(opensky_payload.get("on_ground")),
                "lastContact": opensky_payload.get("last_contact"),
                "source": opensky_payload.get("source", "opensky"),
            },
            "route": route,
            "providerStatus": {
                "opensky": opensky_payload.get("source", "opensky"),
                "aviationstack": aviationstack_state,
            },
            "correlation": {
                "strategy": "icao24 -> OpenSky callsign -> AviationStack flight_icao",
                "matchedByCallsign": bool(aviationstack_payload),
            },
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }

    def _get_opensky_state(self, icao24: str) -> dict | None:
        try:
            token = get_access_token()
            response = requests.get(
                "https://opensky-network.org/api/states/all",
                headers={"Authorization": f"Bearer {token}"},
                params={"icao24": icao24},
                timeout=30,
            )
            response.raise_for_status()
            states = (response.json() or {}).get("states") or []
            if states:
                state = states[0]
                return {
                    "icao24": state[0],
                    "callsign": state[1],
                    "origin_country": state[2],
                    "last_contact": state[4],
                    "longitude": state[5],
                    "latitude": state[6],
                    "baro_altitude": state[7],
                    "on_ground": state[8],
                    "velocity": state[9],
                    "true_track": state[10],
                    "vertical_rate": state[11],
                    "source": "opensky-live",
                }
        except Exception:
            pass

        row = self.db.execute(
            text(
                """
                SELECT icao24, callsign, origin_country, last_contact, longitude, latitude,
                       baro_altitude, on_ground, velocity, true_track, vertical_rate
                FROM planes_table
                WHERE LOWER(icao24) = LOWER(:icao24)
                ORDER BY fetched_at DESC
                LIMIT 1
                """
            ),
            {"icao24": icao24},
        ).mappings().first()
        if not row:
            return None

        payload = dict(row)
        payload["source"] = "planes-table-fallback"
        return payload

    def _get_aviationstack_flight(self, callsign: str) -> dict | None:
        if not AVIATIONSTACK_ACCESS_KEY:
            return None

        response = requests.get(
            f"{AVIATIONSTACK_BASE_URL.rstrip('/')}/flights",
            params={"access_key": AVIATIONSTACK_ACCESS_KEY, "flight_icao": callsign, "limit": 5},
            timeout=30,
        )
        response.raise_for_status()
        data = response.json() or {}
        if data.get("error"):
            message = data["error"].get("message") or "AviationStack request failed."
            raise HTTPException(status_code=502, detail=message)

        ranked = sorted(
            data.get("data") or [],
            key=self._aviationstack_rank_key,
            reverse=True,
        )
        return ranked[0] if ranked else None

    @staticmethod
    def _aviationstack_rank_key(item: dict) -> tuple[int, str]:
        flight = item.get("flight") or {}
        status = str(item.get("flight_status") or item.get("status") or "").lower()
        score = 0
        if status == "active":
            score += 100
        elif status == "scheduled":
            score += 70
        elif status == "landed":
            score += 30

        if flight.get("icao") or flight.get("number"):
            score += 10

        schedule_bias = (
            (item.get("departure") or {}).get("estimated")
            or (item.get("departure") or {}).get("scheduled")
            or ""
        )
        return (score, str(schedule_bias))

    @staticmethod
    def _airport_payload(airport: dict | None) -> dict | None:
        if not airport:
            return None

        return {
            "airport": airport.get("airport"),
            "iata": airport.get("iata"),
            "icao": airport.get("icao"),
            "scheduled": airport.get("scheduled"),
            "estimated": airport.get("estimated"),
        }
