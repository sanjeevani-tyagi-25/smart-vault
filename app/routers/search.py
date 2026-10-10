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
        await asyncio.sleep(0.4)  # realistic micro-delay

        # 1. PUC Inquiry
        if any(k in q_lower for k in ["puc", "pollution", "emission test", "pucc"]):
            puc_docs = [d for d in user_docs if d.doc_type.upper() == "PUC" or "pollution" in d.doc_type.lower()]
            if not puc_docs:
                return SearchResponse(
                    answer="I couldn't find an uploaded PUC certificate in your vault, so I can't determine its expiry date.",
                    sources=[],
                )

            if len(puc_docs) == 1:
                doc = puc_docs[0]
                fields = json.loads(doc.fields_json) if doc.fields_json else {}
                exp = doc.expiry_date or fields.get("expiry_date")
                source_file = doc.original_filename or doc.title
                cert_no = fields.get("number")
                citations = []

                if exp:
                    try:
                        exp_dt = datetime.strptime(exp, "%Y-%m-%d").date()
                        days = (exp_dt - today).days
                        val = f"{exp} (in {days} days)" if days > 0 else f"{exp} (expired {abs(days)} days ago)" if days < 0 else f"{exp} (expires today)"
                    except ValueError:
                        val = exp

                    citations.append(SourceCitation(document_id=doc.id, title=source_file, field="expiry_date", value=str(exp)))
                    ans = f"Source: {source_file}\nYour PUC certificate is valid until {val}."
                    if cert_no:
                        citations.append(SourceCitation(document_id=doc.id, title=source_file, field="number", value=str(cert_no)))
                        ans += f"\nCertificate Number: {cert_no}"
                    return SearchResponse(answer=ans, sources=citations)
                else:
                    citations.append(SourceCitation(document_id=doc.id, title=source_file, field="expiry_date", value="Unavailable"))
                    return SearchResponse(
                        answer=f"Source: {source_file}\nPUC expiry: Not available — no valid expiry date was extracted from your uploaded PUC certificate. You may review or reprocess this document.",
                        sources=citations,
                    )
            else:
                lines = ["Multiple PUC certificates found in your vault:"]
                citations = []
                for doc in puc_docs:
                    fields = json.loads(doc.fields_json) if doc.fields_json else {}
                    exp = doc.expiry_date or fields.get("expiry_date") or "Date not extracted"
                    source_file = doc.original_filename or doc.title
                    lines.append(f"- {source_file} (Asset: {doc.asset.name if doc.asset else 'Unknown'}): Valid until {exp}")
                    citations.append(SourceCitation(document_id=doc.id, title=source_file, field="expiry_date", value=str(exp)))
                return SearchResponse(answer="\n".join(lines), sources=citations)

        # 2. RC (Registration Certificate) Inquiry
        is_rc_query = any(k in q_lower for k in [
            "rc", "registration certificate", "vehicle registration", "registration number",
            "reg no", "regn no", "chassis", "engine number", "vehicle details", "car details"
        ]) or (
            any(k in q_lower for k in ["vehicle", "car", "bike"]) and
            any(k in q_lower for k in ["number", "owner", "registration", "valid", "detail", "registered"])
        )

        if is_rc_query:
            rc_docs = [d for d in user_docs if d.doc_type.upper() == "RC" or "registration" in d.doc_type.lower()]
            if not rc_docs:
                return SearchResponse(
                    answer="I couldn't find an uploaded vehicle Registration Certificate (RC) in your vault.",
                    sources=[],
                )

            # Match specific asset if queried
            matched_docs = rc_docs
            for a in user_assets:
                if a.name.lower() in q_lower:
                    asset_rcs = [d for d in rc_docs if d.asset_id == a.id]
                    if asset_rcs:
                        matched_docs = asset_rcs
                    break

            doc = matched_docs[0]
            fields = json.loads(doc.fields_json) if doc.fields_json else {}
            source_file = doc.original_filename or doc.title
            reg_no = fields.get("number")
            owner = fields.get("holder_name")
            issue_d = doc.issue_date or fields.get("issue_date")
            validity = doc.expiry_date or fields.get("expiry_date")
            extra = fields.get("extra") or {}
            model = extra.get("vehicle_model") or extra.get("vehicle_class")
            chassis = extra.get("chassis_no")
            engine = extra.get("engine_no")

            # Specific sub-queries:
            if any(k in q_lower for k in ["registration number", "reg no", "regn no", "vehicle number", "number of my"]):
                if reg_no:
                    return SearchResponse(
                        answer=f"Source: {source_file}\nRegistration number: {reg_no}",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="number", value=str(reg_no))],
                    )
                else:
                    return SearchResponse(
                        answer=f"Source: {source_file}\nRegistration number: Not available — the registration number was not extracted from your uploaded RC. Please review or reprocess the document.",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="number", value="Unavailable")],
                    )

            if any(k in q_lower for k in ["owner", "owner's name", "registered owner", "who owns"]):
                if owner:
                    return SearchResponse(
                        answer=f"Source: {source_file}\nRegistered owner: {owner}",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="holder_name", value=str(owner))],
                    )
                else:
                    return SearchResponse(
                        answer=f"Source: {source_file}\nRegistered owner: Not available — the owner name was not extracted from your uploaded RC. Please review or reprocess the document.",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="holder_name", value="Unavailable")],
                    )

            if any(k in q_lower for k in ["validity", "rc expiry", "registration date", "when was it registered", "fitness"]):
                lines = [f"Source: {source_file}"]
                citations = []
                if issue_d:
                    lines.append(f"Registration Date: {issue_d}")
                    citations.append(SourceCitation(document_id=doc.id, title=source_file, field="issue_date", value=str(issue_d)))
                if validity:
                    lines.append(f"Registration Validity: {validity} (Note: This is vehicle registration validity, not PUC certificate expiry).")
                    citations.append(SourceCitation(document_id=doc.id, title=source_file, field="validity", value=str(validity)))
                if not issue_d and not validity:
                    lines.append("Registration validity / dates: Not available — dates were not extracted from your RC. Please review or reprocess the document.")
                return SearchResponse(answer="\n".join(lines), sources=citations)

            # Full RC details
            lines = [f"Source: {source_file}"]
            citations = []
            if reg_no:
                lines.append(f"Registration number: {reg_no}")
                citations.append(SourceCitation(document_id=doc.id, title=source_file, field="number", value=str(reg_no)))
            else:
                lines.append("Registration number: Not available (requires review)")

            if owner:
                lines.append(f"Registered owner: {owner}")
                citations.append(SourceCitation(document_id=doc.id, title=source_file, field="holder_name", value=str(owner)))
            else:
                lines.append("Registered owner: Not available (requires review)")

            if issue_d:
                lines.append(f"Registration date: {issue_d}")
                citations.append(SourceCitation(document_id=doc.id, title=source_file, field="issue_date", value=str(issue_d)))

            if validity:
                lines.append(f"Registration validity: {validity} (Note: Vehicle registration validity, not PUC expiry).")
                citations.append(SourceCitation(document_id=doc.id, title=source_file, field="validity", value=str(validity)))

            if model:
                lines.append(f"Vehicle Class/Model: {model}")
            if chassis:
                lines.append(f"Chassis number: {chassis}")
            if engine:
                lines.append(f"Engine number: {engine}")

            return SearchResponse(answer="\n".join(lines), sources=citations)

        # 3. Car / Vehicle Insurance Inquiry
        if "insurance" in q_lower:
            ins_docs = [d for d in user_docs if "insurance" in d.doc_type.lower()]
            if ins_docs:
                doc = ins_docs[0]
                exp = doc.expiry_date
                source_file = doc.original_filename or doc.title
                if exp:
                    try:
                        exp_dt = datetime.strptime(exp, "%Y-%m-%d").date()
                        days = (exp_dt - today).days
                        val = f"{exp} (in {days} days)" if days > 0 else f"{exp} (expired {abs(days)} days ago)" if days < 0 else f"{exp} (expires today)"
                    except ValueError:
                        val = exp
                    return SearchResponse(
                        answer=f"Source: {source_file}\nYour {doc.title} expires on {val}.",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="expiry_date", value=val)],
                    )
                else:
                    return SearchResponse(
                        answer=f"Source: {source_file}\nFound your insurance policy ({source_file}), but expiry date was not extracted. Please review the document.",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="expiry_date", value="Unavailable")],
                    )
            else:
                return SearchResponse(
                    answer="I couldn't find an uploaded insurance policy in your vault.",
                    sources=[],
                )

        # 4. Missing documents inquiry
        if "missing" in q_lower or "checklist" in q_lower:
            from app.checklist import get_missing_for_asset
            target_assets = user_assets
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

        # 5. Identity / Aadhaar / PAN inquiry
        if "aadhaar" in q_lower or "pan" in q_lower or "identity" in q_lower:
            for doc in user_docs:
                if doc.doc_type.lower() in ("aadhaar", "pan") or doc.doc_type.lower() in q_lower:
                    fields = json.loads(doc.fields_json) if doc.fields_json else {}
                    num = fields.get("number") or "Present"
                    source_file = doc.original_filename or doc.title
                    return SearchResponse(
                        answer=f"Source: {source_file}\nFound your {doc.doc_type} ({source_file}) with number: {num}.",
                        sources=[SourceCitation(document_id=doc.id, title=source_file, field="number", value=str(num))],
                    )

        # 6. Direct search in titles or extracted fields
        for doc in user_docs:
            if doc.title.lower() in q_lower or doc.doc_type.lower() in q_lower or (doc.raw_text and any(word in doc.raw_text.lower() for word in q_lower.split() if len(word) > 4)):
                fields = json.loads(doc.fields_json) if doc.fields_json else {}
                val = doc.expiry_date or fields.get("number") or "Present in vault"
                source_file = doc.original_filename or doc.title
                return SearchResponse(
                    answer=f"Source: {source_file}\nBased on your {doc.title} ({doc.doc_type}), details found: {val}.",
                    sources=[SourceCitation(document_id=doc.id, title=source_file, field="details", value=str(val))],
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
            "STRICT RULES:\n"
            "1. An RC (Registration Certificate) is NOT a PUC (Pollution Under Control) certificate. An RC does NOT contain PUC certificate details.\n"
            "2. If the user asks about PUC expiry date or PUC certificate and no document with doc_type 'PUC' is provided, you MUST reply: "
            "'I couldn't find an uploaded PUC certificate in your vault, so I can't determine its expiry date.'\n"
            "3. Never confuse vehicle registration validity with PUC certificate expiry.\n"
            "4. When answering about an RC, use the registration number, owner, and registration validity extracted from the RC.\n"
            "5. If a requested field is missing or not in the documents, explicitly state it was not found or is unavailable. Never invent facts.\n"
            "6. Always format answers with source document references (e.g., 'Source: <document title or filename>').\n"
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
