"""Minimal, sanitized client for Ollama's structured generation endpoint."""

from __future__ import annotations

import httpx
from pydantic import BaseModel, ConfigDict, StrictBool, StrictStr, ValidationError

from app.config import Settings


OLLAMA_GENERATE_PATH = "/api/generate"


class GenerationTimeoutError(RuntimeError):
    pass


class GenerationUnavailableError(RuntimeError):
    pass


class MalformedModelResponseError(RuntimeError):
    pass


class OllamaGenerateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    response: StrictStr
    done: StrictBool


class OllamaClient:
    def __init__(
        self,
        *,
        settings: Settings,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._model = settings.ollama_model
        self._temperature = settings.ollama_temperature
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(
            base_url=settings.ollama_base_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds),
            trust_env=False,
        )

    async def generate(
        self,
        *,
        system: str,
        prompt: str,
        output_schema: type[BaseModel],
        output_tokens: int,
        request_id: str,
    ) -> str:
        payload = {
            "model": self._model,
            "think": False,
            "system": system,
            "prompt": prompt,
            "stream": False,
            "format": output_schema.model_json_schema(),
            "options": {
                "temperature": self._temperature,
                "num_predict": output_tokens,
            },
        }
        try:
            response = await self._client.post(
                OLLAMA_GENERATE_PATH,
                json=payload,
                headers={"X-Request-ID": request_id},
            )
        except httpx.TimeoutException as error:
            raise GenerationTimeoutError from error
        except httpx.HTTPError as error:
            raise GenerationUnavailableError from error

        if response.status_code == 404:
            raise GenerationUnavailableError
        if response.status_code != 200:
            raise GenerationUnavailableError
        try:
            envelope = OllamaGenerateResponse.model_validate(response.json())
        except (ValueError, ValidationError) as error:
            raise MalformedModelResponseError from error
        if not envelope.done or not envelope.response.strip():
            raise MalformedModelResponseError
        return envelope.response

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()
