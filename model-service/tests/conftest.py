from __future__ import annotations

import hashlib
import socket
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


SERVICE_ROOT = Path(__file__).resolve().parents[1]
TRUSTED_MODEL = SERVICE_ROOT / "models" / "ascent_matcher.joblib"
TRUSTED_METRICS = SERVICE_ROOT / "models" / "metrics.json"
EXPECTED_HASHES = {
    TRUSTED_MODEL: "74098567b1c9f814b123fe2f796d04fe11479448bb9fd86c181952fe32200406",
    TRUSTED_METRICS: "eee1a355af3bc47af70a263af4e7cda6a3f8edefb92a6d48464cbd0aa791de49",
}
VALID_PAYLOAD: dict[str, Any] = {
    "combinedText": "Python data analysis and community leadership",
    "profileCountry": "KE",
    "education": "bachelors_in_progress",
    "opportunityType": "fellowship",
    "locationMode": "hybrid",
    "countryEligible": True,
    "educationCompatible": True,
    "typePreferred": True,
    "locationCompatible": True,
    "skillOverlapCount": 3,
    "missingRequiredSkillCount": 1,
}


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture(scope="session", autouse=True)
def trusted_artifacts_remain_unchanged():
    before = {path: file_hash(path) for path in EXPECTED_HASHES}
    assert before == EXPECTED_HASHES
    yield
    after = {path: file_hash(path) for path in EXPECTED_HASHES}
    assert after == before


@pytest.fixture(autouse=True)
def block_external_network(monkeypatch: pytest.MonkeyPatch):
    original_connect = socket.socket.connect

    def local_only_connect(sock: socket.socket, address: Any) -> Any:
        if isinstance(address, tuple) and address[0] in {
            "127.0.0.1",
            "::1",
            "localhost",
        }:
            return original_connect(sock, address)
        raise AssertionError("External network access is disabled during tests.")

    monkeypatch.setattr(socket.socket, "connect", local_only_connect)


@pytest.fixture
def settings_factory():
    def build(
        *,
        model_path: Path = TRUSTED_MODEL,
        api_key: str | None = None,
        request_max_bytes: int = 32_768,
        environment: str = "test",
    ) -> Settings:
        return Settings(
            service_root=SERVICE_ROOT,
            model_path=model_path,
            api_key=api_key,
            environment=environment,
            request_max_bytes=request_max_bytes,
        )

    return build


@pytest.fixture
def client(settings_factory):
    application = create_app(settings=settings_factory())
    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def valid_payload() -> dict[str, Any]:
    return dict(VALID_PAYLOAD)
