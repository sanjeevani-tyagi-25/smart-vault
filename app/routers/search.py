import json
import asyncio
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from app.config import AI_MOCK, GEMINI_API_KEY, AI_MODEL, AI_TIMEOUT_SECONDS
from app.database import get_db
from app.models import User, Document, Asset
from app.auth import get_current_user

router = APIRouter(prefix="/search", tags=["Search"])


class SearchQuery(BaseModel):
    query: str


class SourceCitation(BaseModel):
    document_id: int
    title: str
    field: str
    value: str


class SearchResponse(BaseModel):
    answer: str
    sources: List[SourceCitation] = []


@router.post("", response_model=SearchResponse)
async def natural_language_search(
    body: SearchQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Natural-language Q&A across the authenticated user's documents.
    Answers strictly from extracted document metadata and raw OCR text with citations.
    """
    query_str = body.query.strip()
    if not query_str:
        return SearchResponse(answer="Please enter a question to search your vault.", sources=[])

    user_docs = db.query(Document).filter(Document.user_id == current_user.id).all()
    user_assets = db.query(Asset).filter(Asset.user_id == current_user.id).all()

    if not user_docs and not user_assets:
        return SearchResponse(answer="Your vault has no documents yet. Please add an asset and upload your documents.", sources=[])

    q_lower = query_str.lower()
    today = datetime.now(timezone.utc).date()

    # --- Fast Mock & Fallback Matcher ---
    if AI_MOCK or not GEMINI_API_KEY or GEMINI_API_KEY == "mock-gemini-key":
        await asyncio.sleep(0.8)  # realistic micro-delay

        # 1. Car insurance inquiry
        if "insurance" in q_lower:
            ins_docs = [d for d in user_docs if "insurance" in d.doc_type.lower()]
            if ins_docs:
                doc = ins_docs[0]
                exp = doc.expiry_date
                if exp:
                    try:
                        exp_dt = datetime.strptime(exp, "%Y-%m-%d").date()
                        days = (exp_dt - today).days
                        val = f"{exp} (in {days} days)" if days > 0 else f"{exp} (expired {abs(days)} days ago)"
                    except ValueError:
                        val = exp
                    return SearchResponse(
                        answer=f"Your {doc.title} expires on {val}.",
                        sources=[SourceCitation(document_id=doc.id, title=doc.title, field="expiry_date", value=val)],
                    )

        # 2. PUC inquiry
        if "puc" in q_lower or "pollution" in q_lower:
            puc_docs = [d for d in user_docs if "puc" in d.doc_type.lower()]
            if puc_docs:
                doc = puc_docs[0]
                exp = doc.expiry_date or "Valid"
                return SearchResponse(
                    answer=f"Your {doc.title} is valid until {exp}.",
                    sources=[SourceCitation(document_id=doc.id, title=doc.title, field="expiry_date", value=exp)],
                )

        # 3. Missing documents inquiry
        if "missing" in q_lower or "checklist" in q_lower:
            from app.checklist import get_missing_for_asset
            target_assets = user_assets
            # Check if specific asset was queried (e.g. "Flat 302", "Honda City", "Self")
            for a in user_assets:
                if a.name.lower() in q_lower or (a.name.lower() == "flat 302" and "flat" in q_lower) or (a.name.lower() == "honda city" and "honda" in q_lower):
                    target_assets = [a]
                    break

            missing_info = []
            citations = []
            for a in target_assets:
                present = {d.doc_type for d in a.documents}
                missing = get_missing_for_asset(a.type, present)
                if missing:
                    types = ", ".join(m["doc_type"] for m in missing)
                    missing_info.append(f"{a.name} is missing: {types}.")
                    citations.append(SourceCitation(
                        document_id=a.id,
                        title=f"{a.name} Checklist",
                        field="missing_documents",
                        value=types,
                    ))
                else:
                    missing_info.append(f"{a.name} has all required documents uploaded.")

            if missing_info:
                return SearchResponse(
                    answer=" ".join(missing_info),
                    sources=citations,
                )

        # 4. Identity / Aadhaar / PAN inquiry
        if "aadhaar" in q_lower or "pan" in q_lower or "identity" in q_lower:
            for doc in user_docs:
                if doc.doc_type.lower() in ("aadhaar", "pan") or doc.doc_type.lower() in q_lower:
                    fields = json.loads(doc.fields_json) if doc.fields_json else {}
                    num = fields.get("number") or "Present"
                    return SearchResponse(
                        answer=f"Found your {doc.doc_type} ({doc.title}) with number: {num}.",
                        sources=[SourceCitation(document_id=doc.id, title=doc.title, field="number", value=str(num))],
                    )

        # 5. Direct search in titles or extracted fields
        for doc in user_docs:
            if doc.title.lower() in q_lower or doc.doc_type.lower() in q_lower or (doc.raw_text and any(word in doc.raw_text.lower() for word in q_lower.split() if len(word) > 3)):
                fields = json.loads(doc.fields_json) if doc.fields_json else {}
                val = doc.expiry_date or fields.get("number") or "Present in vault"
                return SearchResponse(
                    answer=f"Based on your {doc.title} ({doc.doc_type}), details found: {val}.",
                    sources=[SourceCitation(document_id=doc.id, title=doc.title, field="details", value=str(val))],
                )

        return SearchResponse(
            answer="No specific information found in your vault matching this query. Please verify if the document has been uploaded.",
            sources=[],
        )

    # --- Live Gemini Q&A ---
    try:
        from google import genai
        from app.ai.schemas import strip_markdown_fences
        client = genai.Client(api_key=GEMINI_API_KEY)

        # Prepare document context
        docs_summary = []
        for d in user_docs:
            docs_summary.append({
                "id": d.id,
                "title": d.title,
                "asset_name": d.asset.name if d.asset else "Unknown",
                "doc_type": d.doc_type,
                "issue_date": d.issue_date,
                "expiry_date": d.expiry_date,
                "fields": json.loads(d.fields_json) if d.fields_json else {},
                "snippet": (d.raw_text or "")[:400],
            })

        system_instruction = (
            "You are Smart Vault Q&A assistant. Answer the user's question ONLY using the provided documents.\n"
            "If the information is not in the documents, explicitly say it was not found. Never invent facts.\n"
            "Respond in JSON format with two keys: 'answer' (string) and 'sources' (array of objects with document_id, title, field, value)."
        )

        prompt = f"Today is {today.isoformat()}.\n\nDOCUMENTS:\n{json.dumps(docs_summary)}\n\nUSER QUESTION: {query_str}"

        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=AI_MODEL,
                contents=[prompt],
                config={"response_mime_type": "application/json", "system_instruction": system_instruction},
            ),
            timeout=AI_TIMEOUT_SECONDS,
        )

        clean_text = strip_markdown_fences(response.text)
        res_data = json.loads(clean_text)
        sources = [
            SourceCitation(
                document_id=s.get("document_id", 0),
                title=s.get("title", "Document"),
                field=s.get("field", "field"),
                value=str(s.get("value", "")),
            )
            for s in res_data.get("sources", [])
        ]
        return SearchResponse(answer=res_data.get("answer", "No answer found."), sources=sources)

    except Exception:
        return SearchResponse(
            answer="Could not process search request with AI. Please check your query or try again later.",
            sources=[],
        )
