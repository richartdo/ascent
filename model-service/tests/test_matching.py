from __future__ import annotations

import asyncio
import logging
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.middleware import RequestSafetyMiddleware


def assert_validation_error(response) -> None:
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["requestId"] == response.headers["x-request-id"]


def test_valid_matching_request(client, valid_payload):
    response = client.post("/v1/match", json=valid_payload)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["requestId"] == response.headers["x-request-id"]
    assert 0.0 <= body["data"]["probability"] <= 1.0
    assert 0 <= body["data"]["matchScore"] <= 100
    assert body["data"]["predictedMatch"] in {True, False}
    assert body["data"]["modelVersion"] == "1.0.0"
    assert body["data"]["syntheticBaseline"] is True
    assert body["data"]["disclaimer"] == (
        "This score is guidance, not a guarantee of eligibility or selection."
    )


def test_probability_score_rounding_and_repeated_prediction_are_deterministic(
    client, valid_payload
):
    first = client.post("/v1/match", json=valid_payload).json()["data"]
    second = client.post("/v1/match", json=valid_payload).json()["data"]
    assert first == second
    assert first["matchScore"] == int(first["probability"] * 100 + 0.5)


def test_unknown_fields_are_rejected(client, valid_payload):
    valid_payload["arbitraryFeature"] = 999
    assert_validation_error(client.post("/v1/match", json=valid_payload))


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("profileCountry", "ke"),
        ("profileCountry", "KEN"),
        ("education", "doctorate"),
        ("opportunityType", "job"),
        ("locationMode", "virtual"),
        ("skillOverlapCount", -1),
        ("skillOverlapCount", 101),
        ("skillOverlapCount", "3"),
        ("missingRequiredSkillCount", -1),
        ("countryEligible", "true"),
        ("educationCompatible", "false"),
        ("typePreferred", 1),
        ("locationCompatible", 0),
    ],
)
def test_invalid_fields_are_rejected(client, valid_payload, field, value):
    valid_payload[field] = value
    assert_validation_error(client.post("/v1/match", json=valid_payload))


@pytest.mark.parametrize("text", ["", "   ", "x" * 20_001])
def test_empty_or_oversized_combined_text_is_rejected(client, valid_payload, text):
    valid_payload["combinedText"] = text
    assert_validation_error(client.post("/v1/match", json=valid_payload))


def test_malformed_json_returns_400(client):
    response = client.post(
        "/v1/match",
        content=b'{"combinedText":',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "MALFORMED_JSON"


def test_declared_oversized_body_returns_413(client):
    response = client.post(
        "/v1/match",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": "32769"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"


@pytest.mark.parametrize("content_length", ["-1", "invalid", "1.5", ""])
def test_invalid_content_length_returns_400(client, content_length):
    response = client.post(
        "/v1/match",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": content_length},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_CONTENT_LENGTH"


def test_received_body_limit_is_enforced_without_content_length(settings_factory):
    async def exercise_middleware():
        request_messages = iter(
            [
                {"type": "http.request", "body": b"x" * 40, "more_body": True},
                {"type": "http.request", "body": b"x" * 25, "more_body": False},
            ]
        )
        response_messages = []

        async def receive():
            return next(request_messages)

        async def send(message):
            response_messages.append(message)

        async def body_reader(_scope, limited_receive, app_send):
            while True:
                message = await limited_receive()
                if not message.get("more_body", False):
                    break
            await app_send(
                {"type": "http.response.start", "status": 200, "headers": []}
            )
            await app_send({"type": "http.response.body", "body": b"ok"})

        middleware = RequestSafetyMiddleware(body_reader)
        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/v1/match",
                "headers": [(b"content-type", b"application/json")],
                "state": {},
                "app": SimpleNamespace(
                    state=SimpleNamespace(settings=settings_factory(request_max_bytes=64))
                ),
            },
            receive,
            send,
        )
        return response_messages

    messages = asyncio.run(exercise_middleware())
    start = next(message for message in messages if message["type"] == "http.response.start")
    body = next(message for message in messages if message["type"] == "http.response.body")
    assert start["status"] == 413
    assert b"REQUEST_TOO_LARGE" in body["body"]


@pytest.mark.parametrize("supplied_key", [None, "incorrect-key"])
def test_missing_and_incorrect_api_keys_have_identical_responses(
    settings_factory, valid_payload, supplied_key
):
    application = create_app(settings=settings_factory(api_key="correct-key"))
    headers = {} if supplied_key is None else {"X-Model-Service-Key": supplied_key}
    with TestClient(application) as client:
        response = client.post("/v1/match", json=valid_payload, headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.json()["error"]["message"] == (
        "Valid internal service credentials are required."
    )


def test_correct_api_key_authenticates(settings_factory, valid_payload):
    application = create_app(settings=settings_factory(api_key="correct-key"))
    with TestClient(application) as client:
        response = client.post(
            "/v1/match",
            json=valid_payload,
            headers={"X-Model-Service-Key": "correct-key"},
        )
    assert response.status_code == 200


def test_unexpected_runtime_model_state_returns_503(client, valid_payload):
    client.app.state.matching_service = None
    response = client.post("/v1/match", json=valid_payload)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "MODEL_UNAVAILABLE"


def test_model_failure_is_sanitized(client, valid_payload, monkeypatch, caplog):
    secret_exception = "private-model-detail-combinedText"

    def fail(_values):
        raise RuntimeError(secret_exception)

    monkeypatch.setattr(client.app.state.matching_service, "predict", fail)
    with caplog.at_level(logging.INFO):
        response = client.post("/v1/match", json=valid_payload)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INFERENCE_ERROR"
    assert secret_exception not in response.text
    assert secret_exception not in caplog.text


def test_query_body_and_sensitive_values_do_not_appear_in_logs(
    settings_factory, valid_payload, caplog
):
    query_secret = "private-query-value"
    body_secret = "private-combinedText-cv-essay-token"
    key_secret = "private-internal-key"
    valid_payload["combinedText"] = body_secret
    application = create_app(settings=settings_factory(api_key=key_secret))
    with TestClient(application) as client:
        with caplog.at_level(logging.INFO, logger="ascent_model_service"):
            response = client.post(
                f"/v1/match?debug={query_secret}",
                json=valid_payload,
                headers={"X-Model-Service-Key": key_secret},
            )
    assert response.status_code == 200
    assert logging.getLogger("uvicorn.access").disabled is True
    service_logs = "\n".join(
        record.getMessage()
        for record in caplog.records
        if record.name.startswith("ascent_model_service")
    )
    for secret in (query_secret, body_secret, key_secret):
        assert secret not in service_logs
