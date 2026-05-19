"""Prediction tool for PIREP validation."""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd


logger = logging.getLogger(__name__)


class PredictionTool:
    """Run the existing ML model and return a single turbulence value."""

    CLASS_TO_VALUE = {
        0: 0.1,
        1: 0.3,
        2: 0.6,
        3: 0.8,
    }

    def __init__(self, model: Any) -> None:
        self._model = model

    def run(self, features: pd.DataFrame) -> float:
        """Return the model prediction as a float."""
        if features.empty:
            raise ValueError("PredictionTool received empty features.")

        logger.info("PredictionTool: running inference")
        prediction = self._model.predict(features)[0]
        try:
            normalized_key = int(round(float(prediction)))
        except (TypeError, ValueError):
            return float(prediction)
        return float(self.CLASS_TO_VALUE.get(normalized_key, float(prediction)))
