from __future__ import annotations

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_response_is_minimal_and_unauthenticated(settings_factory):
    application = create_app(settings=settings_factory(api_key="internal-secret"))
    with TestClient(application) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "data": {
            "status": "ok",
            "service": "ascent-model-service",
            "modelLoaded": True,
            "modelVersion": "1.0.0",
            "syntheticBaseline": True,
        },
        "requestId": response.headers["x-request-id"],
    }
    serialized = response.text.lower()
    assert "joblib" not in serialized
    assert "scikit" not in serialized
    assert "classifier" not in serialized
    assert "internal-secret" not in serialized


def test_valid_incoming_request_id_is_preserved(client):
    request_id = str(uuid4())
    response = client.get("/health", headers={"X-Request-Id": request_id})
    assert response.headers["x-request-id"] == request_id
    assert response.json()["requestId"] == request_id


def test_unsafe_incoming_request_id_is_replaced(client):
    response = client.get(
        "/health", headers={"X-Request-Id": "unsafe value?secret=true"}
    )
    generated = response.headers["x-request-id"]
    assert str(UUID(generated)) == generated
    assert generated != "unsafe value?secret=true"
