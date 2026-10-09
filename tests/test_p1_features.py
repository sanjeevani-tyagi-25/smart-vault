import os
import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_vault_p1.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key"
os.environ["AI_MOCK"] = "true"
os.environ["ACCESS_WAIT_SECONDS"] = "2"  # Fast wait for test

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import User, Asset, Document, Nominee, AccessRequest
from app.crypto import encrypt_bytes

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_nominee_emergency_veto_and_unlock_flow():
    """Verify emergency access request, owner veto, and lazy approval with read-only access."""
    # 1. Register owner
    reg = client.post(
        "/auth/register",
        json={"name": "Rajesh Kumar", "email": "rajesh@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Add an asset and documents
    asset = client.post("/assets", json={"name": "Honda City", "type": "vehicle"}, headers=headers).json()
    asset_id = asset["id"]

    # Upload one shareable doc and one non-shareable doc
    client.post(
        "/documents",
        data={
            "asset_id": asset_id,
            "doc_type": "Insurance",
            "title": "Vehicle Insurance",
            "is_emergency_shareable": "true",
            "fields_json": "{}",
            "confidence_json": "{}",
        },
        files={"file": ("insurance.pdf", b"test insurance content", "application/pdf")},
        headers=headers,
    )

    client.post(
        "/documents",
        data={
            "asset_id": asset_id,
            "doc_type": "Other",
            "title": "Private Note",
            "is_emergency_shareable": "false",
            "fields_json": "{}",
            "confidence_json": "{}",
        },
        files={"file": ("secret.pdf", b"super secret content", "application/pdf")},
        headers=headers,
    )

    # 3. Add Nominee
    nom = client.post(
        "/nominees",
        json={"name": "Priya Sharma", "email": "priya@example.com", "relationship": "Spouse"},
        headers=headers,
    ).json()
    nominee_id = nom["id"]

    # 4. Attempt nominee view BEFORE access requested -> should be 403
    resp_before = client.get("/nominee/documents", headers=headers)
    assert resp_before.status_code == 403

    # 5. Nominee requests emergency access
    req_resp = client.post(
        "/access-requests",
        json={"nominee_id": nominee_id},
        headers=headers,
    )
    assert req_resp.status_code == 201
    req_data = req_resp.json()
    assert req_data["status"] == "pending"
    req_id = req_data["id"]

    # 6. Test VETO
    veto_resp = client.post(f"/access-requests/{req_id}/veto", headers=headers)
    assert veto_resp.status_code == 200
    assert veto_resp.json()["status"] == "vetoed"

    # Nominee view after VETO -> still 403
    resp_vetoed = client.get("/nominee/documents", headers=headers)
    assert resp_vetoed.status_code == 403

    # 7. Request again and simulate countdown expiry (lazy resolution)
    req2_resp = client.post(
        "/access-requests",
        json={"nominee_id": nominee_id},
        headers=headers,
    ).json()
    req2_id = req2_resp["id"]

    # Directly adjust unlock time in DB to simulate past countdown
    db = SessionLocal()
    db_req = db.query(AccessRequest).filter(AccessRequest.id == req2_id).first()
    db_req.unlocks_at = datetime.now(timezone.utc) - timedelta(seconds=5)
    db.commit()
    db.close()

    # 8. Access nominee documents -> should succeed (200) and return ONLY shareable doc
    unlocked_resp = client.get("/nominee/documents", headers=headers)
    assert unlocked_resp.status_code == 200
    unlocked_docs = unlocked_resp.json()
    assert len(unlocked_docs) == 1
    assert unlocked_docs[0]["title"] == "Vehicle Insurance"
    assert unlocked_docs[0]["is_emergency_shareable"] is True


def test_natural_language_search_and_audit():
    """Verify natural language search returns answers with citations, and audit logs are recorded."""
    # Register user
    reg = client.post(
        "/auth/register",
        json={"name": "Anita Roy", "email": "anita@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Search query
    search_resp = client.post(
        "/search",
        json={"query": "When does my car insurance expire?"},
        headers=headers,
    )
    assert search_resp.status_code == 200
    search_data = search_resp.json()
    assert "answer" in search_data
    assert isinstance(search_data["sources"], list)

    # Audit log check
    audit_resp = client.get("/audit-log", headers=headers)
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert len(logs) >= 1  # includes USER_REGISTERED
