from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


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
    created_at: datetime

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
    created_at: datetime
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
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssetDetailOut(BaseModel):
    id: int
    user_id: int
    name: str
    type: str
    created_at: datetime
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
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AccessRequestOut(BaseModel):
    id: int
    owner_id: int
    nominee_id: int
    nominee_name: Optional[str] = None
    nominee_relationship: Optional[str] = None
    status: str
    requested_at: datetime
    unlocks_at: datetime
    resolved_at: Optional[datetime] = None
    seconds_remaining: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


# --- Audit Log Schemas ---
class AuditLogOut(BaseModel):
    id: int
    owner_id: int
    actor_name: str
    action: str
    target: str
    timestamp: datetime

    model_config = ConfigDict(from_attributes=True)
