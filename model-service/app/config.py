"""Validated environment configuration for the model service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_REQUEST_MAX_BYTES = 32_768
MAX_MODEL_REQUEST_MAX_BYTES = 1_048_576
ALLOWED_ENVIRONMENTS = frozenset({"development", "test", "production"})


class ConfigurationError(RuntimeError):
    """Raised when model-service configuration is unsafe or invalid."""


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime settings after environment validation."""

    service_root: Path
    model_path: Path
    api_key: str | None
    environment: str
    request_max_bytes: int

    @classmethod
    def from_environment(cls) -> "Settings":
        environment = os.getenv("MODEL_SERVICE_ENV", "development").strip().lower()
        if environment not in ALLOWED_ENVIRONMENTS:
            raise ConfigurationError(
                "MODEL_SERVICE_ENV must be development, test, or production."
            )

        raw_api_key = os.getenv("MODEL_SERVICE_API_KEY", "")
        api_key = raw_api_key if raw_api_key else None
        if environment == "production" and api_key is None:
            raise ConfigurationError(
                "MODEL_SERVICE_API_KEY is required in production."
            )

        raw_max_bytes = os.getenv(
            "MODEL_REQUEST_MAX_BYTES", str(DEFAULT_MODEL_REQUEST_MAX_BYTES)
        ).strip()
        try:
            request_max_bytes = int(raw_max_bytes)
        except ValueError as error:
            raise ConfigurationError(
                "MODEL_REQUEST_MAX_BYTES must be an integer."
            ) from error
        if not 1 <= request_max_bytes <= MAX_MODEL_REQUEST_MAX_BYTES:
            raise ConfigurationError(
                "MODEL_REQUEST_MAX_BYTES must be between 1 and 1048576."
            )

        raw_model_path = os.getenv(
            "MODEL_PATH", "models/ascent_matcher.joblib"
        ).strip()
        if not raw_model_path:
            raise ConfigurationError("MODEL_PATH must not be empty.")
        configured_path = Path(raw_model_path)
        if configured_path.is_absolute():
            raise ConfigurationError("MODEL_PATH must be relative to model-service/.")
        model_path = (SERVICE_ROOT / configured_path).resolve()
        try:
            model_path.relative_to(SERVICE_ROOT)
        except ValueError as error:
            raise ConfigurationError(
                "MODEL_PATH must remain inside model-service/."
            ) from error

        return cls(
            service_root=SERVICE_ROOT,
            model_path=model_path,
            api_key=api_key,
            environment=environment,
            request_max_bytes=request_max_bytes,
        )
