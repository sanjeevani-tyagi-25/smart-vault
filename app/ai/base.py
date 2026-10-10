from abc import ABC, abstractmethod
from typing import Dict, Any, List


class BaseAIProvider(ABC):
    """Abstract interface for AI Document Extraction and Q&A."""

    @abstractmethod
    async def extract_document(
        self,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        """
        Extract structured fields, confidence scores, and raw OCR from document.
        Returns validated dictionary conforming to ExtractionResult schema.
        """
        pass

    @abstractmethod
    async def answer_question(
        self,
        question: str,
        documents: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Answers natural language question with cited document sources.
        Returns dict with keys: 'answer' and 'sources'.
        """
        pass
