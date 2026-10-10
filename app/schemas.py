from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Annotated
from pydantic import BaseModel, Field, ConfigDict, AfterValidator


def ensure_utc_datetime(v: datetime) -> datetime:
    if v is None:
        return v
    if v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v.astimezone(timezone.utc)


UTCDateTime = Annotated[datetime, AfterValidator(ensure_utc_datetime)]


# --- Auth Schemas ---
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=6, max_length=100)


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Asset Schemas ---
class AssetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    type: str = Field(..., pattern="^(vehicle|property|person|other)$")


class AssetOut(BaseModel):
    id: int
    user_id: int
    name: str
    type: str
    created_at: UTCDateTime
    document_count: int = 0
    missing_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# --- Document Schemas ---
class DocumentOut(BaseModel):
    id: int
    asset_id: int
    user_id: int
    doc_type: str
    title: str
    original_filename: str
    mime_type: str
    fields: Optional[Dict[str, Any]] = None
    raw_text: Optional[str] = None
    confidence: Optional[Dict[str, Any]] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    is_emergency_shareable: bool = True
    created_at: UTCDateTime
    asset_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    asset_id: Optional[int] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    is_emergency_shareable: Optional[bool] = None
    fields_json: Optional[str] = None
    fields: Optional[Dict[str, Any]] = None
    confidence_json: Optional[str] = None
    raw_text: Optional[str] = None



class AssetDetailOut(BaseModel):
    id: int
    user_id: int
    name: str
    type: str
    created_at: UTCDateTime
    documents: List[DocumentOut] = []
    checklist: List[Dict[str, Any]] = []
    missing_docs: List[Dict[str, Any]] = []

    model_config = ConfigDict(from_attributes=True)


# --- Nominee & Access Request Schemas ---
class NomineeCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=3, max_length=150)
    relationship: str = Field(..., min_length=2, max_length=50)


class NomineeOut(BaseModel):
    id: int
    owner_id: int
    name: str
    email: str
    relationship: str
    status: str
    created_at: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


class AccessRequestOut(BaseModel):
    id: int
    owner_id: int
    nominee_id: int
    nominee_name: Optional[str] = None
    nominee_relationship: Optional[str] = None
    status: str
    requested_at: UTCDateTime
    unlocks_at: UTCDateTime
    resolved_at: Optional[UTCDateTime] = None
    seconds_remaining: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


# --- Audit Log Schemas ---
class AuditLogOut(BaseModel):
    id: int
    owner_id: int
    actor_name: str
    action: str
    target: str
    timestamp: UTCDateTime

    model_config = ConfigDict(from_attributes=True)


# --- Notification & Reminder Schemas ---
class NotificationOut(BaseModel):
    id: int
    user_id: int
    document_id: Optional[int] = None
    asset_id: Optional[int] = None
    asset_name: Optional[str] = None
    document_title: Optional[str] = None
    title: str
    message: str
    severity: str
    days_left: int
    interval_days: int
    state: str
    is_read: bool
    is_dismissed: bool
    expiry_date: Optional[str] = None
    created_at: datetime
    read_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ReminderSettingOut(BaseModel):
    user_id: int
    intervals: List[int]
    email_enabled: bool

    model_config = ConfigDict(from_attributes=True)


class ReminderSettingUpdate(BaseModel):
    intervals: List[int]
    email_enabled: Optional[bool] = False


class DocumentRenew(BaseModel):
    new_expiry_date: str
    notes: Optional[str] = None


