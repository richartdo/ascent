"""Trusted artifact loading and deterministic matching inference."""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Mapping

import joblib
import pandas as pd
from sklearn.pipeline import Pipeline


EXPECTED_FEATURES = (
    "combinedText",
    "profileCountry",
    "education",
    "opportunityType",
    "locationMode",
    "countryEligible",
    "educationCompatible",
    "typePreferred",
    "locationCompatible",
    "skillOverlapCount",
    "missingRequiredSkillCount",
)
REQUIRED_ARTIFACT_KEYS = frozenset(
    {"model", "features", "version", "syntheticBaseline"}
)


class ModelContractError(RuntimeError):
    """Raised when the configured artifact cannot be trusted by this service."""


class InferenceError(RuntimeError):
    """Raised when the loaded model cannot produce a safe prediction."""


@dataclass(frozen=True, slots=True)
class MatchResult:
    match_score: int
    predicted_match: bool
    probability: float


class MatchingService:
    """Validated, immutable access to the fitted opportunity matcher."""

    def __init__(
        self,
        *,
        model: Pipeline,
        model_version: str,
        synthetic_baseline: bool,
        positive_class_index: int,
    ) -> None:
        self._model = model
        self.model_version = model_version
        self.synthetic_baseline = synthetic_baseline
        self._positive_class_index = positive_class_index

    @classmethod
    def load(cls, model_path: Path) -> "MatchingService":
        if not model_path.is_file():
            raise ModelContractError("The configured model artifact is unavailable.")
        try:
            artifact = joblib.load(model_path)
        except Exception as error:
            raise ModelContractError("The configured model artifact is malformed.") from error

        if type(artifact) is not dict:
            raise ModelContractError("The model artifact must be a dictionary.")
        if not REQUIRED_ARTIFACT_KEYS.issubset(artifact):
            raise ModelContractError("The model artifact contract is incomplete.")
        if tuple(artifact["features"]) != EXPECTED_FEATURES:
            raise ModelContractError("The model feature contract is incompatible.")

        model = artifact["model"]
        if not isinstance(model, Pipeline):
            raise ModelContractError("The artifact model must be a Pipeline.")
        if "features" not in model.named_steps or "classifier" not in model.named_steps:
            raise ModelContractError("The Pipeline is missing required steps.")
        classifier = model.named_steps["classifier"]
        if not callable(getattr(model, "predict", None)) or not callable(
            getattr(model, "predict_proba", None)
        ):
            raise ModelContractError("The classifier does not support required predictions.")

        model_version = artifact["version"]
        if type(model_version) is not str or not 1 <= len(model_version) <= 50:
            raise ModelContractError("The model version is invalid.")
        synthetic_baseline = artifact["syntheticBaseline"]
        if type(synthetic_baseline) is not bool:
            raise ModelContractError("The synthetic-baseline marker is invalid.")

        raw_classes = getattr(classifier, "classes_", None)
        if raw_classes is None:
            raise ModelContractError("The fitted classifier classes are unavailable.")
        normalized_classes = [
            value.item() if hasattr(value, "item") else value for value in raw_classes
        ]
        positive_indices = [
            index
            for index, value in enumerate(normalized_classes)
            if type(value) is int and value == 1
        ]
        if len(positive_indices) != 1:
            raise ModelContractError("The positive classifier class is incompatible.")

        return cls(
            model=model,
            model_version=model_version,
            synthetic_baseline=synthetic_baseline,
            positive_class_index=positive_indices[0],
        )

    def predict(self, values: Mapping[str, Any]) -> MatchResult:
        if tuple(values) != EXPECTED_FEATURES:
            raise InferenceError("The inference feature order is invalid.")
        frame = pd.DataFrame(
            [[values[feature] for feature in EXPECTED_FEATURES]],
            columns=EXPECTED_FEATURES,
        )
        try:
            raw_prediction = self._model.predict(frame)
            raw_probabilities = self._model.predict_proba(frame)
            predicted_match = bool(raw_prediction[0])
            probability = float(raw_probabilities[0][self._positive_class_index])
        except Exception as error:
            raise InferenceError("Model inference failed.") from error

        if not math.isfinite(probability) or not 0.0 <= probability <= 1.0:
            raise InferenceError("The model returned an invalid probability.")
        match_score = int(
            (Decimal(str(probability)) * Decimal("100")).quantize(
                Decimal("1"), rounding=ROUND_HALF_UP
            )
        )
        return MatchResult(
            match_score=match_score,
            predicted_match=predicted_match,
            probability=probability,
        )
