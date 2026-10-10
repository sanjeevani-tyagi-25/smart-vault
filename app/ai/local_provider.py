import logging
from typing import Dict, Any, List

from app.ai.base import BaseAIProvider
from app.ai.extractors import extract_text_and_ocr
from app.ai.document_parser import parse_document_text
from app.ai.schemas import ExtractionResult

logger = logging.getLogger(__name__)


class LocalOCRProvider(BaseAIProvider):
    """
    Genuine local document processing provider.
    Extracts text from uploaded PDFs using pypdf and images using RapidOCR.
    Structures fields deterministically without fabricating missing data.
    """

    async def extract_document(
        self,
        file_bytes: bytes,
        mime_type: str,
        filename: str,
    ) -> Dict[str, Any]:
        # 1. Extract actual text & genuine OCR confidence from uploaded file bytes
        raw_text, ocr_conf = extract_text_and_ocr(file_bytes, mime_type, filename)

        # 2. Parse into structured document-specific fields
        if not raw_text.strip():
            logger.info("No readable text found in document: %s", filename)
            result = {
                "doc_type": "Other",
                "title": filename.rsplit(".", 1)[0].replace("_", " ").title(),
                "fields": {
                    "number": None,
                    "holder_name": None,
                    "issue_date": None,
                    "expiry_date": None,
                    "issuer": None,
                    "extra": {},
                },
                "confidence": {
                    "doc_type": 0.0,
                    "number": 0.0,
                    "holder_name": 0.0,
                    "issue_date": 0.0,
                    "expiry_date": 0.0,
                },
                "raw_text": "",
                "language": "en",
                "provider": "local_ocr",
            }
        else:
            result = parse_document_text(raw_text, filename, ocr_confidence=ocr_conf)

        # Validate through Pydantic
        validated = ExtractionResult.model_validate(result)
        return validated.model_dump()

    async def answer_question(
        self,
        question: str,
        documents: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Keyword and schema-grounded search across loaded document fields."""
        q_lower = question.lower()

        # 1. PUC Inquiry
        if any(k in q_lower for k in ["puc", "pollution", "emission test", "pucc"]):
            puc_docs = [d for d in documents if d.get("doc_type", "").upper() == "PUC" or "pollution" in d.get("doc_type", "").lower()]
            if not puc_docs:
                return {
                    "answer": "I couldn't find an uploaded PUC certificate in your vault, so I can't determine its expiry date.",
                    "sources": [],
                }
            doc = puc_docs[0]
            fields = doc.get("fields") or {}
            title = doc.get("title", "PUC Certificate")
            exp = doc.get("expiry_date") or fields.get("expiry_date")
            doc_id = doc.get("id") or 1
            if exp:
                return {
                    "answer": f"Source: {title}\nYour PUC certificate is valid until {exp}.",
                    "sources": [{"document_id": doc_id, "title": title, "field": "expiry_date", "value": str(exp)}],
                }
            else:
                return {
                    "answer": f"Source: {title}\nPUC expiry: Not available — no valid expiry date was extracted from your uploaded PUC certificate.",
                    "sources": [{"document_id": doc_id, "title": title, "field": "expiry_date", "value": "Unavailable"}],
                }

        # 2. RC Inquiry
        is_rc_query = any(k in q_lower for k in [
            "rc", "registration certificate", "vehicle registration", "registration number",
            "reg no", "regn no", "chassis", "engine number", "vehicle details", "car details"
        ]) or (
            any(k in q_lower for k in ["vehicle", "car", "bike"]) and
            any(k in q_lower for k in ["number", "owner", "registration", "valid", "detail", "registered"])
        )
        if is_rc_query:
            rc_docs = [d for d in documents if d.get("doc_type", "").upper() == "RC" or "registration" in d.get("doc_type", "").lower()]
            if not rc_docs:
                return {
                    "answer": "I couldn't find an uploaded vehicle Registration Certificate (RC) in your vault.",
                    "sources": [],
                }
            doc = rc_docs[0]
            fields = doc.get("fields") or {}
            title = doc.get("title", "Registration Certificate (RC)")
            doc_id = doc.get("id") or 1
            reg_no = fields.get("number")
            owner = fields.get("holder_name")
            validity = doc.get("expiry_date") or fields.get("expiry_date")

            lines = [f"Source: {title}"]
            sources = []
            if reg_no:
                lines.append(f"Registration number: {reg_no}")
                sources.append({"document_id": doc_id, "title": title, "field": "number", "value": str(reg_no)})
            if owner:
                lines.append(f"Registered owner: {owner}")
                sources.append({"document_id": doc_id, "title": title, "field": "holder_name", "value": str(owner)})
            if validity:
                lines.append(f"Registration validity: {validity} (Note: Vehicle registration validity, not PUC expiry).")
                sources.append({"document_id": doc_id, "title": title, "field": "validity", "value": str(validity)})

            return {
                "answer": "\n".join(lines),
                "sources": sources,
            }

        # 3. Generic field matching
        matching_sources = []
        answer_parts = []

        for doc in documents:
            title = doc.get("title", "Document")
            fields = doc.get("fields") or {}
            doc_id = doc.get("id") or 1

            for f_name, f_val in fields.items():
                if f_val and any(term in q_lower for term in [f_name, str(f_val).lower(), doc.get("doc_type", "").lower()]):
                    matching_sources.append({
                        "document_id": doc_id,
                        "title": title,
                        "field": f_name,
                        "value": str(f_val),
                    })
                    answer_parts.append(f"{title} ({f_name}: {f_val})")

        if matching_sources:
            return {
                "answer": "Relevant document records found: " + "; ".join(answer_parts[:3]),
                "sources": matching_sources[:3],
            }

        return {
            "answer": "No relevant documents found matching your query.",
            "sources": [],
        }
