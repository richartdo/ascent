"""Sanitized service errors and FastAPI exception handlers."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


logger = logging.getLogger("ascent_model_service.errors")


@dataclass(slots=True)
class ServiceError(Exception):
    status_code: int
    code: str
    message: str


def request_id_for(request: Request) -> str:
    return getattr(request.state, "request_id", "unavailable")


def error_response(
    *, status_code: int, code: str, message: str, request_id: str
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "requestId": request_id,
            }
        },
    )


async def service_error_handler(request: Request, error: ServiceError) -> JSONResponse:
    return error_response(
        status_code=error.status_code,
        code=error.code,
        message=error.message,
        request_id=request_id_for(request),
    )


async def validation_error_handler(
    request: Request, error: RequestValidationError
) -> JSONResponse:
    malformed_json = any(item.get("type") == "json_invalid" for item in error.errors())
    if malformed_json:
        return error_response(
            status_code=400,
            code="MALFORMED_JSON",
            message="The request body contains malformed JSON.",
            request_id=request_id_for(request),
        )
    return error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        message="The request data is invalid.",
        request_id=request_id_for(request),
    )


async def http_error_handler(
    request: Request, error: StarletteHTTPException
) -> JSONResponse:
    if error.status_code == 404:
        code, message = "NOT_FOUND", "The requested resource was not found."
    elif error.status_code == 405:
        code, message = "METHOD_NOT_ALLOWED", "The request method is not allowed."
    else:
        code, message = "HTTP_ERROR", "The request could not be completed."
    return error_response(
        status_code=error.status_code,
        code=code,
        message=message,
        request_id=request_id_for(request),
    )


async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
    logger.error(
        "unexpected_error request_id=%s error_type=%s",
        request_id_for(request),
        type(error).__name__,
    )
    return error_response(
        status_code=500,
        code="INTERNAL_ERROR",
        message="The request could not be completed.",
        request_id=request_id_for(request),
    )
