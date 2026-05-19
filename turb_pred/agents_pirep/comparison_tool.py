"""Comparison tool for PIREP validation."""

from __future__ import annotations

from typing import Any


class ComparisonTool:
    """Compare model prediction against a PIREP-derived turbulence value."""

    def classify(self, value: float | None) -> str:
        """Convert a numeric value into a severity label."""
        if value is None:
            return "Unavailable"

        numeric_value = float(value)
        if numeric_value < 0.2:
            return "Calm"
        if numeric_value < 0.4:
            return "Light"
        if numeric_value < 0.7:
            return "Moderate"
        return "Severe"

    def compare(self, predicted: float, pirep_val: float | None) -> dict[str, Any]:
        """Return a structured comparison payload."""
        predicted_value = float(predicted)
        predicted_label = self.classify(predicted_value)
        pirep_label = self.classify(pirep_val)
        difference = abs(predicted_value - float(pirep_val)) if pirep_val is not None else None

        return {
            "predicted_value": predicted_value,
            "predicted_label": predicted_label,
            "pirep_value": float(pirep_val) if pirep_val is not None else None,
            "pirep_label": pirep_label,
            "difference": float(difference) if difference is not None else None,
            "match": bool(pirep_val is not None and predicted_label == pirep_label),
            "within_tolerance": bool(difference is not None and difference < 0.2),
        }
