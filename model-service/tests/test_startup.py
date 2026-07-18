from __future__ import annotations

import json

import joblib
import pytest
from fastapi.testclient import TestClient

from app.config import ConfigurationError, Settings
from app.main import create_app
from app.services.matching_service import ModelContractError
from tests.conftest import EXPECTED_HASHES, TRUSTED_METRICS, TRUSTED_MODEL, file_hash


def test_successful_startup_uses_trusted_model(settings_factory):
    application = create_app(settings=settings_factory())
    with TestClient(application) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["data"]["modelLoaded"] is True


def test_missing_model_prevents_startup(tmp_path, settings_factory):
    application = create_app(
        settings=settings_factory(model_path=tmp_path / "missing.joblib")
    )
    with pytest.raises(ModelContractError, match="unavailable"):
        with TestClient(application):
            pass


def test_malformed_model_prevents_startup(tmp_path, settings_factory):
    malformed = tmp_path / "malformed.joblib"
    malformed.write_bytes(b"not-a-joblib-artifact")
    application = create_app(settings=settings_factory(model_path=malformed))
    with pytest.raises(ModelContractError, match="malformed"):
        with TestClient(application):
            pass


def test_invalid_artifact_contract_prevents_startup(tmp_path, settings_factory):
    invalid = tmp_path / "invalid.joblib"
    joblib.dump(
        {
            "model": None,
            "features": [],
            "version": "test",
            "syntheticBaseline": True,
        },
        invalid,
    )
    application = create_app(settings=settings_factory(model_path=invalid))
    with pytest.raises(ModelContractError, match="feature contract"):
        with TestClient(application):
            pass


def test_production_requires_internal_key(monkeypatch):
    monkeypatch.setenv("MODEL_SERVICE_ENV", "production")
    monkeypatch.setenv("MODEL_SERVICE_API_KEY", "")
    application = create_app()
    with pytest.raises(ConfigurationError, match="required in production"):
        with TestClient(application):
            pass


def test_trusted_model_and_metrics_are_unmodified_and_metrics_are_valid_json():
    assert file_hash(TRUSTED_MODEL) == EXPECTED_HASHES[TRUSTED_MODEL]
    assert file_hash(TRUSTED_METRICS) == EXPECTED_HASHES[TRUSTED_METRICS]
    metrics = json.loads(TRUSTED_METRICS.read_text(encoding="utf-8"))
    assert metrics["validation"]["classificationReport"]["accuracy"] == pytest.approx(
        0.9925816023738873
    )
    assert metrics["test"]["classificationReport"]["accuracy"] == pytest.approx(
        0.9954361054766734
    )
    assert metrics["test"]["rocAuc"] == pytest.approx(0.997077781220948)
