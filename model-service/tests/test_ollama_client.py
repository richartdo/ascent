from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.generation_schemas import OpportunitySummaryModelOutput
from app.services.ollama_client import (
    GenerationTimeoutError,
    GenerationUnavailableError,
    MalformedModelResponseError,
    OllamaClient,
)


def run(coroutine):
    return asyncio.run(coroutine)


def build_client(settings_factory, handler):
    settings = settings_factory(generation_enabled=True)
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(
        base_url=settings.ollama_base_url,
        transport=transport,
        timeout=settings.ollama_timeout_seconds,
    )
    return OllamaClient(settings=settings, http_client=http_client), http_client


def test_client_uses_hardcoded_path_and_safe_structured_options(settings_factory):
    captured = {}

    def handler(request: httpx.Request):
        captured["path"] = request.url.path
        captured["body"] = json.loads(request.content)
        captured["request_id"] = request.headers["X-Request-ID"]
        return httpx.Response(
            200,
            json={"response": '{"overview":"Safe"}', "done": True},
        )

    client, http_client = build_client(settings_factory, handler)
    try:
        result = run(
            client.generate(
                system="static-system",
                prompt="untrusted-input",
                output_schema=OpportunitySummaryModelOutput,
                output_tokens=350,
                request_id="00000000-0000-4000-8000-000000000001",
            )
        )
    finally:
        run(http_client.aclose())

    assert result == '{"overview":"Safe"}'
    assert captured["path"] == "/api/generate"
    assert captured["request_id"] == "00000000-0000-4000-8000-000000000001"
    assert captured["body"]["model"] == "smollm2:1.7b"
    assert captured["body"]["stream"] is False
    assert captured["body"]["think"] is False
    assert captured["body"]["options"] == {"temperature": 0, "num_predict": 350}
    assert "disclaimer" not in json.dumps(captured["body"]["format"]).lower()


@pytest.mark.parametrize("status", [400, 401, 404, 500, 503])
def test_non_success_and_missing_model_are_sanitized_unavailable(
    settings_factory, status
):
    def handler(_request):
        return httpx.Response(status, json={"error": "private Ollama model detail"})

    client, http_client = build_client(settings_factory, handler)
    try:
        with pytest.raises(GenerationUnavailableError) as captured:
            run(
                client.generate(
                    system="system",
                    prompt="prompt",
                    output_schema=OpportunitySummaryModelOutput,
                    output_tokens=350,
                    request_id="request-id",
                )
            )
    finally:
        run(http_client.aclose())
    assert "private Ollama" not in str(captured.value)


def test_timeout_is_normalized(settings_factory):
    def handler(request):
        raise httpx.ReadTimeout("private prompt timeout", request=request)

    client, http_client = build_client(settings_factory, handler)
    try:
        with pytest.raises(GenerationTimeoutError):
            run(
                client.generate(
                    system="system",
                    prompt="prompt",
                    output_schema=OpportunitySummaryModelOutput,
                    output_tokens=350,
                    request_id="request-id",
                )
            )
    finally:
        run(http_client.aclose())


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b"not-json"),
        httpx.Response(200, json={"response": "{}", "done": False}),
        httpx.Response(200, json={"done": True}),
        httpx.Response(200, json={"response": 123, "done": True}),
    ],
)
def test_invalid_ollama_envelopes_are_rejected(settings_factory, response):
    client, http_client = build_client(settings_factory, lambda _request: response)
    try:
        with pytest.raises(MalformedModelResponseError):
            run(
                client.generate(
                    system="system",
                    prompt="prompt",
                    output_schema=OpportunitySummaryModelOutput,
                    output_tokens=350,
                    request_id="request-id",
                )
            )
    finally:
        run(http_client.aclose())
