"""Validated environment configuration for the model service."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_REQUEST_MAX_BYTES = 32_768
MAX_MODEL_REQUEST_MAX_BYTES = 1_048_576
ALLOWED_ENVIRONMENTS = frozenset({"development", "test", "production"})
SUPPORTED_GENERATION_FEATURES = frozenset(
    {
        "opportunity_summary",
        "readiness",
        "cv_analysis",
        "cover_letter",
        "essay_assistance",
    }
)
MODEL_IDENTIFIER_PATTERN = re.compile(
    r"^[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*"
    r"(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$"
)


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
    generation_enabled: bool
    generation_features: frozenset[str]
    ollama_base_url: str
    ollama_model: str
    ollama_timeout_seconds: float
    ollama_temperature: float
    ollama_max_input_chars: int
    ollama_max_concurrency: int

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

        raw_generation_enabled = os.getenv("GENERATION_ENABLED", "false").strip().lower()
        if raw_generation_enabled not in {"true", "false"}:
            raise ConfigurationError("GENERATION_ENABLED must be true or false.")
        generation_enabled = raw_generation_enabled == "true"

        raw_generation_features = os.getenv(
            "GENERATION_FEATURES", "opportunity_summary"
        ).strip()
        generation_features = frozenset(
            item.strip()
            for item in raw_generation_features.split(",")
            if item.strip()
        )
        unknown_features = generation_features - SUPPORTED_GENERATION_FEATURES
        if unknown_features:
            raise ConfigurationError(
                "GENERATION_FEATURES contains an unsupported feature."
            )

        ollama_base_url = os.getenv(
            "OLLAMA_BASE_URL", "http://127.0.0.1:11434"
        ).strip()
        try:
            parsed_ollama_url = urlsplit(ollama_base_url)
            is_exact_origin = (
                parsed_ollama_url.scheme in {"http", "https"}
                and parsed_ollama_url.hostname is not None
                and parsed_ollama_url.path == ""
                and parsed_ollama_url.query == ""
                and parsed_ollama_url.fragment == ""
                and parsed_ollama_url.username is None
                and parsed_ollama_url.password is None
                and f"{parsed_ollama_url.scheme}://{parsed_ollama_url.netloc}"
                == ollama_base_url
            )
            if parsed_ollama_url.port is not None and not 1 <= parsed_ollama_url.port <= 65535:
                is_exact_origin = False
        except ValueError:
            is_exact_origin = False
        if not is_exact_origin:
            raise ConfigurationError("OLLAMA_BASE_URL must be an exact HTTP(S) origin.")
        if parsed_ollama_url.scheme == "http" and parsed_ollama_url.hostname not in {
            "127.0.0.1",
            "localhost",
            "::1",
        }:
            raise ConfigurationError(
                "OLLAMA_BASE_URL must use HTTPS unless it is a loopback origin."
            )

        ollama_model = os.getenv("OLLAMA_MODEL", "smollm2:1.7b").strip()
        model_segments = ollama_model.split(":", maxsplit=1)[0].split("/")
        if (
            not 1 <= len(ollama_model) <= 100
            or MODEL_IDENTIFIER_PATTERN.fullmatch(ollama_model) is None
            or any(segment in {".", ".."} for segment in model_segments)
        ):
            raise ConfigurationError("OLLAMA_MODEL is not a safe model identifier.")

        def bounded_number(name: str, default: str, minimum: float, maximum: float) -> float:
            raw_value = os.getenv(name, default).strip()
            try:
                value = float(raw_value)
            except ValueError as error:
                raise ConfigurationError(f"{name} must be a number.") from error
            if not minimum <= value <= maximum:
                raise ConfigurationError(
                    f"{name} must be between {minimum:g} and {maximum:g}."
                )
            return value

        ollama_timeout_seconds = bounded_number(
            "OLLAMA_TIMEOUT_SECONDS", "60", 1, 120
        )
        ollama_temperature = bounded_number("OLLAMA_TEMPERATURE", "0", 0, 1)

        def bounded_integer(name: str, default: str, minimum: int, maximum: int) -> int:
            raw_value = os.getenv(name, default).strip()
            try:
                value = int(raw_value)
            except ValueError as error:
                raise ConfigurationError(f"{name} must be an integer.") from error
            if not minimum <= value <= maximum:
                raise ConfigurationError(
                    f"{name} must be between {minimum} and {maximum}."
                )
            return value

        ollama_max_input_chars = bounded_integer(
            "OLLAMA_MAX_INPUT_CHARS", "30000", 1_000, 30_000
        )
        ollama_max_concurrency = bounded_integer(
            "OLLAMA_MAX_CONCURRENCY", "2", 1, 4
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
            generation_enabled=generation_enabled,
            generation_features=generation_features,
            ollama_base_url=ollama_base_url,
            ollama_model=ollama_model,
            ollama_timeout_seconds=ollama_timeout_seconds,
            ollama_temperature=ollama_temperature,
            ollama_max_input_chars=ollama_max_input_chars,
            ollama_max_concurrency=ollama_max_concurrency,
        )
