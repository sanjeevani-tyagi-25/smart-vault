import io
import os
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from pypdf import PdfWriter

os.environ["DATABASE_URL"] = "sqlite:///./test_vault_extraction.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-extract"
os.environ["AI_MOCK"] = "false"  # Ensure real extraction engine is tested!
os.environ["GEMINI_API_KEY"] = ""  # No cloud key -> tests genuine local OCR engine!

from app.main import app
from app.database import Base, engine
from app.models import User, Asset, Document

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    old_mock = os.environ.get("AI_MOCK")
    os.environ["AI_MOCK"] = "false"
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if old_mock is not None:
        os.environ["AI_MOCK"] = old_mock
    else:
        os.environ.pop("AI_MOCK", None)


def generate_pdf(lines: list) -> bytes:
    """Helper to generate a clean, synthetic PDF in memory with custom text lines."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    y = 750
    for line in lines:
        if line.startswith("TITLE:"):
            c.setFont("Helvetica-Bold", 16)
            c.drawString(50, y, line[6:].strip())
        else:
            c.setFont("Helvetica", 11)
            c.drawString(50, y, line.strip())
        y -= 25
    c.save()
    return buf.getvalue()


def register_user(name: str, email: str) -> dict:
    resp = client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "password123"},
    )
    assert resp.status_code == 201
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# 1. Test RC extraction with distinct fictional values
def test_synthetic_rc_extraction():
    headers = register_user("Vikram Aditya", "vikram@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION (RC)",
        "Transport Department - Government of Karnataka",
        "Reg No: KA-05-MB-9876",
        "Owner: Vikram Aditya",
        "Registration Date: 2023-05-12",
        "Vehicle Class: Motor Car (LMV)",
        "Model: Maruti Swift ZXi",
        "Fuel: Petrol",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("vikram_rc.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "RC"
    assert data["fields"]["number"] == "KA-05-MB-9876"
    assert "Vikram Aditya" in (data["fields"]["holder_name"] or "")
    assert data["fields"]["issue_date"] == "2023-05-12"
    # Never assume registration date is expiry date!
    assert data["fields"]["expiry_date"] is None
    assert data["confidence"]["doc_type"] > 0.8
    assert "Aarav Sharma" not in data["raw_text"]
    assert "DL-01-AB-1234" not in data["raw_text"]


# 2. Test PAN extraction with distinct fictional values
def test_synthetic_pan_extraction():
    headers = register_user("Kavita Nair", "kavita@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: Income Tax Department - Permanent Account Number",
        "PAN: ABCDE9876K",
        "Name: Kavita Nair",
        "Father's Name: Raman Nair",
        "Date of Birth: 14/08/1992",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("kavita_pan.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "PAN"
    assert data["fields"]["number"] == "ABCDE9876K"
    assert "Kavita Nair" in (data["fields"]["holder_name"] or "")
    assert data["fields"]["expiry_date"] is None  # PAN is permanent
    assert data["fields"]["issuer"] == "Income Tax Department"


# 3. Test Aadhaar extraction with sensitive number masking
def test_synthetic_aadhaar_extraction_and_masking():
    headers = register_user("Rohan Mehra", "rohan@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: Unique Identification Authority of India",
        "Aadhaar No: 9876 5432 1098",
        "Name: Rohan Mehra",
        "DOB: 1988-11-20",
        "Gender: Male",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("rohan_aadhaar.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "Aadhaar"
    # Masked number format XXXX-XXXX-####
    assert data["fields"]["number"] == "XXXX-XXXX-1098"
    assert "9876 5432 1098" not in (data["fields"]["number"] or "")
    assert "Rohan Mehra" in (data["fields"]["holder_name"] or "")
    assert data["fields"]["expiry_date"] is None  # Aadhaar has no expiry


# 4. Test Insurance extraction with start and expiry dates
def test_synthetic_insurance_extraction():
    headers = register_user("Sunita Rao", "sunita@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: Tata AIG General Insurance Co. Ltd.",
        "Private Car Policy Schedule",
        "Policy No: POL-77665544",
        "Insured Name: Sunita Rao",
        "Period of Insurance: From 2025-02-01 to Midnight of 2026-01-31",
        "Vehicle Reg No: MH-02-EF-3344",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("sunita_policy.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "Insurance"
    assert data["fields"]["number"] == "POL-77665544"
    assert "Sunita Rao" in (data["fields"]["holder_name"] or "")
    assert data["fields"]["issue_date"] == "2025-02-01"
    assert data["fields"]["expiry_date"] == "2026-01-31"


# 5. Test PUC certificate extraction
def test_synthetic_puc_extraction():
    headers = register_user("Sameer Khan", "sameer@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: Pollution Under Control Certificate",
        "Certificate No: MH1200998877",
        "Reg No: MH-12-PQ-4567",
        "Owner: Sameer Khan",
        "Date of Testing: 2025-06-10",
        "Valid Until: 2025-12-09",
        "Emission Norms: BS VI",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("sameer_puc.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "PUC"
    assert data["fields"]["number"] == "MH1200998877"
    assert data["fields"]["issue_date"] == "2025-06-10"
    assert data["fields"]["expiry_date"] == "2025-12-09"


# 6. Test Driving License extraction
def test_synthetic_driving_license_extraction():
    headers = register_user("Deepak Verma", "deepak@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: Licensing Authority - Driving Licence",
        "DL No: KA-0120150034567",
        "Name: Deepak Verma",
        "Date of Issue: 2015-03-20",
        "Valid Till: 2035-03-19",
        "Class of Vehicle: LMV, MCWG",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("deepak_dl.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "Driving License"
    assert "KA-0120150034567" in data["fields"]["number"]
    assert "Deepak Verma" in (data["fields"]["holder_name"] or "")
    assert data["fields"]["issue_date"] == "2015-03-20"
    assert data["fields"]["expiry_date"] == "2035-03-19"


# 7. Test Voter ID extraction
def test_synthetic_voter_id_extraction():
    headers = register_user("Meera Das", "meera@example.com")
    pdf_bytes = generate_pdf([
        "TITLE: Election Commission of India",
        "Elector Photo Identity Card (EPIC)",
        "EPIC No: WBD9876543",
        "Elector's Name: Meera Das",
        "Father's Name: Anil Das",
        "Assembly Constituency: Kolkata South",
    ])

    resp = client.post(
        "/documents/extract",
        files={"file": ("meera_epic.pdf", pdf_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["doc_type"] == "Voter ID"
    assert data["fields"]["number"] == "WBD9876543"
    assert "Meera Das" in (data["fields"]["holder_name"] or "")
    assert data["fields"]["issuer"] == "Election Commission of India"


# 8. Test Blank Document does NOT invent fake fields
def test_blank_document_no_fabricated_defaults():
    headers = register_user("Test User", "testuser@example.com")
    # Generate blank page with no text
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.drawString(100, 100, " ")  # whitespace only
    c.save()
    blank_bytes = buf.getvalue()

    resp = client.post(
        "/documents/extract",
        files={"file": ("blank_receipt.pdf", blank_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    # Must be Other with None fields and 0 confidence
    assert data["doc_type"] == "Other"
    assert data["fields"]["number"] is None
    assert data["fields"]["holder_name"] is None
    assert data["fields"]["issue_date"] is None
    assert data["fields"]["expiry_date"] is None
    assert data["confidence"]["doc_type"] == 0.0


# 9. Test Encrypted / Password-protected PDF returns clear error
def test_password_encrypted_pdf_handling():
    headers = register_user("Sec User", "secuser@example.com")
    # Create password-protected PDF
    raw_buf = io.BytesIO(generate_pdf(["TITLE: Secret Document", "Protected content"]))
    writer = PdfWriter()
    writer.append(raw_buf)
    writer.encrypt("user_secret_password")
    enc_buf = io.BytesIO()
    writer.write(enc_buf)
    enc_bytes = enc_buf.getvalue()

    resp = client.post(
        "/documents/extract",
        files={"file": ("encrypted.pdf", enc_bytes, "application/pdf")},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "password-protected" in resp.json()["detail"].lower()


# 10. Multi-tenant isolation: Uploading one doc doesn't display another user's values
def test_multi_user_and_asset_isolation():
    user1_headers = register_user("User One", "user1@example.com")
    user2_headers = register_user("User Two", "user2@example.com")

    # User 1 creates asset & saves document
    asset1 = client.post("/assets", json={"name": "User 1 Car", "type": "vehicle"}, headers=user1_headers).json()
    doc1 = client.post(
        "/documents",
        data={
            "asset_id": asset1["id"],
            "doc_type": "RC",
            "title": "User 1 RC",
            "fields_json": '{"number": "DL-01-U1-1111", "holder_name": "User One"}',
        },
        files={"file": ("doc1.pdf", generate_pdf(["User 1 Private Doc"]), "application/pdf")},
        headers=user1_headers,
    ).json()

    # User 2 creates asset & saves document
    asset2 = client.post("/assets", json={"name": "User 2 Car", "type": "vehicle"}, headers=user2_headers).json()
    doc2 = client.post(
        "/documents",
        data={
            "asset_id": asset2["id"],
            "doc_type": "RC",
            "title": "User 2 RC",
            "fields_json": '{"number": "DL-02-U2-2222", "holder_name": "User Two"}',
        },
        files={"file": ("doc2.pdf", generate_pdf(["User 2 Private Doc"]), "application/pdf")},
        headers=user2_headers,
    ).json()

    # User 2 cannot access User 1's document
    unauth_doc = client.get(f"/documents/{doc1['id']}", headers=user2_headers)
    assert unauth_doc.status_code == 404

    # User 1's list only contains User 1's doc
    u1_docs = client.get("/documents", headers=user1_headers).json()
    assert len(u1_docs) == 1
    assert u1_docs[0]["fields"]["number"] == "DL-01-U1-1111"


# 11. User field corrections survive saving and reloading
def test_corrected_fields_persist_after_save_and_reload():
    headers = register_user("Editor User", "editor@example.com")
    asset = client.post("/assets", json={"name": "My Property", "type": "property"}, headers=headers).json()

    # Save document
    created = client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": "Registry",
            "title": "Sale Deed Saket",
            "issue_date": "2023-01-01",
            "fields_json": '{"number": "ORIG-123", "holder_name": "Old Name"}',
        },
        files={"file": ("deed.pdf", generate_pdf(["TITLE: Sale Deed"]), "application/pdf")},
        headers=headers,
    ).json()
    doc_id = created["id"]

    # User updates title, issue_date, and fields_json
    patch_resp = client.patch(
        f"/documents/{doc_id}",
        json={
            "title": "Corrected Sale Deed Flat 302",
            "issue_date": "2023-04-15",
            "fields": {
                "number": "DEED-2023-9999",
                "holder_name": "Corrected Buyer Name",
                "property_address": "Flat 302, Palm Heights",
            },
        },
        headers=headers,
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert patched["title"] == "Corrected Sale Deed Flat 302"
    assert patched["issue_date"] == "2023-04-15"
    assert patched["fields"]["number"] == "DEED-2023-9999"
    assert patched["fields"]["holder_name"] == "Corrected Buyer Name"

    # Reload via GET
    reloaded = client.get(f"/documents/{doc_id}", headers=headers).json()
    assert reloaded["title"] == "Corrected Sale Deed Flat 302"
    assert reloaded["fields"]["number"] == "DEED-2023-9999"
    assert reloaded["fields"]["property_address"] == "Flat 302, Palm Heights"
