import asyncio
import logging
from typing import Dict, Any, List
from google import genai
from google.genai import types

from app.config import GEMINI_API_KEY, AI_MODEL, AI_TIMEOUT_SECONDS
from app.ai.base import BaseAIProvider
from app.ai.prompts import EXTRACTION_SYSTEM_PROMPT
from app.ai.schemas import parse_and_validate_ai_json
from app.ai.local_provider import LocalOCRProvider

logger = logging.getLogger(__name__)


class GeminiProvider(BaseAIProvider):
    """Google Gemini Provider using official google-genai SDK with automatic local OCR fallback."""

    def __init__(self, api_key: str = GEMINI_API_KEY, model: str = AI_MODEL):
        if not api_key or api_key == "mock-gemini-key":
            self.client = None
        else:
            try:
                self.client = genai.Client(api_key=api_key)
            except Exception as e:
                logger.warning("Could not initialize Gemini Client: %s", e)
                self.client = None
        self.model = model
        self.local_fallback = LocalOCRProvider()

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
        """
        Extract structured fields using Gemini multimodal vision.
        If Gemini is unavailable or errors, falls back to genuine Local OCR extraction.
        """
        if not self.client:
            logger.info("Gemini client not configured. Using local OCR extraction.")
            res = await self.local_fallback.extract_document(file_bytes, mime_type, filename)
            res["provider"] = "local_ocr"
            return res

        # Attempt Gemini multimodal extraction
        try:
            media_part = types.Part.from_bytes(data=file_bytes, mime_type=mime_type)
            raw_response = await asyncio.wait_for(
                asyncio.to_thread(self._call_model, [media_part], EXTRACTION_SYSTEM_PROMPT),
                timeout=AI_TIMEOUT_SECONDS,
            )
            validated = parse_and_validate_ai_json(raw_response)
            result = validated.model_dump()
            result["provider"] = "gemini"
            return result
        except asyncio.TimeoutError:
            logger.warning("Gemini extraction timed out after %ss. Falling back to local OCR.", AI_TIMEOUT_SECONDS)
        except Exception as err:
            logger.warning("Gemini extraction error (%s). Falling back to local OCR.", err)

        # Fallback to genuine local OCR extraction on the actual file
        fallback_res = await self.local_fallback.extract_document(file_bytes, mime_type, filename)
        fallback_res["provider"] = "local_ocr_fallback"
        return fallback_res

    async def answer_question(
        self,
        question: str,
        documents: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Answers natural language questions with local or gemini search."""
        return await self.local_fallback.answer_question(question, documents)
