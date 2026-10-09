import os
import io
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_vault_phase2.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key"
os.environ["AI_MOCK"] = "true"

from app.main import app
from app.database import Base, engine
from app.ai.schemas import (
    strip_markdown_fences,
    sanitize_date,
    clamp_confidence,
    parse_and_validate_ai_json,
    ExtractionResult,
)
from app.ai.mock_data import get_mock_extraction

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_markdown_fence_stripping_and_json_parsing():
    """Verify markdown fences (```json ... ```) are cleanly stripped and parsed."""
    raw_ai_text = """```json
    {
      "doc_type": "Insurance",
      "title": "HDFC Policy",
      "fields": {
        "number": "POL-999",
        "holder_name": "Aarav Sharma",
        "issue_date": "2025-01-15",
        "expiry_date": "2026-01-14",
        "issuer": "HDFC ERGO",
        "extra": {}
      },
      "confidence": {
        "doc_type": 0.98,
        "number": 0.95,
        "holder_name": 0.91,
        "issue_date": 0.89,
        "expiry_date": 0.96
      },
      "raw_text": "HDFC ERGO Policy POL-999",
      "language": "en"
    }
    ```"""
    cleaned = strip_markdown_fences(raw_ai_text)
    assert not cleaned.startswith("```")
    assert not cleaned.endswith("```")

    parsed = parse_and_validate_ai_json(raw_ai_text)
    assert isinstance(parsed, ExtractionResult)
    assert parsed.doc_type == "Insurance"
    assert parsed.fields.number == "POL-999"
    assert parsed.fields.expiry_date == "2026-01-14"
    assert parsed.confidence.doc_type == 0.98


def test_invalid_date_coercion_and_confidence_clamping():
    """Verify invalid dates are coerced to None and confidence scores clamped."""
    # Invalid dates coerced to None
    assert sanitize_date("invalid-date") is None
    assert sanitize_date("2025/13/45") is None
    assert sanitize_date("null") is None
    assert sanitize_date("2025-06-15") == "2025-06-15"

    # Confidence clamped between 0.0 and 1.0
    assert clamp_confidence(1.5) == 1.0
    assert clamp_confidence(-0.4) == 0.0
    assert clamp_confidence("0.85") == 0.85
    assert clamp_confidence("invalid") == 0.0


def test_mock_filename_routing_and_dynamic_expiry():
    """Verify mock keywords route to expected document types and fresh dates."""
    today = datetime.now(timezone.utc).date()

    # Insurance: today + 12 days
    insurance_data = get_mock_extraction("insurance_honda.jpg")
    assert insurance_data["doc_type"] == "Insurance"
    expected_ins_exp = (today + timedelta(days=12)).isoformat()
    assert insurance_data["fields"]["expiry_date"] == expected_ins_exp

    # PUC: today + 25 days
    puc_data = get_mock_extraction("puc_delhi.png")
    assert puc_data["doc_type"] == "PUC"
    expected_puc_exp = (today + timedelta(days=25)).isoformat()
    assert puc_data["fields"]["expiry_date"] == expected_puc_exp

    # RC
    rc_data = get_mock_extraction("car_rc.pdf")
    assert rc_data["doc_type"] == "RC"
    assert rc_data["fields"]["number"] == "DL-01-AB-1234"

    # Hindi insurance
    hindi_data = get_mock_extraction("hindi_policy.jpg")
    assert hindi_data["language"] == "hi"
    assert "बीमा" in hindi_data["title"]

    # Other fallback
    other_data = get_mock_extraction("random_receipt.jpg")
    assert other_data["doc_type"] == "Other"
    assert other_data["confidence"]["doc_type"] <= 0.5


def test_extract_endpoint_mock_flow():
    """Verify POST /documents/extract endpoint returns complete schema and caches temp token."""
    # Register & get auth token
    reg = client.post(
        "/auth/register",
        json={"name": "Aarav Sharma", "email": "aarav.p2@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload mock insurance document
    file_bytes = b"Fake image content representing Honda City Insurance policy"
    resp = client.post(
        "/documents/extract",
        files={"file": ("insurance_honda.jpg", file_bytes, "image/jpeg")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "Insurance"
    assert "fields" in data
    assert "confidence" in data
    assert "raw_text" in data
    assert "language" in data
    assert "temp_file_token" in data

    today = datetime.now(timezone.utc).date()
    expected_expiry = (today + timedelta(days=12)).isoformat()
    assert data["fields"]["expiry_date"] == expected_expiry


def test_extract_file_validation():
    """Verify endpoint rejects unsupported extensions and handles missing auth."""
    # 1. Missing auth -> 401
    unauth = client.post(
        "/documents/extract",
        files={"file": ("doc.jpg", b"content", "image/jpeg")},
    )
    assert unauth.status_code == 401

    # 2. Unsupported extension -> 400
    reg = client.post(
        "/auth/register",
        json={"name": "Aarav Sharma", "email": "aarav.p2.val@example.com", "password": "password123"},
    ).json()
    headers = {"Authorization": f"Bearer {reg['access_token']}"}

    bad_ext = client.post(
        "/documents/extract",
        files={"file": ("notes.txt", b"plain text file", "text/plain")},
        headers=headers,
    )
    assert bad_ext.status_code == 400
    assert "Unsupported file format" in bad_ext.json()["detail"]
