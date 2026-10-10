from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Asset, Document, Nominee, AuditLog
from app.schemas import AuditLogOut
from app.auth import get_current_user
from app.checklist import get_checklist_for_asset, get_missing_for_asset

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

RENEWAL_URLS = {
    "Insurance": "https://www.policybazaar.com/",
    "Health Insurance": "https://www.policybazaar.com/health-insurance/",
    "PUC": "https://parivahan.gov.in",
    "RC": "https://parivahan.gov.in",
    "Driving License": "https://parivahan.gov.in",
}


def compute_expiry_status(expiry_date_str: Optional[str], today: datetime.date) -> Optional[Dict[str, Any]]:
    if not expiry_date_str:
        return None
    try:
        exp_date = datetime.strptime(expiry_date_str, "%Y-%m-%d").date()
    except ValueError:
        return None

    days_left = (exp_date - today).days
    if days_left < 0:
        severity = "expired"
        label = f"Expired {abs(days_left)} days ago"
        color = "red"
    elif days_left <= 7:
        severity = "urgent"
        label = f"Expires in {days_left} days" if days_left > 0 else "Expires today"
        color = "red"
    elif days_left <= 30:
        severity = "soon"
        label = f"Expires in {days_left} days"
        color = "amber"
    else:
        severity = "healthy"
        label = f"Valid for {days_left} days"
        color = "green"

    return {
        "days_left": days_left,
        "severity": severity,
        "label": label,
        "color": color,
    }


@router.get("")
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns family document dashboard:
    - Readiness Score (50% completeness + 30% expiry health + 20% nominee setup)
    - Next Best Actions with score improvements
    - Expiry Alerts sorted by days remaining with renewal links
    - Assets Summary with checklist & missing documents
    """
    today = datetime.now(timezone.utc).date()
    assets = db.query(Asset).filter(Asset.user_id == current_user.id).all()
    nominees = db.query(Nominee).filter(Nominee.owner_id == current_user.id).all()

    total_required = 0
    present_required = 0
    docs_with_dates = 0
    healthy_docs = 0

    alerts = []
    assets_summary = []
    next_actions = []

    raw_missing_actions = []

    for asset in assets:
        present_types = {d.doc_type for d in asset.documents}
        checklist = get_checklist_for_asset(asset.type, present_types)
        missing = get_missing_for_asset(asset.type, present_types)

        req_items = [item for item in checklist if not item.get("optional")]
        total_required += len(req_items)
        present_required += sum(1 for item in req_items if item["present"])

        for doc in asset.documents:
            exp_info = compute_expiry_status(doc.expiry_date, today)
            if exp_info:
                docs_with_dates += 1
                if exp_info["severity"] == "healthy":
                    healthy_docs += 1

                # Alert if not healthy or if expiring soon
                if exp_info["severity"] in ("expired", "urgent", "soon"):
                    alerts.append({
                        "document_id": doc.id,
                        "title": doc.title,
                        "doc_type": doc.doc_type,
                        "asset_name": asset.name,
                        "asset_id": asset.id,
                        "expiry_date": doc.expiry_date,
                        "days_left": exp_info["days_left"],
                        "severity": exp_info["severity"],
                        "label": exp_info["label"],
                        "color": exp_info["color"],
                        "renew_url": RENEWAL_URLS.get(doc.doc_type),
                    })

        # Track missing required documents for next best actions
        for m in missing:
            if not m.get("optional"):
                raw_missing_actions.append({
                    "action": f"Upload {m['doc_type']} for {asset.name}",
                    "asset_id": asset.id,
                    "doc_type": m["doc_type"],
                })

        assets_summary.append({
            "id": asset.id,
            "name": asset.name,
            "type": asset.type,
            "document_count": len(asset.documents),
            "missing_count": len(missing),
            "missing_docs": missing,
            "checklist": checklist,
        })

    # Calculate dynamic points improvements from actual score formula
    doc_pts = max(1, round(50 / max(1, total_required))) if total_required > 0 else 10
    for act in raw_missing_actions:
        next_actions.append({
            **act,
            "estimated_improvement": f"+{doc_pts} points",
        })

    # Sort alerts by days left ascending (most urgent first)
    alerts.sort(key=lambda x: x["days_left"])

    total_docs = sum(len(a.documents) for a in assets)

    # 1. Completeness score (0 - 50)
    if total_required > 0:
        completeness_pct = present_required / total_required
    else:
        completeness_pct = 1.0 if assets else 0.0
    completeness_score = round(completeness_pct * 50)

    # 2. Expiry Health score (0 - 30)
    if docs_with_dates > 0:
        expiry_pct = healthy_docs / docs_with_dates
    elif total_docs > 0:
        expiry_pct = 1.0  # documents present, but permanent (no expiry dates)
    else:
        expiry_pct = 0.0  # fresh vault with no documents
    expiry_score = round(expiry_pct * 30)

    # 3. Nominee Setup score (0 - 20)
    has_active = any(n.status == "active" for n in nominees)
    has_invited = any(n.status == "invited" for n in nominees)
    if has_active:
        nominee_score = 20
    elif has_invited:
        nominee_score = 10
    else:
        nominee_score = 0

    if not nominees:
        next_actions.insert(0, {
            "action": "Add an emergency nominee",
            "asset_id": None,
            "doc_type": None,
            "estimated_improvement": "+20 points",
        })
    elif not has_active:
        next_actions.insert(0, {
            "action": "Activate invited nominee",
            "asset_id": None,
            "doc_type": None,
            "estimated_improvement": "+10 points",
        })

    readiness_score = min(100, completeness_score + expiry_score + nominee_score)

    expiring_soon_count = sum(1 for a in alerts if a["severity"] in ("urgent", "soon"))
    expired_count = sum(1 for a in alerts if a["severity"] == "expired")
    missing_count = sum(a["missing_count"] for a in assets_summary)

    recent_logs = (
        db.query(AuditLog)
        .filter(AuditLog.owner_id == current_user.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(6)
        .all()
    )
    recent_activity = [AuditLogOut.model_validate(l).model_dump(mode="json") for l in recent_logs]

    return {
        "readiness_score": readiness_score,
        "breakdown": {
            "completeness": {"score": completeness_score, "max": 50, "percentage": round(completeness_pct * 100)},
            "expiry_health": {"score": expiry_score, "max": 30, "percentage": round(expiry_pct * 100)},
            "nominee_setup": {"score": nominee_score, "max": 20},
        },
        "next_actions": next_actions[:4],
        "alerts": alerts,
        "assets": assets_summary,
        "total_documents": sum(len(a.documents) for a in assets),
        "total_assets": len(assets),
        "expiring_soon_count": expiring_soon_count,
        "expired_count": expired_count,
        "missing_count": missing_count,
        "recent_activity": recent_activity,
    }

