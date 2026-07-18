"""Request IDs, body limits, internal authentication, and safe logging."""

from __future__ import annotations

import hmac
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID, uuid4

from fastapi import Request
from starlette.datastructures import Headers

from app.config import DEFAULT_MODEL_REQUEST_MAX_BYTES
from app.errors import ServiceError, error_response


logger = logging.getLogger("ascent_model_service.requests")
ASGIApp = Callable[
    [dict[str, Any], Callable[[], Awaitable[dict[str, Any]]], Callable[[dict[str, Any]], Awaitable[None]]],
    Awaitable[None],
]


class RequestBodyTooLarge(Exception):
    """Internal signal used while consuming an oversized ASGI body."""


def _safe_request_id(headers: Headers) -> str:
    candidate = headers.get("x-request-id", "")
    if 1 <= len(candidate) <= 36:
        try:
            parsed = UUID(candidate)
            if str(parsed) == candidate.lower():
                return str(parsed)
        except ValueError:
            pass
    return str(uuid4())


def _content_length(headers: Headers) -> int | None:
    values = headers.getlist("content-length")
    if not values:
        return None
    if len(set(values)) != 1:
        raise ValueError("Conflicting Content-Length headers.")
    raw_value = values[0]
    if not raw_value or not raw_value.isascii() or not raw_value.isdecimal():
        raise ValueError("Invalid Content-Length header.")
    if len(raw_value) > 20:
        raise RequestBodyTooLarge
    return int(raw_value)


class RequestSafetyMiddleware:
    """Pure ASGI middleware that does not consume or log request content."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(
        self,
        scope: dict[str, Any],
        receive: Callable[[], Awaitable[dict[str, Any]]],
        send: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        request_id = _safe_request_id(headers)
        scope.setdefault("state", {})["request_id"] = request_id
        method = scope.get("method", "UNKNOWN")
        route = scope.get("path", "/")
        started_at = time.perf_counter()
        status_code = 500
        response_started = False
        app_instance = scope.get("app")
        settings = getattr(getattr(app_instance, "state", None), "settings", None)
        max_bytes = getattr(
            settings, "request_max_bytes", DEFAULT_MODEL_REQUEST_MAX_BYTES
        )

        async def send_with_headers(message: dict[str, Any]) -> None:
            nonlocal status_code, response_started
            if message["type"] == "http.response.start":
                response_started = True
                status_code = message["status"]
                response_headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() not in {b"x-request-id", b"cache-control"}
                ]
                response_headers.append((b"x-request-id", request_id.encode("ascii")))
                if route == "/v1/match":
                    response_headers.append((b"cache-control", b"no-store"))
                message["headers"] = response_headers
            await send(message)

        received_bytes = 0

        async def receive_with_limit() -> dict[str, Any]:
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > max_bytes:
                    raise RequestBodyTooLarge
            return message

        async def send_error(status: int, code: str, message: str) -> None:
            response = error_response(
                status_code=status,
                code=code,
                message=message,
                request_id=request_id,
            )
            await response(scope, receive, send_with_headers)

        try:
            try:
                declared_length = _content_length(headers)
            except ValueError:
                await send_error(
                    400,
                    "INVALID_CONTENT_LENGTH",
                    "The Content-Length header is invalid.",
                )
                return
            if declared_length is not None and declared_length > max_bytes:
                raise RequestBodyTooLarge
            await self.app(scope, receive_with_limit, send_with_headers)
        except RequestBodyTooLarge:
            if not response_started:
                await send_error(
                    413,
                    "REQUEST_TOO_LARGE",
                    "The request body is too large.",
                )
        finally:
            duration_ms = (time.perf_counter() - started_at) * 1000
            logger.info(
                "request_complete request_id=%s method=%s route=%s status=%s duration_ms=%.2f",
                request_id,
                method,
                route,
                status_code,
                duration_ms,
            )


async def require_internal_key(request: Request) -> None:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        raise ServiceError(
            503, "MODEL_UNAVAILABLE", "The matching model is temporarily unavailable."
        )
    expected_key = settings.api_key
    if expected_key is None:
        return
    supplied_key = request.headers.get("x-model-service-key", "")
    if not hmac.compare_digest(supplied_key, expected_key):
        raise ServiceError(
            401,
            "UNAUTHORIZED",
            "Valid internal service credentials are required.",
        )
