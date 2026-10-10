import os
import io
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_vault_asset_flow.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-asset-flow"
os.environ["AI_MOCK"] = "true"

from app.main import app
from app.database import Base, engine
from app.models import AuditLog

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def register_user(name: str, email: str) -> dict:
    resp = client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "password123"},
    )
    assert resp.status_code == 201
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_asset_success_and_listing():
    """Verify POST /assets creates and GET /assets lists the asset with document_count=0."""
    headers = register_user("Aarav Sharma", "aarav.asset@example.com")

    # 1. Create asset
    create_resp = client.post(
        "/assets",
        json={"name": "Honda City 2024", "type": "vehicle"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    asset_data = create_resp.json()
    assert asset_data["name"] == "Honda City 2024"
    assert asset_data["type"] == "vehicle"
    assert asset_data["document_count"] == 0
    assert asset_data["id"] is not None

    # 2. List assets
    list_resp = client.get("/assets", headers=headers)
    assert list_resp.status_code == 200
    assets = list_resp.json()
    assert len(assets) == 1
    assert assets[0]["name"] == "Honda City 2024"
    assert assets[0]["id"] == asset_data["id"]


def test_create_asset_validation():
    """Verify input validation rejects empty names or invalid categories."""
    headers = register_user("Neha Gupta", "neha.val@example.com")

    # Empty name
    resp1 = client.post(
        "/assets",
        json={"name": "   ", "type": "vehicle"},
        headers=headers,
    )
    assert resp1.status_code == 400

    # Invalid category
    resp2 = client.post(
        "/assets",
        json={"name": "My Pet", "type": "spacecraft"},
        headers=headers,
    )
    assert resp2.status_code in (400, 422)


def test_asset_user_isolation():
    """Verify assets are strictly isolated between authenticated users."""
    headers_user1 = register_user("User One", "user1@example.com")
    headers_user2 = register_user("User Two", "user2@example.com")

    # User 1 creates an asset
    r1 = client.post(
        "/assets",
        json={"name": "Villa 101", "type": "property"},
        headers=headers_user1,
    )
    assert r1.status_code == 201
    user1_asset_id = r1.json()["id"]

    # User 2 lists assets -> should be empty
    r2 = client.get("/assets", headers=headers_user2)
    assert r2.status_code == 200
    assert len(r2.json()) == 0

    # User 2 tries to get User 1's asset -> 404
    r3 = client.get(f"/assets/{user1_asset_id}", headers=headers_user2)
    assert r3.status_code == 404

    # User 2 tries to delete User 1's asset -> 404
    r4 = client.delete(f"/assets/{user1_asset_id}", headers=headers_user2)
    assert r4.status_code == 404


def test_delete_asset_cleans_documents_and_audit():
    """Verify deleting an asset cascades to documents and records audit log."""
    headers = register_user("Dev Patel", "dev@example.com")

    # 1. Create asset
    asset_resp = client.post(
        "/assets",
        json={"name": "KTM Duke 390", "type": "vehicle"},
        headers=headers,
    )
    assert asset_resp.status_code == 201
    asset_id = asset_resp.json()["id"]

    # 2. Upload a document to this asset
    doc_resp = client.post(
        "/documents",
        data={
            "asset_id": asset_id,
            "doc_type": "RC",
            "title": "KTM RC Registration",
            "issue_date": "2023-01-01",
        },
        files={"file": ("ktm_rc.jpg", b"Simulated image binary for KTM RC", "image/jpeg")},
        headers=headers,
    )
    assert doc_resp.status_code == 201
    doc_id = doc_resp.json()["id"]

    # 3. Verify asset has 1 document
    detail_resp = client.get(f"/assets/{asset_id}", headers=headers)
    assert detail_resp.status_code == 200
    assert len(detail_resp.json()["documents"]) == 1

    # 4. Delete the asset
    del_resp = client.delete(f"/assets/{asset_id}", headers=headers)
    assert del_resp.status_code == 200

    # 5. Asset should be gone
    assert client.get(f"/assets/{asset_id}", headers=headers).status_code == 404

    # 6. Documents for this asset should be gone
    docs_list = client.get("/documents", headers=headers).json()
    assert len(docs_list) == 0

    # 7. Check audit logs
    audit_resp = client.get("/audit-log", headers=headers)
    assert audit_resp.status_code == 200
    actions = [a["action"] for a in audit_resp.json()]
    assert "ASSET_CREATE" in actions
    assert "DOCUMENT_UPLOAD" in actions
    assert "ASSET_DELETE" in actions
