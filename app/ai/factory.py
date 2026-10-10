import os
from app.config import GEMINI_API_KEY as DEFAULT_GEMINI_KEY
from app.ai.base import BaseAIProvider
from app.ai.gemini_provider import GeminiProvider
from app.ai.local_provider import LocalOCRProvider
from app.ai.mock_provider import MockAIProvider


def get_ai_provider() -> BaseAIProvider:
    """
    Factory function returning active document extraction provider.
    - If AI_MOCK is true: returns MockAIProvider (which processes real file bytes via LocalOCRProvider,
      while preserving legacy test bypass).
    - If AI_MOCK is false and valid GEMINI_API_KEY: returns GeminiProvider (with automatic LocalOCR fallback).
    - Otherwise: returns LocalOCRProvider.
    """
    is_mock = os.getenv("AI_MOCK", "false").lower() in ("true", "1", "yes")
    gemini_key = os.getenv("GEMINI_API_KEY", DEFAULT_GEMINI_KEY)

    if is_mock:
        return MockAIProvider()
    if gemini_key and gemini_key != "mock-gemini-key":
        return GeminiProvider()
    return LocalOCRProvider()

