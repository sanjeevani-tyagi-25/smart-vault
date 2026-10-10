from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, TypeDecorator
from sqlalchemy.orm import relationship as sa_relationship
from app.database import Base


class UTCDateTime(TypeDecorator):
    """
    Ensures DateTime values are timezone-aware UTC in Python.
    SQLite stores timestamps as naive ISO/strings.
    When retrieving from SQLite, naive datetimes are populated with tzinfo=timezone.utc.
    When persisting, datetimes are converted to UTC.
    """
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if isinstance(value, str):
                return value
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            else:
                value = value.astimezone(timezone.utc)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        return value


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(UTCDateTime, default=utc_now, nullable=False)

    assets = sa_relationship("Asset", back_populates="owner", cascade="all, delete-orphan")
    documents = sa_relationship("Document", back_populates="user", cascade="all, delete-orphan")
    nominees = sa_relationship("Nominee", back_populates="owner", cascade="all, delete-orphan")
    access_requests = sa_relationship("AccessRequest", back_populates="owner", cascade="all, delete-orphan")
    audit_logs = sa_relationship("AuditLog", back_populates="owner", cascade="all, delete-orphan")
    notifications = sa_relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    reminder_setting = sa_relationship("ReminderSetting", back_populates="user", uselist=False, cascade="all, delete-orphan")



class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    type = Column(String(50), nullable=False)  # vehicle, property, person, other
    created_at = Column(UTCDateTime, default=utc_now, nullable=False)

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
    created_at = Column(UTCDateTime, default=utc_now, nullable=False)

    user = sa_relationship("User", back_populates="documents")
    asset = sa_relationship("Asset", back_populates="documents")
    notifications = sa_relationship("Notification", back_populates="document", cascade="all, delete-orphan")



class Nominee(Base):
    __tablename__ = "nominees"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), nullable=False)
    relationship = Column(String(50), nullable=False)
    status = Column(String(20), default="invited", nullable=False)  # invited, active
    created_at = Column(UTCDateTime, default=utc_now, nullable=False)

    owner = sa_relationship("User", back_populates="nominees")
    access_requests = sa_relationship("AccessRequest", back_populates="nominee", cascade="all, delete-orphan")


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    nominee_id = Column(Integer, ForeignKey("nominees.id"), nullable=False, index=True)
    status = Column(String(20), default="pending", nullable=False)  # pending, vetoed, approved, expired
    requested_at = Column(UTCDateTime, default=utc_now, nullable=False)
    unlocks_at = Column(UTCDateTime, nullable=False)
    resolved_at = Column(UTCDateTime, nullable=True)

    owner = sa_relationship("User", back_populates="access_requests")
    nominee = sa_relationship("Nominee", back_populates="access_requests")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    actor_name = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    target = Column(String(255), nullable=False)
    timestamp = Column(UTCDateTime, default=utc_now, nullable=False)

    owner = sa_relationship("User", back_populates="audit_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False)  # upcoming, soon, urgent, expired, renewed
    days_left = Column(Integer, nullable=False)
    interval_days = Column(Integer, nullable=False)  # e.g. 30, 7, 1, 0, -1
    state = Column(String(20), default="active", nullable=False)  # active, read, dismissed, renewed
    is_read = Column(Boolean, default=False, nullable=False)
    is_dismissed = Column(Boolean, default=False, nullable=False)
    expiry_date = Column(String(20), nullable=True)  # YYYY-MM-DD
    created_at = Column(UTCDateTime, default=utc_now, nullable=False)
    read_at = Column(UTCDateTime, nullable=True)
    dismissed_at = Column(UTCDateTime, nullable=True)

    user = sa_relationship("User", back_populates="notifications")
    document = sa_relationship("Document", back_populates="notifications")
    asset = sa_relationship("Asset")


class ReminderSetting(Base):
    __tablename__ = "reminder_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    intervals_json = Column(String(100), default="[30, 7, 1, 0]", nullable=False)
    email_enabled = Column(Boolean, default=False, nullable=False)
    created_at = Column(UTCDateTime, default=utc_now, nullable=False)
    updated_at = Column(UTCDateTime, default=utc_now, nullable=False)

    user = sa_relationship("User", back_populates="reminder_setting")


