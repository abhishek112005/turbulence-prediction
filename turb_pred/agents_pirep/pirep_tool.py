"""NOAA PIREP lookup tool for turbulence validation."""

from __future__ import annotations

import logging
import math
import re
import time
from typing import Any

import requests


logger = logging.getLogger(__name__)


class PIREPTool:
    """Fetch and match NOAA turbulence references with fallback sources."""

    API_URL = "https://aviationweather.gov/api/data/pirep"
    AIRSIGMET_URL = "https://aviationweather.gov/api/data/airsigmet"
    ISIGMET_URL = "https://aviationweather.gov/api/data/isigmet"
    GAIRMET_URL = "https://aviationweather.gov/api/data/gairmet"
    CWA_URL = "https://aviationweather.gov/api/data/cwa"

    def __init__(self, cache_ttl_seconds: int = 300, distance_threshold_deg: float = 3.0) -> None:
        self._cache_ttl_seconds = max(60, int(cache_ttl_seconds))
        self._distance_threshold_deg = float(distance_threshold_deg)
        self._cache: dict[tuple[float, float], tuple[float, list[dict[str, Any]]]] = {}
        self._last_request_failed = False

    def run(self, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        """Return the best external NOAA turbulence reference for the flight."""
        lat = float(lat)
        lon = float(lon)
        altitude = float(altitude)
        self._last_request_failed = False

        reports = self._get_reports(lat=lat, lon=lon, altitude=altitude)
        nearest = self._find_nearest_report(lat=lat, lon=lon, altitude=altitude, reports=reports)
        if nearest:
            logger.info(
                "PIREPTool: matched report at distance %.3f for aircraft position (%s, %s)",
                nearest["distance"],
                lat,
                lon,
            )
            return nearest

        logger.info("PIREPTool: no nearby PIREP found for aircraft position (%s, %s); trying advisory fallbacks", lat, lon)
        advisory_match = self._find_advisory_match(lat=lat, lon=lon, altitude=altitude)
        if advisory_match:
            return advisory_match

        logger.info("PIREPTool: no NOAA turbulence advisory matched; using baseline fallback")
        return {
            "distance": None,
            "altitude_gap": None,
            "pirep_value": 0.3,
            "raw_turbulence": "NOAA baseline fallback",
            "report_altitude": altitude,
            "report_time": None,
            "latitude": lat,
            "longitude": lon,
            "source_type": "noaa-baseline",
            "source_label": "NOAA Baseline",
            "message": (
                "NOAA was unreachable. Using a neutral fallback baseline for comparison."
                if self._last_request_failed
                else "No nearby turbulence report or advisory was found. Using a neutral NOAA fallback baseline for comparison."
            ),
        }

    def _get_reports(self, *, lat: float, lon: float, altitude: float) -> list[dict[str, Any]]:
        now = time.time()
        cache_key = ("pirep", round(lat, 1), round(lon, 1), int(round(altitude, -3)))
        cached = self._cache.get(cache_key)
        if cached and (now - cached[0]) < self._cache_ttl_seconds:
            return cached[1]

        half_span = max(1.0, self._distance_threshold_deg)
        params = {
            "format": "json",
            "bbox": f"{lat - half_span:.3f},{lon - half_span:.3f},{lat + half_span:.3f},{lon + half_span:.3f}",
            "age": "6",
            "level": str(int(round(altitude))),
        }

        started = time.perf_counter()
        try:
            response = requests.get(
                self.API_URL,
                params=params,
                headers={"User-Agent": "TurbulenceValidationAgent/1.0"},
                timeout=30,
            )
        except requests.RequestException as exc:
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            logger.warning("PIREPTool: NOAA PIREP request failed in %.1f ms: %s", elapsed_ms, exc)
            self._last_request_failed = True
            self._cache[cache_key] = (now, [])
            return []
        elapsed_ms = (time.perf_counter() - started) * 1000.0

        if response.status_code == 204:
            logger.info("PIREPTool: NOAA returned 204 No Content in %.1f ms", elapsed_ms)
            self._cache[cache_key] = (now, [])
            return []

        response.raise_for_status()
        payload = response.json()
        reports = payload if isinstance(payload, list) else payload.get("data", [])
        if not isinstance(reports, list):
            reports = []

        logger.info(
            "PIREPTool: fetched %s reports from NOAA in %.1f ms using bbox=%s",
            len(reports),
            elapsed_ms,
            params["bbox"],
        )
        self._cache[cache_key] = (now, reports)
        return reports

    def _find_nearest_report(
        self,
        *,
        lat: float,
        lon: float,
        altitude: float,
        reports: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        best_match: dict[str, Any] | None = None

        for report in reports:
            report_lat = self._extract_float(report, "lat", "latitude")
            report_lon = self._extract_float(report, "lon", "longitude")
            if report_lat is None or report_lon is None:
                continue

            distance = math.sqrt((lat - report_lat) ** 2 + (lon - report_lon) ** 2)
            if distance > self._distance_threshold_deg:
                continue

            report_altitude = self._extract_altitude_feet(report)
            altitude_gap = abs(altitude - report_altitude) if report_altitude is not None else float("inf")
            turbulence_text = self._extract_turbulence_text(report)
            if not turbulence_text:
                continue

            candidate = {
                "distance": float(distance),
                "altitude_gap": float(altitude_gap),
                "pirep_value": self.pirep_to_value(turbulence_text),
                "raw_turbulence": turbulence_text,
                "report_altitude": float(report_altitude) if report_altitude is not None else None,
                "report_time": self._extract_text(report, "obsTime", "receiptTime", "reportTime"),
                "latitude": float(report_lat),
                "longitude": float(report_lon),
                "source_type": "pirep",
                "source_label": "NOAA PIREP",
                "message": "Matched nearest NOAA pilot report.",
            }

            if best_match is None:
                best_match = candidate
                continue

            if (candidate["distance"], candidate["altitude_gap"]) < (
                best_match["distance"],
                best_match["altitude_gap"],
            ):
                best_match = candidate

        return best_match

    def pirep_to_value(self, turb: str) -> float:
        """Convert raw PIREP turbulence text to a normalized numeric value."""
        turb = str(turb or "").upper()
        if "SEV" in turb or "SVR" in turb:
            return 0.8
        if "MOD" in turb:
            return 0.6
        if "LGT" in turb:
            return 0.3
        return 0.2

    def _find_advisory_match(self, *, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        advisory_matchers = [
            self._query_airsigmet,
            self._query_isigmet,
            self._query_gairmet_high,
            self._query_gairmet_low,
            self._query_cwa,
        ]

        for matcher in advisory_matchers:
            match = matcher(lat=lat, lon=lon, altitude=altitude)
            if match:
                return match
        return None

    def _query_airsigmet(self, *, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        advisories = self._get_cached_json(
            cache_prefix="airsigmet",
            url=self.AIRSIGMET_URL,
            params={"format": "json", "hazard": "turb", "level": str(int(round(altitude)))},
        )
        return self._pick_best_area_match(
            lat=lat,
            lon=lon,
            advisories=advisories,
            default_value=0.7,
            source_type="airsigmet",
            source_label="NOAA AIRSIGMET",
        )

    def _query_isigmet(self, *, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        advisories = self._get_cached_json(
            cache_prefix="isigmet",
            url=self.ISIGMET_URL,
            params={"format": "json", "hazard": "turb", "level": str(int(round(altitude)))},
        )
        return self._pick_best_area_match(
            lat=lat,
            lon=lon,
            advisories=advisories,
            default_value=0.7,
            source_type="isigmet",
            source_label="NOAA ISIGMET",
        )

    def _query_gairmet_high(self, *, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        advisories = self._get_cached_json(
            cache_prefix="gairmet-hi",
            url=self.GAIRMET_URL,
            params={"format": "json", "hazard": "turb-hi", "fore": "0"},
        )
        return self._pick_best_area_match(
            lat=lat,
            lon=lon,
            advisories=advisories,
            default_value=0.65,
            source_type="gairmet-hi",
            source_label="NOAA G-AIRMET High",
        )

    def _query_gairmet_low(self, *, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        advisories = self._get_cached_json(
            cache_prefix="gairmet-lo",
            url=self.GAIRMET_URL,
            params={"format": "json", "hazard": "turb-lo", "fore": "0"},
        )
        return self._pick_best_area_match(
            lat=lat,
            lon=lon,
            advisories=advisories,
            default_value=0.35,
            source_type="gairmet-lo",
            source_label="NOAA G-AIRMET Low",
        )

    def _query_cwa(self, *, lat: float, lon: float, altitude: float) -> dict[str, Any] | None:
        advisories = self._get_cached_json(
            cache_prefix="cwa-turb",
            url=self.CWA_URL,
            params={"format": "json", "hazard": "turb"},
        )
        return self._pick_best_area_match(
            lat=lat,
            lon=lon,
            advisories=advisories,
            default_value=0.6,
            source_type="cwa",
            source_label="NOAA CWA",
        )

    def _get_cached_json(self, *, cache_prefix: str, url: str, params: dict[str, str]) -> list[dict[str, Any]]:
        now = time.time()
        cache_key = (cache_prefix, tuple(sorted(params.items())))
        cached = self._cache.get(cache_key)
        if cached and (now - cached[0]) < self._cache_ttl_seconds:
            return cached[1]

        started = time.perf_counter()
        try:
            response = requests.get(
                url,
                params=params,
                headers={"User-Agent": "TurbulenceValidationAgent/1.0"},
                timeout=30,
            )
        except requests.RequestException as exc:
            elapsed_ms = (time.perf_counter() - started) * 1000.0
            logger.warning("%s: NOAA request failed in %.1f ms: %s", cache_prefix, elapsed_ms, exc)
            self._last_request_failed = True
            self._cache[cache_key] = (now, [])
            return []
        elapsed_ms = (time.perf_counter() - started) * 1000.0

        if response.status_code == 204:
            logger.info("%s: NOAA returned 204 No Content in %.1f ms", cache_prefix, elapsed_ms)
            self._cache[cache_key] = (now, [])
            return []

        response.raise_for_status()
        payload = response.json()
        items = payload if isinstance(payload, list) else payload.get("data", [])
        if not isinstance(items, list):
            items = []

        logger.info("%s: fetched %s NOAA records in %.1f ms", cache_prefix, len(items), elapsed_ms)
        self._cache[cache_key] = (now, items)
        return items

    def _pick_best_area_match(
        self,
        *,
        lat: float,
        lon: float,
        advisories: list[dict[str, Any]],
        default_value: float,
        source_type: str,
        source_label: str,
    ) -> dict[str, Any] | None:
        best_match: dict[str, Any] | None = None

        for advisory in advisories:
            points = self._extract_coords(advisory)
            if not points:
                continue

            distance = min(
                math.sqrt((lat - point_lat) ** 2 + (lon - point_lon) ** 2)
                for point_lat, point_lon in points
            )
            if distance > max(6.0, self._distance_threshold_deg * 2):
                continue

            candidate = {
                "distance": float(distance),
                "altitude_gap": None,
                "pirep_value": self._derive_advisory_value(advisory, default_value=default_value),
                "raw_turbulence": self._extract_text(
                    advisory,
                    "qualifier",
                    "hazard",
                    "due_to",
                    "rawAirSigmet",
                    "rawSigmet",
                    "cwaText",
                ) or source_label,
                "report_altitude": None,
                "report_time": self._extract_text(advisory, "receiptTime", "validTime", "validTimeFrom", "issueTime"),
                "latitude": points[0][0],
                "longitude": points[0][1],
                "source_type": source_type,
                "source_label": source_label,
                "message": f"Using {source_label} as NOAA fallback turbulence reference.",
            }
            if best_match is None or candidate["distance"] < best_match["distance"]:
                best_match = candidate

        return best_match

    def _derive_advisory_value(self, advisory: dict[str, Any], *, default_value: float) -> float:
        text = " ".join(
            str(value or "")
            for value in [
                advisory.get("qualifier"),
                advisory.get("hazard"),
                advisory.get("due_to"),
                advisory.get("rawAirSigmet"),
                advisory.get("rawSigmet"),
                advisory.get("cwaText"),
            ]
        ).upper()
        if "SEV" in text or "EXTM" in text:
            return 0.8
        if "MOD" in text:
            return 0.6
        if "LGT" in text or "LOW" in text:
            return 0.35
        return float(default_value)

    def _extract_coords(self, advisory: dict[str, Any]) -> list[tuple[float, float]]:
        coords = advisory.get("coords")
        points: list[tuple[float, float]] = []
        if isinstance(coords, list):
            for point in coords:
                if isinstance(point, dict):
                    lat = self._extract_float(point, "lat", "latitude")
                    lon = self._extract_float(point, "lon", "longitude")
                    if lat is not None and lon is not None:
                        points.append((float(lat), float(lon)))
        return points

    def _extract_turbulence_text(self, report: dict[str, Any]) -> str:
        direct = self._extract_text(
            report,
            "turbulence",
            "tb",
            "tbInten",
            "tbIntensity",
            "turbInten",
            "turbulenceCondition",
        )
        if direct:
            return direct

        layers = report.get("turbulenceLayers")
        if isinstance(layers, list):
            joined = " ".join(str(item) for item in layers if item)
            if joined.strip():
                return joined

        raw_text = self._extract_text(report, "rawOb", "rawText", "reportData", "text")
        if raw_text:
            match = re.search(r"\b(LGT|MOD|SEV|SVR)(?:[A-Z/]*)\b", raw_text.upper())
            if match:
                return match.group(0)

        return ""

    @staticmethod
    def _extract_text(report: dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = report.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _extract_float(report: dict[str, Any], *keys: str) -> float | None:
        for key in keys:
            value = report.get(key)
            try:
                if value is not None and str(value).strip() != "":
                    return float(value)
            except (TypeError, ValueError):
                continue
        return None

    def _extract_altitude_feet(self, report: dict[str, Any]) -> float | None:
        direct = self._extract_float(report, "altitude", "alt", "flightLevel", "fltLvl", "level")
        if direct is not None:
            if 0 < direct < 700:
                return direct * 100.0
            return direct

        text_value = self._extract_text(report, "rawOb", "rawText", "reportData", "text")
        if not text_value:
            return None

        match = re.search(r"/FL(\d{3})\b", text_value.upper())
        if match:
            return float(match.group(1)) * 100.0
        return None
