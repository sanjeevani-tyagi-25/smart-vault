from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import AuditLog


def log_audit(
    db: Session,
    owner_id: int,
    actor_name: str,
    action: str,
    target: str,
) -> AuditLog:
    """Record an action in the immutable audit log."""
    log_entry = AuditLog(
        owner_id=owner_id,
        actor_name=actor_name,
        action=action,
        target=target,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry
