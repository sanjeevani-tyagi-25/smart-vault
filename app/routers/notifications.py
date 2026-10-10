import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Notification, ReminderSetting, Document, utc_now
from app.schemas import NotificationOut, ReminderSettingOut, ReminderSettingUpdate
from app.auth import get_current_user
from app.notifications import (
    get_user_reminder_intervals,
    is_user_email_enabled,
    check_and_create_notifications_for_document,
    run_scheduled_notifications_check,
    get_today_ist,
)

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def serialize_notification(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=n.id,
        user_id=n.user_id,
        document_id=n.document_id,
        asset_id=n.asset_id,
        asset_name=n.asset.name if n.asset else None,
        document_title=n.document.title if n.document else None,
        title=n.title,
        message=n.message,
        severity=n.severity,
        days_left=n.days_left,
        interval_days=n.interval_days,
        state=n.state,
        is_read=n.is_read,
        is_dismissed=n.is_dismissed,
        expiry_date=n.expiry_date,
        created_at=n.created_at,
        read_at=n.read_at,
    )


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False, description="Filter for unread notifications only"),
    include_dismissed: bool = Query(False, description="Include dismissed notifications"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List expiry alerts and smart reminders for authenticated vault owner.
    Supports filtering by unread and dismissed states.
    """
    # First sync/generate any new reminders for current user's documents
    user_docs = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.expiry_date.isnot(None),
    ).all()
    today_ist = get_today_ist()
    for doc in user_docs:
        check_and_create_notifications_for_document(db, doc, today_ist=today_ist)

    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        query = query.filter(Notification.is_read == False)
    if not include_dismissed:
        query = query.filter(Notification.is_dismissed == False)

    notifications = query.order_by(Notification.created_at.desc()).all()
    return [serialize_notification(n) for n in notifications]


@router.get("/unread-count")
def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns number of unread, non-dismissed notifications for the bell badge."""
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
        Notification.is_dismissed == False,
    ).count()
    return {"unread_count": count}


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a notification as read."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notif.is_read = True
    notif.read_at = utc_now()
    db.commit()
    db.refresh(notif)
    return serialize_notification(notif)


@router.post("/mark-all-read")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark all active notifications for the current user as read."""
    unread_notifs = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).all()

    now = utc_now()
    for n in unread_notifs:
        n.is_read = True
        n.read_at = now

    db.commit()
    return {"detail": "All notifications marked as read", "count": len(unread_notifs)}


@router.patch("/{notification_id}/dismiss", response_model=NotificationOut)
def dismiss_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Dismiss a notification without deleting the underlying document.
    """
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notif.is_dismissed = True
    notif.dismissed_at = utc_now()
    db.commit()
    db.refresh(notif)
    return serialize_notification(notif)


@router.get("/settings", response_model=ReminderSettingOut)
def get_reminder_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get user's configured reminder schedule intervals."""
    intervals = get_user_reminder_intervals(db, current_user.id)
    email_enabled = is_user_email_enabled(db, current_user.id)
    return ReminderSettingOut(
        user_id=current_user.id,
        intervals=intervals,
        email_enabled=email_enabled,
    )


@router.put("/settings", response_model=ReminderSettingOut)
def update_reminder_settings(
    settings_in: ReminderSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user's configured reminder intervals (e.g. [30, 7, 1, 0])."""
    # Clean and validate intervals
    cleaned_intervals = sorted(list(set([int(x) for x in settings_in.intervals if int(x) >= 0])), reverse=True)
    if not cleaned_intervals:
        cleaned_intervals = [30, 7, 1, 0]

    setting = db.query(ReminderSetting).filter(ReminderSetting.user_id == current_user.id).first()
    if not setting:
        setting = ReminderSetting(
            user_id=current_user.id,
            intervals_json=json.dumps(cleaned_intervals),
            email_enabled=bool(settings_in.email_enabled),
        )
        db.add(setting)
    else:
        setting.intervals_json = json.dumps(cleaned_intervals)
        setting.email_enabled = bool(settings_in.email_enabled)
        setting.updated_at = utc_now()

    db.commit()
    db.refresh(setting)

    # Immediately check documents with updated interval schedule
    user_docs = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.expiry_date.isnot(None),
    ).all()
    today_ist = get_today_ist()
    for doc in user_docs:
        check_and_create_notifications_for_document(db, doc, intervals=cleaned_intervals, today_ist=today_ist)

    return ReminderSettingOut(
        user_id=current_user.id,
        intervals=cleaned_intervals,
        email_enabled=setting.email_enabled,
    )


@router.post("/check")
def trigger_notifications_check(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    On-demand trigger to check all user documents against current date and reminder thresholds.
    """
    today_ist = get_today_ist()
    user_docs = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.expiry_date.isnot(None),
    ).all()

    created_total = 0
    intervals = get_user_reminder_intervals(db, current_user.id)
    for doc in user_docs:
        created = check_and_create_notifications_for_document(db, doc, intervals=intervals, today_ist=today_ist)
        created_total += len(created)

    return {
        "status": "success",
        "today_ist": today_ist.isoformat(),
        "checked_documents": len(user_docs),
        "created_notifications": created_total,
    }
