import io
import os
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

os.environ["DATABASE_URL"] = "sqlite:///./test_rc_puc_vault.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key-rc-puc"
os.environ["AI_MOCK"] = "false"  # Ensure real extraction engine is tested
os.environ["GEMINI_API_KEY"] = ""  # Genuine local engine tested

from app.main import app
from app.database import Base, engine, SessionLocal
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
    """Helper to generate a clean synthetic PDF in memory with custom text."""
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


# --------------------------------------------------------------------------
# Test Case 1: Upload an RC only. Confirm no PUC document or PUC expiry is fabricated.
# --------------------------------------------------------------------------
def test_case_1_upload_rc_only_no_puc_fabricated():
    headers = register_user("Ramesh Kumar", "ramesh@example.com")
    asset = client.post("/assets", json={"name": "Honda City", "type": "vehicle"}, headers=headers).json()

    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION (FORM 23)",
        "State Transport Department - Delhi RTO",
        "Regn. No: DL-03-CC-5678",
        "Date of Regn: 10-Aug-2022",
        "Regn. Validity: 09-Aug-2037",
        "Owner Name: Ramesh Kumar",
        "Vehicle Class: Motor Car (LMV)",
        "Chassis No: MA3GD81AS00987654",
        "Engine No: L15Z1982736",
        "Fuel Used: Petrol",
        "Emission Norms: BHARAT STAGE VI",
    ])

    # Extract
    extract_resp = client.post(
        "/documents/extract",
        files={"file": ("Vehicle_RC.pdf", rc_pdf, "application/pdf")},
        headers=headers,
    )
    assert extract_resp.status_code == 200
    extract_data = extract_resp.json()

    # Must be classified as RC, NEVER as PUC despite mentioning emission norms!
    assert extract_data["doc_type"] == "RC"
    assert extract_data["fields"]["number"] == "DL-03-CC-5678"
    assert "Ramesh Kumar" in (extract_data["fields"]["holder_name"] or "")
    assert extract_data["fields"]["issue_date"] == "2022-08-10"
    assert extract_data["fields"]["expiry_date"] == "2037-08-09"  # RC validity
    # Confirm extra fields do not claim to be a PUC certificate
    assert extract_data["fields"]["extra"].get("emission_norms") == "BHARAT STAGE VI"
    assert "puc" not in extract_data["title"].lower()

    # Save to vault
    create_resp = client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": extract_data["doc_type"],
            "title": extract_data["title"],
            "temp_file_token": extract_data["temp_file_token"],
            "issue_date": extract_data["fields"]["issue_date"],
            "expiry_date": extract_data["fields"]["expiry_date"],
            "fields_json": str(extract_data["fields"]).replace("'", '"'),
            "raw_text": extract_data["raw_text"],
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    doc = create_resp.json()
    assert doc["doc_type"] == "RC"

    # Confirm only 1 document in vault and no PUC document exists
    list_resp = client.get("/documents", headers=headers)
    assert list_resp.status_code == 200
    docs = list_resp.json()
    assert len(docs) == 1
    assert docs[0]["doc_type"] == "RC"
    assert docs[0]["title"] != "PUC"


# --------------------------------------------------------------------------
# Test Case 2: Ask for RC details. Confirm answer comes from the uploaded RC.
# --------------------------------------------------------------------------
def test_case_2_ask_rc_details():
    headers = register_user("Ramesh Kumar 2", "ramesh2@example.com")
    asset = client.post("/assets", json={"name": "Honda City", "type": "vehicle"}, headers=headers).json()

    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION (FORM 23)",
        "State Transport Department",
        "Regn. No: DL-03-CC-5678",
        "Owner Name: Ramesh Kumar",
        "Date of Regn: 10-Aug-2022",
        "Regn. Validity: 09-Aug-2037",
    ])
    ext = client.post("/documents/extract", files={"file": ("Vehicle_RC.pdf", rc_pdf, "application/pdf")}, headers=headers).json()
    import json
    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": ext["doc_type"],
            "title": ext["title"],
            "temp_file_token": ext["temp_file_token"],
            "issue_date": ext["fields"]["issue_date"],
            "expiry_date": ext["fields"]["expiry_date"],
            "fields_json": json.dumps(ext["fields"]),
            "raw_text": ext["raw_text"],
        },
        headers=headers,
    )

    # Ask for RC details
    search_resp = client.post(
        "/search",
        json={"query": "What are my vehicle RC details?"},
        headers=headers,
    )
    assert search_resp.status_code == 200
    res = search_resp.json()
    assert "DL-03-CC-5678" in res["answer"]
    assert "Ramesh Kumar" in res["answer"]
    assert "Source:" in res["answer"]
    assert len(res["sources"]) >= 1

    # Ask specifically for registration number
    reg_search = client.post(
        "/search",
        json={"query": "What is my vehicle registration number?"},
        headers=headers,
    ).json()
    assert "DL-03-CC-5678" in reg_search["answer"]


# --------------------------------------------------------------------------
# Test Case 3: Ask for PUC expiry when no PUC is uploaded.
# Confirm clear report that no PUC certificate was found.
# --------------------------------------------------------------------------
def test_case_3_ask_puc_expiry_when_no_puc_uploaded():
    headers = register_user("Suresh Sharma", "suresh@example.com")
    asset = client.post("/assets", json={"name": "Hyundai Creta", "type": "vehicle"}, headers=headers).json()

    # Upload only an RC
    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION",
        "Reg No: HR-26-DQ-1234",
        "Owner: Suresh Sharma",
        "Date of Regn: 2021-01-15",
        "Validity: 2036-01-14",
    ])
    ext = client.post("/documents/extract", files={"file": ("Vehicle_RC.pdf", rc_pdf, "application/pdf")}, headers=headers).json()
    import json
    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": ext["doc_type"],
            "title": ext["title"],
            "temp_file_token": ext["temp_file_token"],
            "issue_date": ext["fields"]["issue_date"],
            "expiry_date": ext["fields"]["expiry_date"],
            "fields_json": json.dumps(ext["fields"]),
            "raw_text": ext["raw_text"],
        },
        headers=headers,
    )

    # Ask for PUC expiry
    search_resp = client.post(
        "/search",
        json={"query": "When does my PUC certificate expire?"},
        headers=headers,
    )
    assert search_resp.status_code == 200
    res = search_resp.json()
    # Must report the EXACT clear phrasing required
    assert "I couldn't find an uploaded PUC certificate in your vault, so I can't determine its expiry date." in res["answer"]
    assert res["sources"] == []


# --------------------------------------------------------------------------
# Test Case 4: Upload both RC and PUC. Confirm each retains its own type and fields.
# --------------------------------------------------------------------------
def test_case_4_upload_both_rc_and_puc_retains_types():
    headers = register_user("Meena Gupta", "meena@example.com")
    asset = client.post("/assets", json={"name": "Honda Civic", "type": "vehicle"}, headers=headers).json()

    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION (FORM 23)",
        "State Transport Department",
        "Regn. No: UP-14-AZ-9999",
        "Owner Name: Meena Gupta",
        "Date of Regn: 2020-04-01",
        "Regn. Validity: 2035-03-31",
        "Emission Norms: BHARAT STAGE VI",
    ])
    puc_pdf = generate_pdf([
        "TITLE: POLLUTION UNDER CONTROL CERTIFICATE",
        "Certificate No: DL01004820259999",
        "Vehicle Reg No: UP-14-AZ-9999",
        "Date of Testing: 2026-01-10",
        "Valid Until: 2026-07-09",
        "Result: PASS",
    ])

    import json
    # Extract RC
    ext_rc = client.post("/documents/extract", files={"file": ("civic_rc.pdf", rc_pdf, "application/pdf")}, headers=headers).json()
    assert ext_rc["doc_type"] == "RC"
    assert ext_rc["fields"]["number"] == "UP-14-AZ-9999"
    assert ext_rc["fields"]["expiry_date"] == "2035-03-31"

    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": ext_rc["doc_type"],
            "title": ext_rc["title"],
            "temp_file_token": ext_rc["temp_file_token"],
            "issue_date": ext_rc["fields"]["issue_date"],
            "expiry_date": ext_rc["fields"]["expiry_date"],
            "fields_json": json.dumps(ext_rc["fields"]),
            "raw_text": ext_rc["raw_text"],
        },
        headers=headers,
    )

    # Extract PUC
    ext_puc = client.post("/documents/extract", files={"file": ("civic_puc.pdf", puc_pdf, "application/pdf")}, headers=headers).json()
    assert ext_puc["doc_type"] == "PUC"
    assert ext_puc["fields"]["number"] == "DL01004820259999"
    assert ext_puc["fields"]["issue_date"] == "2026-01-10"
    assert ext_puc["fields"]["expiry_date"] == "2026-07-09"

    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": ext_puc["doc_type"],
            "title": ext_puc["title"],
            "temp_file_token": ext_puc["temp_file_token"],
            "issue_date": ext_puc["fields"]["issue_date"],
            "expiry_date": ext_puc["fields"]["expiry_date"],
            "fields_json": json.dumps(ext_puc["fields"]),
            "raw_text": ext_puc["raw_text"],
        },
        headers=headers,
    )

    # Check vault list
    docs = client.get("/documents", headers=headers).json()
    assert len(docs) == 2
    types = {d["doc_type"] for d in docs}
    assert types == {"RC", "PUC"}


# --------------------------------------------------------------------------
# Test Case 5: Ask for PUC expiry. Confirm assistant uses uploaded PUC, not RC.
# --------------------------------------------------------------------------
def test_case_5_ask_puc_expiry_uses_puc_not_rc():
    headers = register_user("Deepak Joshi", "deepak@example.com")
    asset = client.post("/assets", json={"name": "Maruti Baleno", "type": "vehicle"}, headers=headers).json()

    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION (FORM 23)",
        "Regn. No: MH-12-PQ-4444",
        "Owner Name: Deepak Joshi",
        "Date of Regn: 2021-03-01",
        "Regn. Validity: 2036-02-28",  # 2036 expiry for RC
    ])
    puc_pdf = generate_pdf([
        "TITLE: POLLUTION UNDER CONTROL CERTIFICATE",
        "Certificate No: MH1200998877",
        "Vehicle Reg No: MH-12-PQ-4444",
        "Date of Testing: 2026-02-01",
        "Valid Until: 2026-08-01",  # 2026 expiry for PUC
        "Result: PASS",
    ])

    import json
    ext_rc = client.post("/documents/extract", files={"file": ("baleno_rc.pdf", rc_pdf, "application/pdf")}, headers=headers).json()
    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": "RC",
            "title": ext_rc["title"],
            "temp_file_token": ext_rc["temp_file_token"],
            "issue_date": ext_rc["fields"]["issue_date"],
            "expiry_date": ext_rc["fields"]["expiry_date"],
            "fields_json": json.dumps(ext_rc["fields"]),
        },
        headers=headers,
    )

    ext_puc = client.post("/documents/extract", files={"file": ("baleno_puc.pdf", puc_pdf, "application/pdf")}, headers=headers).json()
    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": "PUC",
            "title": ext_puc["title"],
            "temp_file_token": ext_puc["temp_file_token"],
            "issue_date": ext_puc["fields"]["issue_date"],
            "expiry_date": ext_puc["fields"]["expiry_date"],
            "fields_json": json.dumps(ext_puc["fields"]),
        },
        headers=headers,
    )

    # Ask for PUC expiry
    search_resp = client.post(
        "/search",
        json={"query": "What is my PUC expiry date?"},
        headers=headers,
    ).json()

    # Must contain the PUC expiry date (2026-08-01), NOT the RC validity date (2036-02-28)
    assert "2026-08-01" in search_resp["answer"]
    assert "2036" not in search_resp["answer"]
    assert any("puc" in s["title"].lower() or s["field"] == "expiry_date" for s in search_resp["sources"])


# --------------------------------------------------------------------------
# Test Case 6: Upload a document with unreadable expiry date. Confirm no guessing.
# --------------------------------------------------------------------------
def test_case_6_unreadable_expiry_date_no_guess():
    headers = register_user("Ananya Sen", "ananya@example.com")
    asset = client.post("/assets", json={"name": "Bike", "type": "vehicle"}, headers=headers).json()

    # RC with torn / unreadable validity date
    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION",
        "Regn. No: WB-01-XY-1111",
        "Owner Name: Ananya Sen",
        "Validity: [UNREADABLE BLURRED STAMP]",
    ])

    ext = client.post("/documents/extract", files={"file": ("unreadable_rc.pdf", rc_pdf, "application/pdf")}, headers=headers).json()
    # Must be None, never fabricated!
    assert ext["fields"]["expiry_date"] is None

    import json
    client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": ext["doc_type"],
            "title": ext["title"],
            "temp_file_token": ext["temp_file_token"],
            "fields_json": json.dumps(ext["fields"]),
        },
        headers=headers,
    )

    # Query validity
    search_resp = client.post(
        "/search",
        json={"query": "When does my vehicle registration validity expire?"},
        headers=headers,
    ).json()
    # Must report that validity date is not available / requires review, NOT invent a date
    assert "Not available" in search_resp["answer"] or "not extracted" in search_resp["answer"] or "review" in search_resp["answer"]


# --------------------------------------------------------------------------
# Test Case 7: Verify that one user's documents cannot be retrieved by another user.
# --------------------------------------------------------------------------
def test_case_7_user_document_isolation():
    headers_a = register_user("User Alpha", "alpha@example.com")
    headers_b = register_user("User Beta", "beta@example.com")

    asset_a = client.post("/assets", json={"name": "Alpha Car", "type": "vehicle"}, headers=headers_a).json()

    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION",
        "Regn. No: KL-07-ZZ-7777",
        "Owner Name: User Alpha",
        "Date of Regn: 2022-05-15",
    ])
    ext = client.post("/documents/extract", files={"file": ("alpha_rc.pdf", rc_pdf, "application/pdf")}, headers=headers_a).json()
    import json
    doc_a = client.post(
        "/documents",
        data={
            "asset_id": asset_a["id"],
            "doc_type": "RC",
            "title": ext["title"],
            "temp_file_token": ext["temp_file_token"],
            "fields_json": json.dumps(ext["fields"]),
        },
        headers=headers_a,
    ).json()

    # User B lists documents -> must be empty
    docs_b = client.get("/documents", headers=headers_b).json()
    assert len(docs_b) == 0

    # User B queries assistant for RC details -> must not find User A's document
    search_b = client.post(
        "/search",
        json={"query": "What is my vehicle registration number?"},
        headers=headers_b,
    ).json()
    assert "KL-07-ZZ-7777" not in search_b["answer"]
    assert "User Alpha" not in search_b["answer"]
    assert "couldn't find" in search_b["answer"].lower() or "no documents" in search_b["answer"].lower()

    # User B attempts direct document access -> 404
    direct_get = client.get(f"/documents/{doc_a['id']}", headers=headers_b)
    assert direct_get.status_code == 404


# --------------------------------------------------------------------------
# Test Case 8: Verify saved data remains correct after retrieving from database.
# --------------------------------------------------------------------------
def test_case_8_saved_data_persists_correctly():
    headers = register_user("Vikramaditya", "vikramaditya@example.com")
    asset = client.post("/assets", json={"name": "Tata Safari", "type": "vehicle"}, headers=headers).json()

    rc_pdf = generate_pdf([
        "TITLE: CERTIFICATE OF REGISTRATION (FORM 23)",
        "State Transport Department",
        "Regn. No: MP-09-XY-3333",
        "Owner Name: Vikramaditya",
        "Date of Regn: 2023-11-20",
        "Regn. Validity: 2038-11-19",
    ])
    ext = client.post("/documents/extract", files={"file": ("safari_rc.pdf", rc_pdf, "application/pdf")}, headers=headers).json()
    import json
    saved = client.post(
        "/documents",
        data={
            "asset_id": asset["id"],
            "doc_type": ext["doc_type"],
            "title": ext["title"],
            "temp_file_token": ext["temp_file_token"],
            "issue_date": ext["fields"]["issue_date"],
            "expiry_date": ext["fields"]["expiry_date"],
            "fields_json": json.dumps(ext["fields"]),
            "raw_text": ext["raw_text"],
        },
        headers=headers,
    ).json()

    # Retrieve from DB via GET /documents/{id}
    fetch_resp = client.get(f"/documents/{saved['id']}", headers=headers)
    assert fetch_resp.status_code == 200
    doc_data = fetch_resp.json()
    assert doc_data["doc_type"] == "RC"
    assert doc_data["issue_date"] == "2023-11-20"
    assert doc_data["expiry_date"] == "2038-11-19"
    fields = doc_data["fields"]
    assert fields["number"] == "MP-09-XY-3333"
    assert "Vikramaditya" in fields["holder_name"]
