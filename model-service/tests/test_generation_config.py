from __future__ import annotations

import pytest

from app.config import ConfigurationError, Settings


GENERATION_ENV_KEYS = (
    "GENERATION_ENABLED",
    "GENERATION_FEATURES",
    "OLLAMA_BASE_URL",
    "OLLAMA_MODEL",
    "OLLAMA_TIMEOUT_SECONDS",
    "OLLAMA_TEMPERATURE",
    "OLLAMA_MAX_INPUT_CHARS",
    "OLLAMA_MAX_CONCURRENCY",
)


@pytest.fixture(autouse=True)
def clear_generation_environment(monkeypatch):
    for key in GENERATION_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_generation_defaults_are_safe_and_disabled():
    settings = Settings.from_environment()
    assert settings.generation_enabled is False
    assert settings.generation_features == frozenset({"opportunity_summary"})
    assert settings.ollama_base_url == "http://127.0.0.1:11434"
    assert settings.ollama_model == "smollm2:1.7b"
    assert settings.ollama_timeout_seconds == 60
    assert settings.ollama_temperature == 0
    assert settings.ollama_max_input_chars == 30_000
    assert settings.ollama_max_concurrency == 2


@pytest.mark.parametrize("value", ["yes", "1", "enabled", ""])
def test_generation_enabled_is_strict(monkeypatch, value):
    monkeypatch.setenv("GENERATION_ENABLED", value)
    with pytest.raises(ConfigurationError, match="GENERATION_ENABLED"):
        Settings.from_environment()


def test_generation_features_remove_duplicates(monkeypatch):
    monkeypatch.setenv(
        "GENERATION_FEATURES",
        "opportunity_summary,readiness,opportunity_summary",
    )
    assert Settings.from_environment().generation_features == frozenset(
        {"opportunity_summary", "readiness"}
    )


@pytest.mark.parametrize("value", ["summary", "unknown", "readiness,other"])
def test_generation_features_reject_unknown_names(monkeypatch, value):
    monkeypatch.setenv("GENERATION_FEATURES", value)
    with pytest.raises(ConfigurationError, match="GENERATION_FEATURES"):
        Settings.from_environment()


@pytest.mark.parametrize(
    "value",
    [
        "http://user:secret@127.0.0.1:11434",
        "http://127.0.0.1:11434/api",
        "http://127.0.0.1:11434?model=other",
        "http://127.0.0.1:11434#fragment",
        "http://example.com:11434",
        "ftp://127.0.0.1:11434",
    ],
)
def test_ollama_url_rejects_unsafe_values(monkeypatch, value):
    monkeypatch.setenv("OLLAMA_BASE_URL", value)
    with pytest.raises(ConfigurationError, match="OLLAMA_BASE_URL"):
        Settings.from_environment()


def test_ollama_url_accepts_https_exact_origin(monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", "https://models.example.test:11434")
    assert Settings.from_environment().ollama_base_url == (
        "https://models.example.test:11434"
    )


@pytest.mark.parametrize(
    "value",
    [
        "",
        "../smollm2",
        "smollm2?tag=1.7b",
        "http://model",
        "model name",
        "a" * 101,
    ],
)
def test_model_identifier_is_bounded_and_safe(monkeypatch, value):
    monkeypatch.setenv("OLLAMA_MODEL", value)
    with pytest.raises(ConfigurationError, match="OLLAMA_MODEL"):
        Settings.from_environment()


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("OLLAMA_TIMEOUT_SECONDS", "0"),
        ("OLLAMA_TIMEOUT_SECONDS", "121"),
        ("OLLAMA_TIMEOUT_SECONDS", "not-a-number"),
        ("OLLAMA_TEMPERATURE", "-0.1"),
        ("OLLAMA_TEMPERATURE", "1.1"),
        ("OLLAMA_MAX_INPUT_CHARS", "999"),
        ("OLLAMA_MAX_INPUT_CHARS", "30001"),
        ("OLLAMA_MAX_CONCURRENCY", "0"),
        ("OLLAMA_MAX_CONCURRENCY", "5"),
    ],
)
def test_generation_limits_are_bounded(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    with pytest.raises(ConfigurationError, match=name):
        Settings.from_environment()
