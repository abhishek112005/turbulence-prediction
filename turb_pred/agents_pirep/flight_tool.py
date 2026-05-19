"""Flight data tool for PIREP validation."""

from __future__ import annotations

import logging
from typing import Any, Callable


logger = logging.getLogger(__name__)


class FlightDataTool:
    """Fetch the latest telemetry for a flight."""

    def __init__(self, get_flight_state: Callable[[str], dict[str, Any] | None]) -> None:
        self._get_flight_state = get_flight_state

    def run(self, icao24: str) -> dict[str, float]:
        """Return latitude, longitude, and altitude for the requested flight."""
        logger.info("FlightDataTool: fetching state for %s", icao24)
        state = self._get_flight_state(icao24)
        if not state:
            raise ValueError(f"Flight state not found for ICAO24 '{icao24}'.")

        lat = state.get("latitude")
        lon = state.get("longitude")
        altitude = state.get("baro_altitude")

        if lat is None or lon is None or altitude is None:
            raise ValueError(f"Incomplete flight telemetry for ICAO24 '{icao24}'.")

        return {
            "lat": float(lat),
            "lon": float(lon),
            "altitude": float(altitude),
        }
