"""Feature-specific structured generation with bounded local concurrency."""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from pydantic import BaseModel, ValidationError

from app.config import Settings
from app.errors import ServiceError
from app.generation_schemas import (
    CoverLetterData,
    CoverLetterModelOutput,
    CoverLetterRequest,
    CvAnalysisData,
    CvAnalysisModelOutput,
    CvAnalysisRequest,
    DISCLAIMERS,
    EssayAssistanceData,
    EssayAssistanceModelOutput,
    EssayAssistanceRequest,
    EssayMode,
    ModelMetadata,
    OpportunitySummaryData,
    OpportunitySummaryModelOutput,
    OpportunitySummaryRequest,
    ReadinessData,
    ReadinessModelOutput,
    ReadinessRequest,
)
from app.prompts.cover_letter import cover_letter_prompt
from app.prompts.cv_analysis import cv_analysis_prompt
from app.prompts.essay_assistance import essay_assistance_prompt
from app.prompts.opportunity_summary import opportunity_summary_prompt
from app.prompts.readiness import readiness_prompt
from app.prompts.shared import PromptParts
from app.services.ollama_client import (
    GenerationTimeoutError,
    GenerationUnavailableError,
    MalformedModelResponseError,
    OllamaClient,
)


InputModel = TypeVar("InputModel", bound=BaseModel)
OutputModel = TypeVar("OutputModel", bound=BaseModel)


class CorrectableStructuredOutputError(RuntimeError):
    """The generated content may be regenerated against the same strict schema."""


class SemanticallyUnsupportedOutputError(RuntimeError):
    """The content is structurally valid but violates a semantic safety rule."""


@dataclass(frozen=True, slots=True)
class FeatureDefinition:
    configuration_name: str
    output_schema: type[BaseModel]
    data_schema: type[BaseModel]
    prompt_builder: Callable[[dict[str, Any]], PromptParts]
    output_tokens: int


FEATURES = {
    "opportunity-summary": FeatureDefinition(
        "opportunity_summary",
        OpportunitySummaryModelOutput,
        OpportunitySummaryData,
        opportunity_summary_prompt,
        350,
    ),
    "readiness": FeatureDefinition(
        "readiness",
        ReadinessModelOutput,
        ReadinessData,
        readiness_prompt,
        400,
    ),
    "cv-analysis": FeatureDefinition(
        "cv_analysis",
        CvAnalysisModelOutput,
        CvAnalysisData,
        cv_analysis_prompt,
        650,
    ),
    "cover-letter": FeatureDefinition(
        "cover_letter",
        CoverLetterModelOutput,
        CoverLetterData,
        cover_letter_prompt,
        500,
    ),
    "essay-assistance": FeatureDefinition(
        "essay_assistance",
        EssayAssistanceModelOutput,
        EssayAssistanceData,
        essay_assistance_prompt,
        650,
    ),
}
ESSAY_OUTPUT_TOKENS = {
    EssayMode.BRAINSTORM: 300,
    EssayMode.OUTLINE: 350,
    EssayMode.REVIEW: 400,
    EssayMode.REVISE: 500,
}


class GenerationService:
    def __init__(self, *, settings: Settings, client: OllamaClient | None) -> None:
        self._enabled = settings.generation_enabled
        self._enabled_features = settings.generation_features
        self._client = client
        self._model_name = settings.ollama_model
        self._max_input_chars = settings.ollama_max_input_chars
        self._timeout_seconds = settings.ollama_timeout_seconds
        self._semaphore = asyncio.Semaphore(settings.ollama_max_concurrency)

    @staticmethod
    def _parse_model_output(raw_output: str, output_schema: type[BaseModel]) -> BaseModel:
        try:
            decoded = json.loads(raw_output)
        except (TypeError, json.JSONDecodeError) as error:
            raise CorrectableStructuredOutputError from error
        if isinstance(decoded, dict) and set(decoded) == {"refusal"}:
            raise ServiceError(
                422,
                "MODEL_REFUSAL",
                "The model could not complete this request.",
            )
        try:
            return output_schema.model_validate(decoded)
        except ValidationError as error:
            if any(
                item.get("type") == "semantic_outcome_guarantee"
                for item in error.errors()
            ):
                raise SemanticallyUnsupportedOutputError from error
            raise CorrectableStructuredOutputError from error

    @staticmethod
    def _correction_prompt(
        *, original_prompt: str, output_schema: type[BaseModel]
    ) -> str:
        required_schema = json.dumps(
            output_schema.model_json_schema(),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        return (
            f"{original_prompt}\n"
            "SCHEMA_CORRECTION_INSTRUCTIONS_START\n"
            "The previous response was not valid for the required JSON schema. "
            "Generate a new response from the supplied untrusted data. Return only one JSON object that exactly matches the required schema. "
            "Do not include analysis, markdown, alternate keys, or the previous response.\n"
            "REQUIRED_JSON_SCHEMA_START\n"
            f"{required_schema}\n"
            "REQUIRED_JSON_SCHEMA_END\n"
            "SCHEMA_CORRECTION_INSTRUCTIONS_END"
        )

    async def _generate(
        self,
        *,
        feature: str,
        payload: BaseModel,
        request_id: str,
    ) -> BaseModel:
        definition = FEATURES[feature]
        if (
            not self._enabled
            or definition.configuration_name not in self._enabled_features
            or self._client is None
        ):
            raise ServiceError(
                503,
                "GENERATION_UNAVAILABLE",
                "Generation is temporarily unavailable.",
            )
        input_data = payload.model_dump(mode="json")
        serialized = json.dumps(input_data, ensure_ascii=False, separators=(",", ":"))
        if len(serialized) > self._max_input_chars:
            raise ServiceError(
                422,
                "VALIDATION_ERROR",
                "The request data is invalid.",
            )
        prompt = definition.prompt_builder(input_data)
        output_tokens = (
            ESSAY_OUTPUT_TOKENS[payload.mode]
            if isinstance(payload, EssayAssistanceRequest)
            else definition.output_tokens
        )
        try:
            async with self._semaphore:
                async with asyncio.timeout(self._timeout_seconds):
                    raw_output = await self._client.generate(
                        system=prompt.system,
                        prompt=prompt.prompt,
                        output_schema=definition.output_schema,
                        output_tokens=output_tokens,
                        request_id=request_id,
                    )
                    try:
                        model_output = self._parse_model_output(
                            raw_output, definition.output_schema
                        )
                    except CorrectableStructuredOutputError:
                        corrected_output = await self._client.generate(
                            system=prompt.system,
                            prompt=self._correction_prompt(
                                original_prompt=prompt.prompt,
                                output_schema=definition.output_schema,
                            ),
                            output_schema=definition.output_schema,
                            output_tokens=output_tokens,
                            request_id=request_id,
                        )
                        try:
                            model_output = self._parse_model_output(
                                corrected_output, definition.output_schema
                            )
                        except CorrectableStructuredOutputError as error:
                            raise MalformedModelResponseError from error
            server_fields: dict[str, Any] = {
                **model_output.model_dump(mode="python"),
                "disclaimer": DISCLAIMERS[feature],
                "modelMetadata": ModelMetadata(name=self._model_name),
            }
            if isinstance(payload, EssayAssistanceRequest):
                server_fields["mode"] = payload.mode
            return definition.data_schema.model_validate(server_fields)
        except ServiceError:
            raise
        except (GenerationTimeoutError, TimeoutError):
            raise ServiceError(
                504,
                "GENERATION_TIMEOUT",
                "Generation timed out.",
            ) from None
        except GenerationUnavailableError:
            raise ServiceError(
                503,
                "GENERATION_UNAVAILABLE",
                "Generation is temporarily unavailable.",
            ) from None
        except (MalformedModelResponseError, ValidationError):
            raise ServiceError(
                502,
                "MALFORMED_MODEL_RESPONSE",
                "The model returned an invalid response.",
            ) from None
        except SemanticallyUnsupportedOutputError:
            raise ServiceError(
                502,
                "MALFORMED_MODEL_RESPONSE",
                "The model returned an invalid response.",
            ) from None
        except Exception:
            raise ServiceError(
                503,
                "GENERATION_UNAVAILABLE",
                "Generation is temporarily unavailable.",
            ) from None

    async def opportunity_summary(
        self, payload: OpportunitySummaryRequest, request_id: str
    ) -> OpportunitySummaryData:
        return await self._generate(
            feature="opportunity-summary", payload=payload, request_id=request_id
        )

    async def readiness(
        self, payload: ReadinessRequest, request_id: str
    ) -> ReadinessData:
        return await self._generate(
            feature="readiness", payload=payload, request_id=request_id
        )

    async def cv_analysis(
        self, payload: CvAnalysisRequest, request_id: str
    ) -> CvAnalysisData:
        return await self._generate(
            feature="cv-analysis", payload=payload, request_id=request_id
        )

    async def cover_letter(
        self, payload: CoverLetterRequest, request_id: str
    ) -> CoverLetterData:
        return await self._generate(
            feature="cover-letter", payload=payload, request_id=request_id
        )

    async def essay_assistance(
        self, payload: EssayAssistanceRequest, request_id: str
    ) -> EssayAssistanceData:
        return await self._generate(
            feature="essay-assistance", payload=payload, request_id=request_id
        )
