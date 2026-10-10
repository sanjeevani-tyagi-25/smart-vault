import json
import os
import uuid
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Response
from sqlalchemy.orm import Session

from app.config import STORAGE_PATH, TEMP_PATH
from app.database import get_db
from app.models import User, Asset, Document, utc_now
from app.schemas import DocumentOut, DocumentUpdate
from app.auth import get_current_user
from app.crypto import encrypt_bytes, decrypt_bytes
from app.audit import log_audit
from app.routers.assets import serialize_doc
from app.ai.factory import get_ai_provider
from app.ai.prompts import EMPTY_EDITABLE_TEMPLATE

router = APIRouter(prefix="/documents", tags=["Documents"])

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/extract")
async def extract_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Extract structured fields, confidence scores, and OCR text from an uploaded document image or PDF.
    Validates file format (jpg, png, webp, pdf) and size (max 10MB).
    Does NOT save to the database.
    """
    # 1. Validate MIME type
    mime_type = file.content_type or "application/octet-stream"
    filename = file.filename or "uploaded_document"
    ext = Path(filename).suffix.lower()

    valid_ext = ext in (".jpg", ".jpeg", ".png", ".webp", ".pdf")
    valid_mime = mime_type in ALLOWED_MIME_TYPES or mime_type.startswith("image/")

    if not (valid_ext or valid_mime):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: JPG, PNG, WEBP, PDF.",
        )

    # 2. Read file and validate size
    try:
        content = await file.read()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read uploaded file.")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of 10 MB (received {len(content) / (1024 * 1024):.1f} MB).",
        )

    # 3. Cache in temp directory for the save step
    temp_token = uuid.uuid4().hex
    temp_file_path = TEMP_PATH / f"{temp_token}.tmp"
    meta_file_path = TEMP_PATH / f"{temp_token}.json"

    try:
        temp_file_path.write_bytes(content)
        meta_file_path.write_text(
            json.dumps({"filename": filename, "mime_type": mime_type}),
            encoding="utf-8",
        )
    except Exception:
        pass

    # 4. Perform extraction with AI Provider
    provider = get_ai_provider()
    try:
        result = await provider.extract_document(
            file_bytes=content,
            mime_type=mime_type,
            filename=filename,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as err:
        # Return explicitly identified fallback template so user is never blocked
        fallback = EMPTY_EDITABLE_TEMPLATE.copy()
        fallback["title"] = filename
        fallback["temp_file_token"] = temp_token
        fallback["raw_text"] = ""
        fallback["note"] = f"Extraction fallback: {err}"
        return fallback

    # Attach temp_file_token to response for seamless client saving
    result["temp_file_token"] = temp_token
    return result


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def create_document(
    asset_id: int = Form(...),
    doc_type: str = Form(...),
    title: str = Form(...),
    file: Optional[UploadFile] = File(None),
    temp_file_token: Optional[str] = Form(None),
    fields_json: Optional[str] = Form(None),
    raw_text: Optional[str] = Form(None),
    confidence_json: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    is_emergency_shareable: Optional[bool] = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save confirmed document with AES-256 encrypted file storage.
    Accepts either an uploaded file or a temp_file_token from extraction.
    """
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    file_bytes: bytes = b""
    filename: str = "document.pdf"
    mime_type: str = "application/pdf"

    if file and file.filename:
        file_bytes = await file.read()
        filename = file.filename
        mime_type = file.content_type or "application/octet-stream"
    elif temp_file_token:
        # Check staged temp file from extract
        temp_file_path = TEMP_PATH / f"{temp_file_token}.tmp"
        meta_file_path = TEMP_PATH / f"{temp_file_token}.json"
        if temp_file_path.exists():
            file_bytes = temp_file_path.read_bytes()
            if meta_file_path.exists():
                try:
                    meta = json.loads(meta_file_path.read_text(encoding="utf-8"))
                    filename = meta.get("filename", filename)
                    mime_type = meta.get("mime_type", mime_type)
                except Exception:
                    pass
            # Clean up temp files
            try:
                temp_file_path.unlink(missing_ok=True)
                meta_file_path.unlink(missing_ok=True)
            except Exception:
                pass
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Temporary file token expired or invalid. Please re-upload.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either a file upload or temp_file_token is required.",
        )

    # Encrypt file bytes with AES-256 GCM
    encrypted_payload = encrypt_bytes(file_bytes)
    storage_filename = f"{uuid.uuid4().hex}.enc"
    storage_file_path = STORAGE_PATH / storage_filename
    storage_file_path.write_bytes(encrypted_payload)

    # Clean dates
    cleaned_issue = issue_date.strip() if issue_date and issue_date.strip() not in ("null", "None", "") else None
    cleaned_expiry = expiry_date.strip() if expiry_date and expiry_date.strip() not in ("null", "None", "") else None

    # Save Document record
    document = Document(
        asset_id=asset.id,
        user_id=current_user.id,
        doc_type=doc_type.strip(),
        title=title.strip(),
        file_path=str(storage_file_path),
        original_filename=filename,
        mime_type=mime_type,
        fields_json=fields_json if fields_json else "{}",
        raw_text=raw_text or "",
        confidence_json=confidence_json if confidence_json else "{}",
        issue_date=cleaned_issue,
        expiry_date=cleaned_expiry,
        is_emergency_shareable=bool(is_emergency_shareable),
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="DOCUMENT_UPLOAD",
        target=f"{document.title} ({asset.name})",
    )

    if document.expiry_date:
        from app.notifications import check_and_create_notifications_for_document
        try:
            check_and_create_notifications_for_document(db, document)
        except Exception as e:
            print(f"[Notifications] Error creating reminder on upload: {e}")

    return serialize_doc(document)


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document_alias(
    asset_id: int = Form(...),
    doc_type: str = Form(...),
    title: str = Form(...),
    file: Optional[UploadFile] = File(None),
    temp_file_token: Optional[str] = Form(None),
    fields_json: Optional[str] = Form(None),
    raw_text: Optional[str] = Form(None),
    confidence_json: Optional[str] = Form(None),
    issue_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    is_emergency_shareable: Optional[bool] = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Alias for POST /documents for upload compatibility."""
    return await create_document(
        asset_id=asset_id,
        doc_type=doc_type,
        title=title,
        file=file,
        temp_file_token=temp_file_token,
        fields_json=fields_json,
        raw_text=raw_text,
        confidence_json=confidence_json,
        issue_date=issue_date,
        expiry_date=expiry_date,
        is_emergency_shareable=is_emergency_shareable,
        current_user=current_user,
        db=db,
    )


@router.get("", response_model=List[DocumentOut])
def list_documents(
    asset_id: Optional[int] = None,
    doc_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List documents for the authenticated user, optionally filtered by asset or doc_type."""
    query = db.query(Document).filter(Document.user_id == current_user.id)
    if asset_id is not None:
        query = query.filter(Document.asset_id == asset_id)
    if doc_type:
        query = query.filter(Document.doc_type == doc_type)
    docs = query.order_by(Document.created_at.desc()).all()
    return [serialize_doc(d) for d in docs]


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: int,
    doc_update: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update document metadata (title, doc_type, expiry_date, issue_date, asset association, shareable status)."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if doc_update.asset_id is not None and doc_update.asset_id != doc.asset_id:
        target_asset = db.query(Asset).filter(Asset.id == doc_update.asset_id, Asset.user_id == current_user.id).first()
        if not target_asset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target asset not found")
        doc.asset_id = doc_update.asset_id

    if doc_update.title is not None:
        doc.title = doc_update.title.strip()
    if doc_update.doc_type is not None:
        doc.doc_type = doc_update.doc_type.strip()
    if doc_update.issue_date is not None:
        doc.issue_date = doc_update.issue_date.strip() if doc_update.issue_date.strip() not in ("null", "None", "") else None
    if doc_update.expiry_date is not None:
        doc.expiry_date = doc_update.expiry_date.strip() if doc_update.expiry_date.strip() not in ("null", "None", "") else None
    if doc_update.is_emergency_shareable is not None:
        doc.is_emergency_shareable = doc_update.is_emergency_shareable
    if doc_update.fields_json is not None:
        doc.fields_json = doc_update.fields_json
    elif doc_update.fields is not None:
        doc.fields_json = json.dumps(doc_update.fields)
    if doc_update.confidence_json is not None:
        doc.confidence_json = doc_update.confidence_json
    if doc_update.raw_text is not None:
        doc.raw_text = doc_update.raw_text

    db.commit()
    db.refresh(doc)

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="DOCUMENT_UPDATE",
        target=f"Updated metadata for {doc.title}",
    )

    from app.notifications import check_and_create_notifications_for_document
    try:
        check_and_create_notifications_for_document(db, doc)
    except Exception as e:
        print(f"[Notifications] Error updating reminders on document edit: {e}")

    return serialize_doc(doc)


@router.patch("/{document_id}/toggle-shareable", response_model=DocumentOut)
def toggle_shareable(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle is_emergency_shareable status on a document."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    doc.is_emergency_shareable = not doc.is_emergency_shareable
    db.commit()
    db.refresh(doc)
    return serialize_doc(doc)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve document metadata."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return serialize_doc(doc)


@router.get("/{document_id}/file")
def get_document_file(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Decrypts and streams document file.
    Logs decryption access in audit trail.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encrypted file not found on disk")

    encrypted_data = file_path.read_bytes()
    try:
        decrypted_data = decrypt_bytes(encrypted_data)
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Decryption failed")

    # Record access in Audit Log
    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="DOCUMENT_DOWNLOAD",
        target=f"{doc.title} ({doc.original_filename})",
    )

    return Response(
        content=decrypted_data,
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{doc.original_filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Content-Encrypted-At-Rest": "AES-256-GCM",
        },
    )


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a document and its encrypted blob from disk."""
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Delete disk file
    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    doc_title = doc.title
    db.delete(doc)
    db.commit()

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="DOCUMENT_DELETE",
        target=doc_title,
    )

    return {"detail": "Document successfully deleted", "document_id": document_id}


@router.post("/{document_id}/renew", response_model=DocumentOut)
async def renew_document(
    document_id: int,
    new_expiry_date: str = Form(...),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    fields_json: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Renew a document with confirmed new expiry date and optional renewed file upload.
    Preserves renewal history, updates encrypted file, refreshes reminders, and transitions previous alerts to 'renewed'.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    cleaned_new_expiry = new_expiry_date.strip()
    if not cleaned_new_expiry:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New expiry date is required for renewal.")

    # 1. Update renewal history in fields_json
    try:
        fields = json.loads(doc.fields_json) if doc.fields_json else {}
    except Exception:
        fields = {}

    history = fields.get("renewal_history", [])
    history.append({
        "previous_expiry_date": doc.expiry_date,
        "renewed_at": utc_now().isoformat(),
        "notes": notes,
        "previous_filename": doc.original_filename,
    })
    fields["renewal_history"] = history
    fields["previous_expiry_date"] = doc.expiry_date

    if fields_json:
        try:
            extra = json.loads(fields_json)
            fields.update(extra)
            fields["renewal_history"] = history
        except Exception:
            pass

    doc.fields_json = json.dumps(fields)

    # 2. If new file uploaded, encrypt and store new file
    if file and file.filename:
        new_content = await file.read()
        if len(new_content) > 0:
            encrypted_payload = encrypt_bytes(new_content)
            # Remove old file
            try:
                Path(doc.file_path).unlink(missing_ok=True)
            except Exception:
                pass

            new_storage_filename = f"{uuid.uuid4().hex}.enc"
            new_storage_path = STORAGE_PATH / new_storage_filename
            new_storage_path.write_bytes(encrypted_payload)

            doc.file_path = str(new_storage_path)
            doc.original_filename = file.filename
            doc.mime_type = file.content_type or doc.mime_type

    # 3. Transition reminders and update expiry date
    from app.notifications import handle_document_renewed
    handle_document_renewed(db, doc, cleaned_new_expiry)

    # 4. Log audit event
    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="DOCUMENT_RENEWAL",
        target=f"{doc.title} (extended to {cleaned_new_expiry})",
    )

    return serialize_doc(doc)

