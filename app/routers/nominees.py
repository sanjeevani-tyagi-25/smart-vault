from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.config import ACCESS_WAIT_SECONDS
from app.database import get_db
from app.models import User, Nominee, AccessRequest, Document, AuditLog
from app.schemas import NomineeCreate, NomineeOut, AccessRequestOut, DocumentOut
from app.auth import get_current_user
from app.audit import log_audit
from app.routers.assets import serialize_doc

router = APIRouter(tags=["Nominees & Emergency Access"])


class AccessRequestCreate(BaseModel):
    nominee_id: int


def resolve_request_lazily(req: AccessRequest, db: Session) -> AccessRequest:
    """Lazily resolves pending emergency access requests without needing a background worker."""
    if req.status == "pending":
        now = datetime.now(timezone.utc)
        # Handle timezone-naive comparison safely
        unlocks_at = req.unlocks_at
        if unlocks_at.tzinfo is None:
            unlocks_at = unlocks_at.replace(tzinfo=timezone.utc)
        if now >= unlocks_at:
            req.status = "approved"
            req.resolved_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(req)
            log_audit(
                db=db,
                owner_id=req.owner_id,
                actor_name="System",
                action="EMERGENCY_ACCESS_APPROVED",
                target=f"Access auto-unlocked for nominee {req.nominee.name if req.nominee else req.nominee_id}",
            )
    return req


def serialize_access_request(req: AccessRequest) -> AccessRequestOut:
    now = datetime.now(timezone.utc)
    unlocks_at = req.unlocks_at
    if unlocks_at.tzinfo is None:
        unlocks_at = unlocks_at.replace(tzinfo=timezone.utc)
    remaining = max(0, int((unlocks_at - now).total_seconds())) if req.status == "pending" else 0

    return AccessRequestOut(
        id=req.id,
        owner_id=req.owner_id,
        nominee_id=req.nominee_id,
        nominee_name=req.nominee.name if req.nominee else None,
        nominee_relationship=req.nominee.relationship if req.nominee else None,
        status=req.status,
        requested_at=req.requested_at,
        unlocks_at=req.unlocks_at,
        resolved_at=req.resolved_at,
        seconds_remaining=remaining,
    )


# --- Nominee Endpoints ---
@router.post("/nominees", response_model=NomineeOut, status_code=status.HTTP_201_CREATED)
def add_nominee(
    nominee_in: NomineeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a trusted family nominee for emergency vault access."""
    nominee = Nominee(
        owner_id=current_user.id,
        name=nominee_in.name.strip(),
        email=nominee_in.email.strip().lower(),
        relationship=nominee_in.relationship.strip(),
        status="active",  # set active for immediate demo readiness
    )
    db.add(nominee)
    db.commit()
    db.refresh(nominee)

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="NOMINEE_ADDED",
        target=f"{nominee.name} ({nominee.relationship})",
    )

    return NomineeOut.model_validate(nominee)


@router.get("/nominees", response_model=List[NomineeOut])
def list_nominees(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all trusted nominees registered by the owner."""
    nominees = db.query(Nominee).filter(Nominee.owner_id == current_user.id).all()
    return [NomineeOut.model_validate(n) for n in nominees]


@router.delete("/nominees/{nominee_id}")
def delete_nominee(
    nominee_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a nominee from emergency access."""
    nominee = db.query(Nominee).filter(Nominee.id == nominee_id, Nominee.owner_id == current_user.id).first()
    if not nominee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nominee not found")

    name = nominee.name
    db.delete(nominee)
    db.commit()

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="NOMINEE_REMOVED",
        target=name,
    )
    return {"detail": "Nominee removed successfully", "nominee_id": nominee_id}


# --- Emergency Access Requests ---
@router.post("/access-requests", response_model=AccessRequestOut, status_code=status.HTTP_201_CREATED)
def request_emergency_access(
    body: AccessRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Nominee triggers an emergency access request.
    Starts a countdown (ACCESS_WAIT_SECONDS, default 60s in demo mode) giving owner time to VETO.
    """
    nominee = db.query(Nominee).filter(Nominee.id == body.nominee_id).first()
    if not nominee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nominee record not found")

    owner_id = nominee.owner_id
    now = datetime.now(timezone.utc)
    unlocks_at = now + timedelta(seconds=ACCESS_WAIT_SECONDS)

    req = AccessRequest(
        owner_id=owner_id,
        nominee_id=nominee.id,
        status="pending",
        requested_at=now,
        unlocks_at=unlocks_at,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    log_audit(
        db=db,
        owner_id=owner_id,
        actor_name=nominee.name,
        action="REQUEST_EMERGENCY_ACCESS",
        target=f"Access countdown started ({ACCESS_WAIT_SECONDS}s wait period)",
    )

    return serialize_access_request(req)


@router.get("/access-requests", response_model=List[AccessRequestOut])
def get_access_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List access requests for the owner, with automatic lazy resolution."""
    requests = db.query(AccessRequest).filter(AccessRequest.owner_id == current_user.id).order_by(AccessRequest.requested_at.desc()).all()
    results = []
    for r in requests:
        resolved = resolve_request_lazily(r, db)
        results.append(serialize_access_request(resolved))
    return results


@router.get("/access-requests/current", response_model=Optional[AccessRequestOut])
def get_current_access_request(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the latest active or pending access request for the user."""
    req = db.query(AccessRequest).filter(AccessRequest.owner_id == current_user.id).order_by(AccessRequest.requested_at.desc()).first()
    if not req:
        return None
    resolved = resolve_request_lazily(req, db)
    return serialize_access_request(resolved)


@router.post("/access-requests/{request_id}/veto", response_model=AccessRequestOut)
def veto_access_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Owner exercises VETO to immediately cancel and lock emergency access."""
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id, AccessRequest.owner_id == current_user.id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")

    if req.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot veto a request with status '{req.status}'")

    req.status = "vetoed"
    req.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="VETO_EMERGENCY_ACCESS",
        target=f"Vetoed emergency access request #{req.id}",
    )

    return serialize_access_request(req)


@router.post("/access-requests/{request_id}/approve", response_model=AccessRequestOut)
def approve_access_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Owner explicitly approves emergency access immediately without waiting for countdown."""
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id, AccessRequest.owner_id == current_user.id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Access request not found")

    if req.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot approve a request with status '{req.status}'")

    req.status = "approved"
    req.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="OWNER_APPROVE_EMERGENCY_ACCESS",
        target=f"Approved emergency access request #{req.id} for {req.nominee.name if req.nominee else req.nominee_id}",
    )

    return serialize_access_request(req)



# --- Controlled Nominee View ---
@router.get("/nominee/documents", response_model=List[DocumentOut])
def get_nominee_accessible_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Read-only endpoint for nominee view:
    Returns ONLY documents where is_emergency_shareable == True.
    Allowed only after emergency access is approved.
    """
    # Check if there is an approved access request for this user's vault
    approved_req = db.query(AccessRequest).filter(
        AccessRequest.owner_id == current_user.id,
        AccessRequest.status == "approved",
    ).first()

    # In demo mode, if an access request was created, check lazy resolution
    latest_req = db.query(AccessRequest).filter(AccessRequest.owner_id == current_user.id).order_by(AccessRequest.requested_at.desc()).first()
    if latest_req:
        latest_req = resolve_request_lazily(latest_req, db)
        if latest_req.status == "approved":
            approved_req = latest_req

    if not approved_req:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Emergency access has not been unlocked or has been vetoed.",
        )

    # Return only documents flagged as emergency shareable
    docs = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.is_emergency_shareable == True,
    ).all()

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=approved_req.nominee.name if approved_req.nominee else "Nominee",
        action="NOMINEE_VIEW_DOCUMENTS",
        target=f"Viewed {len(docs)} emergency-shareable documents",
    )

    return [serialize_doc(d) for d in docs]
