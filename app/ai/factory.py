from app.config import AI_MOCK, GEMINI_API_KEY
from app.ai.base import BaseAIProvider
from app.ai.mock_provider import MockAIProvider
from app.ai.gemini_provider import GeminiProvider


def get_ai_provider() -> BaseAIProvider:
    """
    Factory function returning active AI provider.
    Switching providers is a one-line configuration in .env:
    AI_MOCK=true -> MockAIProvider
    AI_MOCK=false + GEMINI_API_KEY -> GeminiProvider
    """
    if AI_MOCK or not GEMINI_API_KEY or GEMINI_API_KEY == "mock-gemini-key":
        return MockAIProvider()
    return GeminiProvider()
