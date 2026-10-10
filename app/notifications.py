import json
import logging
from datetime import datetime, timezone, date
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo
from sqlalchemy.orm import Session
import urllib.request
import urllib.error

from app.config import ENABLE_RESEND_EMAIL, RESEND_API_KEY
from app.models import Notification, ReminderSetting, Document, User, utc_now

logger = logging.getLogger(__name__)

# Timezone according to Indian Standard Time (Asia/Kolkata)
IST = ZoneInfo("Asia/Kolkata")

# Default reminder intervals before expiry
DEFAULT_INTERVALS = [30, 7, 1, 0]


def get_today_ist() -> date:
    """Returns current date in Asia/Kolkata timezone without timezone skew."""
    return datetime.now(timezone.utc).astimezone(IST).date()


def calculate_days_left(expiry_date_str: Optional[str], ref_date: Optional[date] = None) -> Optional[int]:
    """
    Calculates days remaining from ref_date (defaulting to today in Asia/Kolkata) to expiry_date_str.
    Returns None if date is empty or invalid.
    """
    if not expiry_date_str:
        return None
    try:
        exp_date = datetime.strptime(expiry_date_str.strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError, AttributeError):
        return None
    if ref_date is None:
        ref_date = get_today_ist()
    return (exp_date - ref_date).days



def get_user_reminder_intervals(db: Session, user_id: int) -> List[int]:
    """Retrieves user configured reminder intervals, defaulting to [30, 7, 1, 0]."""
    setting = db.query(ReminderSetting).filter(ReminderSetting.user_id == user_id).first()
    if setting and setting.intervals_json:
        try:
            parsed = json.loads(setting.intervals_json)
            if isinstance(parsed, list) and len(parsed) > 0:
                return sorted([int(x) for x in parsed if int(x) >= 0], reverse=True)
        except Exception:
            pass
    return sorted(DEFAULT_INTERVALS, reverse=True)


def is_user_email_enabled(db: Session, user_id: int) -> bool:
    """Checks whether user has opted into email reminders."""
    setting = db.query(ReminderSetting).filter(ReminderSetting.user_id == user_id).first()
    return bool(setting.email_enabled) if setting else False


def send_expiry_email_alert(
    to_email: str,
    user_name: str,
    doc_title: str,
    asset_name: str,
    expiry_date_str: str,
    days_left: int,
) -> bool:
    """
    Sends transactional email alert using Resend API if configured in .env.
    Never exposes full document numbers or secrets in email content.
    Returns True if sent, False otherwise.
    """
    if not (ENABLE_RESEND_EMAIL and RESEND_API_KEY):
        logger.debug("Email notifications disabled or RESEND_API_KEY missing.")
        return False

    status_str = "expired" if days_left < 0 else f"expires in {days_left} days" if days_left > 0 else "expires today"
    subject = f"Smart Vault Reminder: {doc_title} ({asset_name}) {status_str}"

    html_content = f"""
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
        <h2 style="color: #0b1730; margin: 0;">Smart Vault Document Alert</h2>
      </div>
      <p style="color: #334155; font-size: 14px;">Hello {user_name},</p>
      <p style="color: #334155; font-size: 14px;">
        This is an automated reminder that your document <strong>{doc_title}</strong> 
        associated with asset <strong>{asset_name}</strong> is scheduled for expiry on <strong>{expiry_date_str}</strong>.
      </p>
      <div style="margin: 24px 0;">
        <a href="http://localhost:3000/vault" style="background-color: #08c5b3; color: #0b1730; padding: 10px 20px; border-radius: 8px; font-weight: bold; text-decoration: none; font-size: 13px;">
          Open My Vault to Review
        </a>
      </div>
      <p style="color: #94a3b8; font-size: 11px;">AES-256-GCM Encrypted Smart Vault • End-to-End Family Protection</p>
    </div>
    """

    payload = json.dumps({
        "from": "Smart Vault <onboarding@resend.dev>",
        "to": [to_email],
        "subject": subject,
        "html": html_content,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        logger.warning("Failed to send Resend notification email: %s", e)
        return False


def check_and_create_notifications_for_document(
    db: Session,
    doc: Document,
    intervals: Optional[List[int]] = None,
    today_ist: Optional[date] = None,
) -> List[Notification]:
    """
    Checks document expiry date against configured intervals and creates persistent notifications.
    Deduplicates strictly: avoids creating multiple notifications for the same (doc.id, expiry_date, interval_days).
    """
    if not doc.expiry_date:
        return []

    try:
        exp_date = datetime.strptime(doc.expiry_date.strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return []

    if today_ist is None:
        today_ist = get_today_ist()

    if intervals is None:
        intervals = get_user_reminder_intervals(db, doc.user_id)

    days_left = (exp_date - today_ist).days
    created_notifications: List[Notification] = []

    # 1. Determine triggered intervals
    # A. Expired check: interval -1
    if days_left < 0:
        existing = db.query(Notification).filter(
            Notification.document_id == doc.id,
            Notification.expiry_date == doc.expiry_date,
            Notification.interval_days == -1,
        ).first()

        if not existing:
            notif = Notification(
                user_id=doc.user_id,
                document_id=doc.id,
                asset_id=doc.asset_id,
                title=f"{doc.title} - Expired",
                message=f"{doc.asset.name if doc.asset else 'Asset'} • {doc.doc_type} expired on {doc.expiry_date} ({abs(days_left)} days ago).",
                severity="expired",
                days_left=days_left,
                interval_days=-1,
                state="active",
                is_read=False,
                is_dismissed=False,
                expiry_date=doc.expiry_date,
            )
            db.add(notif)
            created_notifications.append(notif)

    # B. Configured intervals (e.g. 30, 7, 1, 0)
    # Match the smallest configured interval threshold that is >= days_left
    if days_left >= 0 and intervals:
        applicable_intervals = [i for i in sorted(intervals) if i >= days_left]
        if applicable_intervals:
            int_val = min(applicable_intervals)
            existing = db.query(Notification).filter(
                Notification.document_id == doc.id,
                Notification.expiry_date == doc.expiry_date,
                Notification.interval_days == int_val,
            ).first()

            if not existing:
                if days_left == 0:
                    sev = "urgent"
                    title = f"{doc.title} - Expires Today"
                elif days_left <= 1:
                    sev = "urgent"
                    title = f"{doc.title} - Expires Tomorrow"
                elif days_left <= 7:
                    sev = "soon"
                    title = f"{doc.title} - Expires in {days_left} Days"
                else:
                    sev = "upcoming"
                    title = f"{doc.title} - Due in {days_left} Days"

                notif = Notification(
                    user_id=doc.user_id,
                    document_id=doc.id,
                    asset_id=doc.asset_id,
                    title=title,
                    message=f"{doc.asset.name if doc.asset else 'Asset'} • {doc.doc_type} is valid until {doc.expiry_date} ({days_left} days left).",
                    severity=sev,
                    days_left=days_left,
                    interval_days=int_val,
                    state="active",
                    is_read=False,
                    is_dismissed=False,
                    expiry_date=doc.expiry_date,
                )
                db.add(notif)
                created_notifications.append(notif)

    if created_notifications:
        db.commit()
        for n in created_notifications:
            db.refresh(n)

        # Trigger optional email if user enabled email reminders
        if is_user_email_enabled(db, doc.user_id) and doc.user:
            for n in created_notifications:
                send_expiry_email_alert(
                    to_email=doc.user.email,
                    user_name=doc.user.name,
                    doc_title=doc.title,
                    asset_name=doc.asset.name if doc.asset else "Asset",
                    expiry_date_str=doc.expiry_date,
                    days_left=days_left,
                )

    return created_notifications


def handle_document_renewed(
    db: Session,
    doc: Document,
    new_expiry_date: str,
) -> None:
    """
    Updates document expiry date upon renewal and transitions previous active alerts to 'renewed'.
    Prevents obsolete reminders and schedules new alerts for the new date.
    """
    old_expiry = doc.expiry_date
    cleaned_new_date = new_expiry_date.strip()

    # 1. Mark existing notifications for this document as renewed / superseded
    old_notifs = db.query(Notification).filter(
        Notification.document_id == doc.id,
        Notification.state.in_(["active", "read"]),
    ).all()

    for n in old_notifs:
        n.state = "renewed"
        n.severity = "renewed"
        n.is_read = True
        n.title = f"{doc.title} - Renewed"
        n.message = f"Renewed successfully. Previous expiry ({old_expiry}) extended to {cleaned_new_date}."

    # 2. Update document expiry date
    doc.expiry_date = cleaned_new_date
    db.commit()
    db.refresh(doc)

    # 3. Generate fresh notifications for new expiry date if within reminder thresholds
    check_and_create_notifications_for_document(db, doc)


def run_scheduled_notifications_check(db: Session) -> Dict[str, Any]:
    """
    Background batch job checking all user documents for upcoming or expired status.
    Can be run autonomously on a timer or on-demand.
    """
    today_ist = get_today_ist()
    docs = db.query(Document).filter(Document.expiry_date.isnot(None)).all()

    checked_count = 0
    created_count = 0

    for doc in docs:
        if not doc.expiry_date:
            continue
        checked_count += 1
        created = check_and_create_notifications_for_document(db, doc, today_ist=today_ist)
        created_count += len(created)

    return {
        "status": "completed",
        "today_ist": today_ist.isoformat(),
        "checked_documents": checked_count,
        "created_notifications": created_count,
        "created_count": created_count,
    }
