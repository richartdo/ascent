"""Internally authenticated structured-generation routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.errors import ServiceError
from app.generation_schemas import (
    CoverLetterRequest,
    CoverLetterResponse,
    CvAnalysisRequest,
    CvAnalysisResponse,
    EssayAssistanceRequest,
    EssayAssistanceResponse,
    OpportunitySummaryRequest,
    OpportunitySummaryResponse,
    ReadinessRequest,
    ReadinessResponse,
)
from app.middleware import require_internal_key
from app.services.generation_service import GenerationService


def _service(request: Request) -> GenerationService:
    service = getattr(request.app.state, "generation_service", None)
    if service is None:
        raise ServiceError(
            503,
            "GENERATION_UNAVAILABLE",
            "Generation is temporarily unavailable.",
        )
    return service


def create_generation_router() -> APIRouter:
    router = APIRouter(
        prefix="/v1/generate",
        dependencies=[Depends(require_internal_key)],
    )

    @router.post(
        "/opportunity-summary", response_model=OpportunitySummaryResponse
    )
    async def opportunity_summary(
        request: Request, payload: OpportunitySummaryRequest
    ) -> OpportunitySummaryResponse:
        data = await _service(request).opportunity_summary(
            payload, request.state.request_id
        )
        return OpportunitySummaryResponse(
            data=data, requestId=request.state.request_id
        )

    @router.post("/readiness", response_model=ReadinessResponse)
    async def readiness(
        request: Request, payload: ReadinessRequest
    ) -> ReadinessResponse:
        data = await _service(request).readiness(payload, request.state.request_id)
        return ReadinessResponse(data=data, requestId=request.state.request_id)

    @router.post("/cv-analysis", response_model=CvAnalysisResponse)
    async def cv_analysis(
        request: Request, payload: CvAnalysisRequest
    ) -> CvAnalysisResponse:
        data = await _service(request).cv_analysis(payload, request.state.request_id)
        return CvAnalysisResponse(data=data, requestId=request.state.request_id)

    @router.post("/cover-letter", response_model=CoverLetterResponse)
    async def cover_letter(
        request: Request, payload: CoverLetterRequest
    ) -> CoverLetterResponse:
        data = await _service(request).cover_letter(payload, request.state.request_id)
        return CoverLetterResponse(data=data, requestId=request.state.request_id)

    @router.post("/essay-assistance", response_model=EssayAssistanceResponse)
    async def essay_assistance(
        request: Request, payload: EssayAssistanceRequest
    ) -> EssayAssistanceResponse:
        data = await _service(request).essay_assistance(
            payload, request.state.request_id
        )
        return EssayAssistanceResponse(data=data, requestId=request.state.request_id)

    return router
