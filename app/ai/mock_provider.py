import asyncio
from typing import Dict, Any, List

from app.ai.base import BaseAIProvider
from app.ai.mock_data import get_mock_extraction
from app.ai.schemas import ExtractionResult


class MockAIProvider(BaseAIProvider):
    """Canned mock provider for rock-solid hackathon demos without network dependency."""

    async def extract_document(
        self,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        # Artificial delay (1.2 seconds) so loading state is visible in demo
        await asyncio.sleep(1.2)

        data = get_mock_extraction(filename)
        # Validate through Pydantic model to guarantee schema compliance
        validated = ExtractionResult.model_validate(data)
        return validated.model_dump()

    async def answer_question(
        self,
        question: str,
        documents: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        await asyncio.sleep(1.0)
        q_lower = question.lower()
        if "insurance" in q_lower:
            return {
                "answer": "Your vehicle insurance (HDFC ERGO) expires in 12 days.",
                "sources": [
                    {
                        "document_id": documents[0]["id"] if documents else 1,
                        "title": "HDFC ERGO Policy",
                        "field": "expiry_date",
                        "value": "in 12 days",
                    }
                ],
            }
        return {
            "answer": "No relevant documents found answering your question.",
            "sources": [],
        }
