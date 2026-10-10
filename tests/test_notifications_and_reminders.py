import os
import pytest
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_notifications.db"
os.environ["VAULT_KEY"] = "smartvault-aes256-secret-key-32b!"
os.environ["JWT_SECRET"] = "test-jwt-secret-key"
os.environ["AI_MOCK"] = "true"

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import User, Asset, Document, Notification, ReminderSetting
from app.notifications import (
    calculate_days_left,
    get_today_ist,
    get_user_reminder_intervals,
    check_and_create_notifications_for_document,
    handle_document_renewed,
    run_scheduled_notifications_check,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def create_user_and_token(name="Aarav Sharma", email="aarav@example.com"):
    reg = client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "securepassword123"},
    ).json()
    return reg["access_token"], reg["user"]


def test_ist_timezone_expiry_calculations():
    """Verify that calculations correctly use Asia/Kolkata without UTC/IST double conversion."""
    today_ist = get_today_ist()
    assert isinstance(today_ist, date)

    # Today is 0 days left
    assert calculate_days_left(today_ist.isoformat(), today_ist) == 0

    # Tomorrow is 1 day left
    tomorrow = today_ist + timedelta(days=1)
    assert calculate_days_left(tomorrow.isoformat(), today_ist) == 1

    # 30 days ahead is 30 days left
    in_30_days = today_ist + timedelta(days=30)
    assert calculate_days_left(in_30_days.isoformat(), today_ist) == 30

    # Yesterday is -1 days left
    yesterday = today_ist - timedelta(days=1)
    assert calculate_days_left(yesterday.isoformat(), today_ist) == -1

    # Missing / None date returns None
    assert calculate_days_left(None, today_ist) is None
    assert calculate_days_left("", today_ist) is None
    assert calculate_days_left("invalid-date", today_ist) is None

    # Leap year handling (e.g. 2028-02-29)
    leap_date = date(2028, 2, 29)
    ref_date = date(2028, 2, 28)
    assert calculate_days_left(leap_date.isoformat(), ref_date) == 1


def test_reminder_intervals_and_deduplication():
    """Ensure smart reminders trigger on intervals (30, 7, 1, 0, expired) without creating duplicates."""
    token, user = create_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Create Asset
    asset_res = client.post("/assets", json={"name": "Family Car", "type": "vehicle"}, headers=headers).json()
    asset_id = asset_res["id"]

    today = get_today_ist()
    exp_in_7 = (today + timedelta(days=7)).isoformat()

    # Upload document with 7 days expiry
    doc_res = client.post(
        "/documents",
        data={
            "asset_id": asset_id,
            "doc_type": "Insurance",
            "title": "Comprehensive Car Policy",
            "expiry_date": exp_in_7,
            "fields_json": "{}",
            "confidence_json": "{}",
        },
        files={"file": ("policy.pdf", b"encrypted vehicle policy contents", "application/pdf")},
        headers=headers,
    ).json()
    doc_id = doc_res["id"]

    # Notification should have been created for interval 7
    notif_res = client.get("/notifications", headers=headers).json()
    assert len(notif_res) == 1
    assert notif_res[0]["document_id"] == doc_id
    assert notif_res[0]["interval_days"] == 7
    assert notif_res[0]["days_left"] == 7
    assert notif_res[0]["severity"] == "soon"

    # Running check again should NOT duplicate notification
    client.post("/notifications/check", headers=headers)
    notif_res_after = client.get("/notifications", headers=headers).json()
    assert len(notif_res_after) == 1

    # Verify unread count
    count_res = client.get("/notifications/unread-count", headers=headers).json()
    assert count_res["unread_count"] == 1


def test_notification_endpoints_and_read_dismiss():
    """Test read, mark-all-read, and dismiss operations without deleting underlying documents."""
    token, user = create_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    asset_res = client.post("/assets", json={"name": "Pali Hill Flat", "type": "property"}, headers=headers).json()
    asset_id = asset_res["id"]

    today = get_today_ist()
    exp_in_1 = (today + timedelta(days=1)).isoformat()

    doc_res = client.post(
        "/documents",
        data={
            "asset_id": asset_id,
            "doc_type": "Property Tax",
            "title": "BMC Property Tax Receipt",
            "expiry_date": exp_in_1,
        },
        files={"file": ("tax.pdf", b"test pdf content", "application/pdf")},
        headers=headers,
    ).json()

    notifs = client.get("/notifications", headers=headers).json()
    assert len(notifs) >= 1
    notif_id = notifs[0]["id"]
    assert notifs[0]["is_read"] is False
    assert notifs[0]["is_dismissed"] is False

    # Mark as read
    read_res = client.patch(f"/notifications/{notif_id}/read", headers=headers)
    assert read_res.status_code == 200
    assert read_res.json()["is_read"] is True

    # Mark all read
    mark_all = client.post("/notifications/mark-all-read", headers=headers)
    assert mark_all.status_code == 200

    unread_count = client.get("/notifications/unread-count", headers=headers).json()["unread_count"]
    assert unread_count == 0

    # Dismiss notification
    dismiss_res = client.patch(f"/notifications/{notif_id}/dismiss", headers=headers)
    assert dismiss_res.status_code == 200
    assert dismiss_res.json()["is_dismissed"] is True

    # Active list excludes dismissed
    active_notifs = client.get("/notifications?include_dismissed=false", headers=headers).json()
    assert len(active_notifs) == 0

    # Including dismissed shows it
    all_notifs = client.get("/notifications?include_dismissed=true", headers=headers).json()
    assert len(all_notifs) == 1

    # Underlying document must NOT have been deleted
    doc_check = client.get(f"/documents/{doc_res['id']}", headers=headers)
    assert doc_check.status_code == 200


def test_reminder_settings_configuration():
    """Verify customizable reminder intervals and email preference."""
    token, user = create_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch default settings
    settings = client.get("/notifications/settings", headers=headers).json()
    assert 30 in settings["intervals"]
    assert 7 in settings["intervals"]
    assert 1 in settings["intervals"]
    assert 0 in settings["intervals"]
    assert settings["email_enabled"] is False

    # Update settings to custom intervals [60, 15, 3] and enable email
    put_res = client.put(
        "/notifications/settings",
        json={"intervals": [60, 15, 3], "email_enabled": True},
        headers=headers,
    )
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["intervals"] == [60, 15, 3]
    assert updated["email_enabled"] is True


def test_document_renewal_flow():
    """Verify document renewal: updates confirmed expiry date, transitions previous notifications to renewed, records history."""
    token, user = create_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    asset_res = client.post("/assets", json={"name": "KTM Duke", "type": "vehicle"}, headers=headers).json()
    asset_id = asset_res["id"]

    today = get_today_ist()
    old_expiry = (today + timedelta(days=1)).isoformat()

    doc_res = client.post(
        "/documents",
        data={
            "asset_id": asset_id,
            "doc_type": "PUC",
            "title": "Pollution Certificate",
            "expiry_date": old_expiry,
        },
        files={"file": ("puc.pdf", b"old puc content", "application/pdf")},
        headers=headers,
    ).json()
    doc_id = doc_res["id"]

    # Initial notification exists for old expiry
    notifs_before = client.get("/notifications", headers=headers).json()
    assert len(notifs_before) == 1
    assert notifs_before[0]["interval_days"] == 1
    assert notifs_before[0]["severity"] == "urgent"

    # Renew document: extend expiry by 180 days
    new_expiry = (today + timedelta(days=180)).isoformat()
    renew_res = client.post(
        f"/documents/{doc_id}/renew",
        data={"new_expiry_date": new_expiry, "new_issue_date": today.isoformat(), "notes": "Renewed at testing center"},
        files={"file": ("puc_renewed.pdf", b"new renewed puc document", "application/pdf")},
        headers=headers,
    )
    assert renew_res.status_code == 200
    renewed_doc = renew_res.json()
    assert renewed_doc["expiry_date"] == new_expiry

    # Verify previous notification transitioned to 'renewed'
    all_notifs = client.get("/notifications?include_dismissed=true", headers=headers).json()
    renewed_notifs = [n for n in all_notifs if n["document_id"] == doc_id and n["state"] == "renewed"]
    assert len(renewed_notifs) >= 1
    assert renewed_notifs[0]["severity"] == "renewed"
    assert "Renewed" in renewed_notifs[0]["title"]

    # Verify audit log recorded DOCUMENT_RENEWAL
    audit_res = client.get("/audit-log", headers=headers).json()
    renew_audit = [a for a in audit_res if a["action"] == "DOCUMENT_RENEWAL"]
    assert len(renew_audit) >= 1


def test_user_isolation_security():
    """Ensure User B cannot view or modify User A's notifications or documents."""
    token_a, user_a = create_user_and_token(name="User A", email="usera@example.com")
    token_b, user_b = create_user_and_token(name="User B", email="userb@example.com")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A creates asset and document
    asset_a = client.post("/assets", json={"name": "Asset A", "type": "other"}, headers=headers_a).json()
    today = get_today_ist()
    doc_a = client.post(
        "/documents",
        data={"asset_id": asset_a["id"], "doc_type": "Passport", "title": "Passport A", "expiry_date": (today + timedelta(days=7)).isoformat()},
        files={"file": ("pass.pdf", b"passport", "application/pdf")},
        headers=headers_a,
    ).json()

    notifs_a = client.get("/notifications", headers=headers_a).json()
    assert len(notifs_a) == 1
    notif_a_id = notifs_a[0]["id"]

    # User B should NOT see User A's notifications
    notifs_b = client.get("/notifications", headers=headers_b).json()
    assert len(notifs_b) == 0

    # User B cannot read User A's notification
    patch_read = client.patch(f"/notifications/{notif_a_id}/read", headers=headers_b)
    assert patch_read.status_code == 404

    # User B cannot dismiss User A's notification
    patch_dismiss = client.patch(f"/notifications/{notif_a_id}/dismiss", headers=headers_b)
    assert patch_dismiss.status_code == 404

    # User B cannot renew User A's document
    renew_b = client.post(
        f"/documents/{doc_a['id']}/renew",
        data={"new_expiry_date": "2030-01-01"},
        headers=headers_b,
    )
    assert renew_b.status_code == 404


def test_background_scheduler_check():
    """Ensure run_scheduled_notifications_check processes all documents accurately across users."""
    db = SessionLocal()
    try:
        res = run_scheduled_notifications_check(db)
        assert isinstance(res, dict)
        assert "created_count" in res
        assert "checked_documents" in res
    finally:
        db.close()
