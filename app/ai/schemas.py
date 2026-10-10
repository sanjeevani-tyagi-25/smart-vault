import json
import re
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict


VALID_DOC_TYPES = {
    "RC",
    "Insurance",
    "PUC",
    "Driving License",
    "Registry",
    "Property Tax Receipt",
    "Electricity Bill",
    "Rent Agreement",
    "Aadhaar",
    "PAN",
    "Passport",
    "Voter ID",
    "Health Insurance",
    "Other",
}

DOC_TYPE_ALIASES = {
    "sale deed": "Registry",
    "conveyance deed": "Registry",
    "registry / sale deed": "Registry",
    "deed of sale": "Registry",
    "dl": "Driving License",
    "driving licence": "Driving License",
    "epic": "Voter ID",
    "voter card": "Voter ID",
    "elector card": "Voter ID",
    "mediclaim": "Health Insurance",
    "health policy": "Health Insurance",
    "pollution certificate": "PUC",
    "pollution under control": "PUC",
    "vehicle rc": "RC",
    "registration certificate": "RC",
    "motor policy": "Insurance",
    "vehicle insurance": "Insurance",
    "lease agreement": "Rent Agreement",
    "tenancy agreement": "Rent Agreement",
    "tax receipt": "Property Tax Receipt",
}


def strip_markdown_fences(text: str) -> str:
    """Strip ```json ... ``` or ``` ... ``` fences from AI response string."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    return cleaned.strip()


def sanitize_date(val: Any) -> Optional[str]:
    """Validate ISO YYYY-MM-DD date. If invalid, return None (never guess or error)."""
    if not val or not isinstance(val, str):
        return None
    val = val.strip()
    if val.lower() in ("null", "none", "", "n/a", "unknown"):
        return None
    try:
        dt = datetime.strptime(val, "%Y-%m-%d")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        # Try DD/MM/YYYY
        try:
            dt = datetime.strptime(val, "%d/%m/%Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            return None


def clamp_confidence(val: Any) -> float:
    """Ensure confidence score is a float strictly clamped between 0.0 and 1.0."""
    try:
        score = float(val)
        return max(0.0, min(1.0, round(score, 2)))
    except (TypeError, ValueError):
        return 0.0


def mask_sensitive_id(val: Any) -> Any:
    """Mask 12-digit Aadhaar numbers for data protection compliance."""
    if not val or not isinstance(val, str):
        return val
    # If 12 consecutive or hyphenated digits like 1234 5678 9012
    m = re.search(r"\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b", val)
    if m:
        return f"XXXX-XXXX-{m.group(3)}"
    return val


class ExtractedFields(BaseModel):
    model_config = ConfigDict(extra="allow")

    number: Optional[str] = None
    holder_name: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    issuer: Optional[str] = None
    extra: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("issue_date", "expiry_date", mode="before")
    @classmethod
    def validate_dates(cls, v):
        return sanitize_date(v)

    @field_validator("number", mode="before")
    @classmethod
    def protect_sensitive_ids(cls, v):
        return mask_sensitive_id(v)


class ExtractionConfidence(BaseModel):
    model_config = ConfigDict(extra="allow")

    doc_type: float = 0.0
    number: float = 0.0
    holder_name: float = 0.0
    issue_date: float = 0.0
    expiry_date: float = 0.0

    @field_validator("doc_type", "number", "holder_name", "issue_date", "expiry_date", mode="before")
    @classmethod
    def clamp_scores(cls, v):
        return clamp_confidence(v)


class ExtractionResult(BaseModel):
    doc_type: str = "Other"
    title: str = "Document"
    fields: ExtractedFields = Field(default_factory=ExtractedFields)
    confidence: ExtractionConfidence = Field(default_factory=ExtractionConfidence)
    raw_text: str = ""
    language: str = "en"
    provider: str = "local_ocr"
    temp_file_token: Optional[str] = None

    @field_validator("doc_type", mode="before")
    @classmethod
    def validate_doc_type(cls, v):
        if not v or not isinstance(v, str):
            return "Other"
        v_clean = v.strip()
        # Direct match
        if v_clean in VALID_DOC_TYPES:
            return v_clean
        # Alias match
        alias = DOC_TYPE_ALIASES.get(v_clean.lower())
        if alias:
            return alias
        # Case insensitive match
        for known in VALID_DOC_TYPES:
            if known.lower() == v_clean.lower():
                return known
        return "Other"

    @field_validator("language", mode="before")
    @classmethod
    def validate_language(cls, v):
        if v in ("en", "hi", "mixed"):
            return v
        return "en"


def parse_and_validate_ai_json(raw_text: str) -> ExtractionResult:
    """
    Safely strips fences, parses JSON, and validates into ExtractionResult model.
    Coerces invalid dates to null and clamps confidence scores.
    """
    cleaned = strip_markdown_fences(raw_text)
    data = json.loads(cleaned)
    return ExtractionResult.model_validate(data)
