import asyncio
import logging
from typing import Dict, Any, List
from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, AI_MODEL, AI_TIMEOUT_SECONDS
from app.ai.base import BaseAIProvider
from app.ai.prompts import EXTRACTION_SYSTEM_PROMPT, EMPTY_EDITABLE_TEMPLATE
from app.ai.schemas import parse_and_validate_ai_json

logger = logging.getLogger(__name__)


class GeminiProvider(BaseAIProvider):
    """Google Gemini Provider using official google-genai SDK."""

    def __init__(self, api_key: str = GEMINI_API_KEY, model: str = AI_MODEL):
        if not api_key or api_key == "mock-gemini-key":
            self.client = None
        else:
            self.client = genai.Client(api_key=api_key)
        self.model = model

    def _call_model(self, parts: list, prompt_text: str) -> str:
        """Synchronous call to Gemini SDK wrapped in thread."""
        if not self.client:
            raise ValueError("GEMINI_API_KEY is not configured or is a placeholder.")

        contents = [*parts, prompt_text]
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1,
        )
        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )
        return response.text or ""

    async def extract_document(
        self,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        """Extract structured fields using Gemini multimodal vision."""
        if not self.client:
            raise ValueError("Gemini API key is not configured. Please set GEMINI_API_KEY in .env.")

        # Create inline media part
        media_part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)

        # Attempt 1
        try:
            raw_response = await asyncio.wait_for(
                asyncio.to_thread(self._call_model, [media_part], EXTRACTION_SYSTEM_PROMPT),
                timeout=AI_TIMEOUT_SECONDS,
            )
            validated = parse_and_validate_ai_json(raw_response)
            return validated.model_dump()
        except asyncio.TimeoutError:
            logger.error("Gemini extraction timed out after %s seconds", AI_TIMEOUT_SECONDS)
            raise TimeoutError(f"Extraction timed out after {AI_TIMEOUT_SECONDS}s")
        except Exception as first_err:
            logger.warning("First attempt extraction failed to parse JSON, retrying once: %s", type(first_err).__name__)

        # Retry once with explicit json reminder
        try:
            retry_prompt = (
                EXTRACTION_SYSTEM_PROMPT
                + "\n\nCRITICAL: Your previous response could not be parsed as valid JSON. Output strictly valid JSON matching the schema, nothing else."
            )
            raw_response_retry = await asyncio.wait_for(
                asyncio.to_thread(self._call_model, [media_part], retry_prompt),
                timeout=AI_TIMEOUT_SECONDS,
            )
            validated = parse_and_validate_ai_json(raw_response_retry)
            return validated.model_dump()
        except Exception as retry_err:
            logger.error("Gemini extraction retry also failed: %s", type(retry_err).__name__)
            # Return empty editable template with doc_type Other so user can enter manually
            fallback = EMPTY_EDITABLE_TEMPLATE.copy()
            fallback["title"] = filename
            fallback["raw_text"] = "AI could not parse this document automatically. Please fill in details manually."
            return fallback

    async def answer_question(
        self,
        question: str,
        documents: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Stub for Phase 4 Q&A search."""
        return {
            "answer": "Q&A search is configured for Phase 4.",
            "sources": [],
        }
