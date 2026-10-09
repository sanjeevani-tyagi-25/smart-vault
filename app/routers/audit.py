from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, AuditLog
from app.schemas import AuditLogOut
from app.auth import get_current_user

router = APIRouter(prefix="/audit-log", tags=["Audit Log"])


@router.get("", response_model=List[AuditLogOut])
def get_audit_trail(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve immutable audit log of all security events and access activities."""
    logs = db.query(AuditLog).filter(AuditLog.owner_id == current_user.id).order_by(AuditLog.timestamp.desc()).limit(100).all()
    return [AuditLogOut.model_validate(l) for l in logs]
