from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship as sa_relationship
from app.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    assets = sa_relationship("Asset", back_populates="owner", cascade="all, delete-orphan")
    documents = sa_relationship("Document", back_populates="user", cascade="all, delete-orphan")
    nominees = sa_relationship("Nominee", back_populates="owner", cascade="all, delete-orphan")
    access_requests = sa_relationship("AccessRequest", back_populates="owner", cascade="all, delete-orphan")
    audit_logs = sa_relationship("AuditLog", back_populates="owner", cascade="all, delete-orphan")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    type = Column(String(50), nullable=False)  # vehicle, property, person, other
    created_at = Column(DateTime, default=utc_now, nullable=False)

    owner = sa_relationship("User", back_populates="assets")
    documents = sa_relationship("Document", back_populates="asset", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    doc_type = Column(String(100), nullable=False)  # RC, Insurance, PUC, etc.
    title = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    fields_json = Column(Text, nullable=True)  # JSON string of extracted fields
    raw_text = Column(Text, nullable=True)
    confidence_json = Column(Text, nullable=True)  # JSON string of confidence scores
    issue_date = Column(String(20), nullable=True)  # YYYY-MM-DD
    expiry_date = Column(String(20), nullable=True)  # YYYY-MM-DD
    is_emergency_shareable = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    user = sa_relationship("User", back_populates="documents")
    asset = sa_relationship("Asset", back_populates="documents")


class Nominee(Base):
    __tablename__ = "nominees"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False)
    relationship = Column(String(50), nullable=False)
    status = Column(String(20), default="invited", nullable=False)  # invited, active
    created_at = Column(DateTime, default=utc_now, nullable=False)

    owner = sa_relationship("User", back_populates="nominees")
    access_requests = sa_relationship("AccessRequest", back_populates="nominee", cascade="all, delete-orphan")


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    nominee_id = Column(Integer, ForeignKey("nominees.id"), nullable=False, index=True)
    status = Column(String(20), default="pending", nullable=False)  # pending, vetoed, approved, expired
    requested_at = Column(DateTime, default=utc_now, nullable=False)
    unlocks_at = Column(DateTime, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    owner = sa_relationship("User", back_populates="access_requests")
    nominee = sa_relationship("Nominee", back_populates="access_requests")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    actor_name = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    target = Column(String(255), nullable=False)
    timestamp = Column(DateTime, default=utc_now, nullable=False)

    owner = sa_relationship("User", back_populates="audit_logs")
