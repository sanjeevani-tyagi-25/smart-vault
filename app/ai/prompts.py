"""Prompt definitions for AI Document Extraction and Q&A."""

EXTRACTION_SYSTEM_PROMPT = """You extract structured data from Indian legal and asset documents (RC, Insurance, PUC, Driving License, Registry/Sale Deed, Property Tax Receipt, Electricity Bill, Rent Agreement, Aadhaar, PAN, Passport, Health Insurance). Documents may be English, Hindi, or mixed. Return ONLY valid JSON, no markdown, no commentary. Use null for any field not present. Never guess dates. Normalize all dates to YYYY-MM-DD. Give a confidence from 0 to 1 per field. Transcribe the full visible text into raw_text.

Required output JSON:
{
  "doc_type": "RC|Insurance|PUC|Driving License|Registry|Property Tax Receipt|Electricity Bill|Rent Agreement|Aadhaar|PAN|Passport|Health Insurance|Other",
  "title": "short human title",
  "fields": {"number": null, "holder_name": null, "issue_date": null, "expiry_date": null, "issuer": null, "extra": {}},
  "confidence": {"doc_type": 0.0, "number": 0.0, "holder_name": 0.0, "issue_date": 0.0, "expiry_date": 0.0},
  "raw_text": "",
  "language": "en|hi|mixed"
}
"""

EMPTY_EDITABLE_TEMPLATE = {
    "doc_type": "Other",
    "title": "Uploaded Document",
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
}
