import os
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_vault_full_spec.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key"
os.environ["AI_MOCK"] = "true"

from app.main import app
from app.database import Base, engine, SessionLocal
from app.checklist import get_checklist_for_asset, get_missing_for_asset
from app.ai.mock_data import get_mock_extraction

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_checklist_canonical_registry_and_alias_resolution():
    """Verify Registry is properly recognized and alias matching works."""
    # When user has uploaded 'Registry'
    checklist = get_checklist_for_asset("property", {"Registry"})
    reg_item = next(item for item in checklist if item["doc_type"] == "Registry")
    assert reg_item["present"] is True

    # When user has uploaded 'Registry/Sale Deed' alias
    checklist_alias = get_checklist_for_asset("property", {"Registry/Sale Deed"})
    reg_alias = next(item for item in checklist_alias if item["doc_type"] == "Registry")
    assert reg_alias["present"] is True

    # Missing detector should NOT report Registry as missing
    missing = get_missing_for_asset("property", {"Registry"})
    missing_types = [m["doc_type"] for m in missing]
    assert "Registry" not in missing_types
    assert "Property Tax Receipt" in missing_types
    assert "Electricity Bill" in missing_types


def test_mock_data_new_spec_document_types():
    """Verify Driving License, Property Tax Receipt, and Passport mock extraction."""
    # Driving License
    dl = get_mock_extraction("driving_license.jpg")
    assert dl["doc_type"] == "Driving License"
    assert dl["fields"]["number"] == "DL-0420110092834"
    assert dl["confidence"]["doc_type"] >= 0.95

    # Property Tax Receipt
    pt = get_mock_extraction("property_tax_receipt.jpg")
    assert pt["doc_type"] == "Property Tax Receipt"
    assert "PT-" in pt["fields"]["number"]

    # Passport
    pp = get_mock_extraction("passport.pdf")
    assert pp["doc_type"] == "Passport"
    assert pp["fields"]["number"] == "Z8192841"


def test_dashboard_dynamic_score_improvements():
    """Verify next actions compute dynamic point improvements rather than hardcoded strings."""
    # Register user
    reg = client.post(
        "/auth/register",
        json={"name": "Kavita Verma", "email": "kavita@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create vehicle asset: Honda City (has 4 required docs: RC, Insurance, PUC, Driving License)
    client.post("/assets", json={"name": "Honda City", "type": "vehicle"}, headers=headers)

    dash = client.get("/dashboard", headers=headers).json()
    assert dash["readiness_score"] < 50
    assert len(dash["next_actions"]) > 0

    # Ensure improvement string has dynamically computed points (e.g. "+13 points" or "+20 points")
    for act in dash["next_actions"]:
        assert "points" in act["estimated_improvement"]
        assert "%" not in act["estimated_improvement"]


def test_asset_scoped_search_missing_documents():
    """Verify search returns asset-specific missing documents for queries like 'missing documents for Flat 302'."""
    reg = client.post(
        "/auth/register",
        json={"name": "Sameer Joshi", "email": "sameer@example.com", "password": "password123"},
    ).json()
    token = reg["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Add Honda City and Flat 302
    client.post("/assets", json={"name": "Honda City", "type": "vehicle"}, headers=headers)
    client.post("/assets", json={"name": "Flat 302", "type": "property"}, headers=headers)

    # Query specifically for Flat 302
    resp = client.post("/search", json={"query": "What documents are missing for Flat 302?"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "Flat 302 is missing" in data["answer"]
    assert "Honda City" not in data["answer"]
    assert len(data["sources"]) > 0
