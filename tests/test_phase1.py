import os
import pytest
from fastapi.testclient import TestClient

# Use in-memory SQLite for tests
os.environ["DATABASE_URL"] = "sqlite:///./test_vault.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key"

from app.main import app
from app.database import Base, engine
from app.crypto import encrypt_bytes, decrypt_bytes

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_crypto_aes256_roundtrip():
    """Verify AES-256 GCM encryption and decryption roundtrip."""
    raw_payload = b"Top secret vehicle policy text for Honda City DL-01-AB-1234"
    encrypted = encrypt_bytes(raw_payload)

    # Must be encrypted (not containing plain text)
    assert raw_payload not in encrypted
    assert len(encrypted) > len(raw_payload)

    # Must decrypt back to original
    decrypted = decrypt_bytes(encrypted)
    assert decrypted == raw_payload


def test_auth_registration_and_login():
    """Verify user registration, login, and protected route access."""
    # 1. Register
    reg_resp = client.post(
        "/auth/register",
        json={"name": "Aarav Sharma", "email": "aarav@example.com", "password": "password123"},
    )
    assert reg_resp.status_code == 201
    data = reg_resp.json()
    assert "access_token" in data
    assert data["user"]["email"] == "aarav@example.com"
    token = data["access_token"]

    # 2. Login
    login_resp = client.post(
        "/auth/login",
        json={"email": "aarav@example.com", "password": "password123"},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()

    # 3. Access /me
    me_resp = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["name"] == "Aarav Sharma"


def test_asset_crud_and_missing_doc_detector():
    """Verify asset creation and required documents checklist."""
    # Register & get token
    reg = client.post(
        "/auth/register",
        json={"name": "Aarav Sharma", "email": "aarav2@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create vehicle asset: Honda City
    asset_resp = client.post(
        "/assets",
        json={"name": "Honda City", "type": "vehicle"},
        headers=headers,
    )
    assert asset_resp.status_code == 201
    asset_data = asset_resp.json()
    asset_id = asset_data["id"]
    assert asset_data["name"] == "Honda City"
    assert asset_data["missing_count"] == 4  # RC, Insurance, PUC, Driving License

    # Fetch asset detail
    detail_resp = client.get(f"/assets/{asset_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    missing_types = [item["doc_type"] for item in detail["missing_docs"]]
    assert "RC" in missing_types
    assert "Insurance" in missing_types
    assert "PUC" in missing_types


def test_document_encrypted_upload_and_download():
    """Verify document upload encrypts blob at rest and decrypts on download."""
    # Register & get token
    reg = client.post(
        "/auth/register",
        json={"name": "Aarav Sharma", "email": "aarav3@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create asset
    asset = client.post("/assets", json={"name": "Honda City", "type": "vehicle"}, headers=headers).json()
    asset_id = asset["id"]

    # Upload document
    test_file_content = b"%PDF-1.4 Mock Honda City Insurance Policy 2026"
    upload_resp = client.post(
        "/documents",
        data={
            "asset_id": str(asset_id),
            "doc_type": "Insurance",
            "title": "HDFC ERGO Comprehensive Policy",
            "issue_date": "2025-01-01",
            "expiry_date": "2026-01-01",
        },
        files={"file": ("honda_insurance.pdf", test_file_content, "application/pdf")},
        headers=headers,
    )
    assert upload_resp.status_code == 201
    doc_data = upload_resp.json()
    doc_id = doc_data["id"]
    assert doc_data["doc_type"] == "Insurance"

    # Verify asset missing documents updated (Insurance is now present)
    detail = client.get(f"/assets/{asset_id}", headers=headers).json()
    missing_types = [m["doc_type"] for m in detail["missing_docs"]]
    assert "Insurance" not in missing_types
    assert "PUC" in missing_types

    # Download decrypted document
    download_resp = client.get(f"/documents/{doc_id}/file", headers=headers)
    assert download_resp.status_code == 200
    assert download_resp.content == test_file_content
    assert download_resp.headers["x-content-encrypted-at-rest"] == "AES-256-GCM"

    # Delete document
    del_resp = client.delete(f"/documents/{doc_id}", headers=headers)
    assert del_resp.status_code == 200

    # Ensure document is gone
    get_after = client.get(f"/documents/{doc_id}", headers=headers)
    assert get_after.status_code == 404
