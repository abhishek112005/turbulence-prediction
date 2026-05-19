"""Main NOAA PIREP validation agent."""

from __future__ import annotations

import logging
from typing import Any, Callable

import pandas as pd

from agents_pirep.comparison_tool import ComparisonTool
from agents_pirep.flight_tool import FlightDataTool
from agents_pirep.pirep_tool import PIREPTool
from agents_pirep.prediction_tool import PredictionTool


logger = logging.getLogger(__name__)


class PIREPValidationAgent:
    """Validate model turbulence output against NOAA turbulence references."""

    def __init__(
        self,
        *,
        flight_tool: FlightDataTool,
        prediction_tool: PredictionTool,
        pirep_tool: PIREPTool,
        comparison_tool: ComparisonTool,
        build_features: Callable[[str], pd.DataFrame],
    ) -> None:
        self._flight_tool = flight_tool
        self._prediction_tool = prediction_tool
        self._pirep_tool = pirep_tool
        self._comparison_tool = comparison_tool
        self._build_features = build_features

    @classmethod
    def from_dependencies(
        cls,
        *,
        get_flight_state: Callable[[str], dict[str, Any] | None],
        build_features: Callable[[str], pd.DataFrame],
        model: Any,
    ) -> "PIREPValidationAgent":
        """Create the agent from project-level dependencies."""
        return cls(
            flight_tool=FlightDataTool(get_flight_state=get_flight_state),
            prediction_tool=PredictionTool(model=model),
            pirep_tool=PIREPTool(),
            comparison_tool=ComparisonTool(),
            build_features=build_features,
        )

    # CLASS_TO_VALUE mirrors PredictionTool so stored integer labels round-trip correctly
    _CLASS_TO_VALUE = {0: 0.1, 1: 0.3, 2: 0.6, 3: 0.8}

    def run(self, icao24: str, *, stored_predicted_level: int | None = None) -> dict[str, Any]:
        """Execute the full validation flow for one aircraft.

        If *stored_predicted_level* is provided (the already-computed label from the
        main pipeline), it is used directly so External Validation always matches the
        dashboard.  Falls back to re-running the model only when no stored value exists.
        """
        logger.info("PIREPValidationAgent: starting for %s", icao24)
        telemetry = self._flight_tool.run(icao24)

        if stored_predicted_level is not None:
            predicted_value = float(self._CLASS_TO_VALUE.get(int(stored_predicted_level), 0.1))
            logger.info("PIREPValidationAgent: using stored prediction level %s → %.2f", stored_predicted_level, predicted_value)
        else:
            features = self._build_features(icao24)
            predicted_value = self._prediction_tool.run(features)
        matched_report = self._pirep_tool.run(
            lat=telemetry["lat"],
            lon=telemetry["lon"],
            altitude=telemetry["altitude"],
        )
        comparison = self._comparison_tool.compare(
            predicted=predicted_value,
            pirep_val=matched_report["pirep_value"] if matched_report else None,
        )

        result = {
            "icao24": str(icao24).strip().lower(),
            "location": [telemetry["lat"], telemetry["lon"]],
            "altitude": telemetry["altitude"],
            **comparison,
        }
        if matched_report:
            distance = matched_report.get("distance")
            result["pirep_distance"] = round(float(distance), 4) if distance is not None else None
            result["pirep_time"] = matched_report.get("report_time")
            result["pirep_raw"] = matched_report.get("raw_turbulence")
            result["external_source"] = matched_report.get("source_type")
            result["external_source_label"] = matched_report.get("source_label")
            result["message"] = matched_report.get("message")

        logger.info("PIREPValidationAgent: completed for %s", icao24)
        return result
