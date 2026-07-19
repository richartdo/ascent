"""FastAPI entry point for Ascent's internal matching model."""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings
from app.errors import (
    ServiceError,
    http_error_handler,
    service_error_handler,
    unexpected_error_handler,
    validation_error_handler,
)
from app.middleware import RequestSafetyMiddleware, require_internal_key
from app.routes.generation import create_generation_router
from app.schemas import (
    HealthData,
    HealthResponse,
    MatchData,
    MatchRequest,
    MatchResponse,
)
from app.services.matching_service import MatchingService
from app.services.generation_service import GenerationService
from app.services.ollama_client import OllamaClient


logger = logging.getLogger("ascent_model_service.inference")
# Uvicorn's default access format may include a raw query string. The service's
# request middleware emits the approved path-only access record instead.
logging.getLogger("uvicorn.access").disabled = True
DISCLAIMER = "This score is guidance, not a guarantee of eligibility or selection."
ModelLoader = Callable[[object], MatchingService]
OllamaClientFactory = Callable[[Settings], OllamaClient]


def default_ollama_client_factory(settings: Settings) -> OllamaClient:
    return OllamaClient(settings=settings)


def create_app(
    *,
    settings: Settings | None = None,
    model_loader: ModelLoader = MatchingService.load,
    ollama_client_factory: OllamaClientFactory = default_ollama_client_factory,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        resolved_settings = settings or Settings.from_environment()
        application.state.settings = resolved_settings
        application.state.matching_service = model_loader(
            resolved_settings.model_path
        )
        ollama_client = (
            ollama_client_factory(resolved_settings)
            if resolved_settings.generation_enabled
            else None
        )
        application.state.generation_service = GenerationService(
            settings=resolved_settings,
            client=ollama_client,
        )
        try:
            yield
        finally:
            if ollama_client is not None:
                await ollama_client.close()
            application.state.generation_service = None
            application.state.matching_service = None

    application = FastAPI(
        title="Ascent Model Service",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    application.add_middleware(RequestSafetyMiddleware)
    application.add_exception_handler(ServiceError, service_error_handler)
    application.add_exception_handler(RequestValidationError, validation_error_handler)
    application.add_exception_handler(StarletteHTTPException, http_error_handler)
    application.add_exception_handler(Exception, unexpected_error_handler)
    application.include_router(create_generation_router())

    @application.get("/health", response_model=HealthResponse)
    async def health(request: Request) -> HealthResponse:
        matcher = getattr(request.app.state, "matching_service", None)
        if matcher is None:
            raise ServiceError(
                503,
                "MODEL_UNAVAILABLE",
                "The matching model is temporarily unavailable.",
            )
        return HealthResponse(
            data=HealthData(
                status="ok",
                service="ascent-model-service",
                modelLoaded=True,
                modelVersion=matcher.model_version,
                syntheticBaseline=matcher.synthetic_baseline,
            ),
            requestId=request.state.request_id,
        )

    @application.post(
        "/v1/match",
        response_model=MatchResponse,
        dependencies=[Depends(require_internal_key)],
    )
    async def match(request: Request, payload: MatchRequest) -> MatchResponse:
        matcher = getattr(request.app.state, "matching_service", None)
        if matcher is None:
            raise ServiceError(
                503,
                "MODEL_UNAVAILABLE",
                "The matching model is temporarily unavailable.",
            )
        values = payload.model_dump(mode="json")
        try:
            result = await run_in_threadpool(matcher.predict, values)
        except Exception as error:
            logger.error(
                "inference_failed request_id=%s error_type=%s",
                request.state.request_id,
                type(error).__name__,
            )
            raise ServiceError(
                500,
                "INFERENCE_ERROR",
                "The match score could not be generated.",
            ) from None
        return MatchResponse(
            data=MatchData(
                matchScore=result.match_score,
                predictedMatch=result.predicted_match,
                probability=result.probability,
                modelVersion=matcher.model_version,
                syntheticBaseline=matcher.synthetic_baseline,
                disclaimer=DISCLAIMER,
            ),
            requestId=request.state.request_id,
        )

    return application


app = create_app()
