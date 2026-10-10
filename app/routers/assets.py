import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Asset, Document
from app.schemas import AssetCreate, AssetOut, AssetDetailOut, DocumentOut
from app.auth import get_current_user
from app.checklist import get_checklist_for_asset, get_missing_for_asset

router = APIRouter(prefix="/assets", tags=["Assets"])


def serialize_doc(doc: Document) -> DocumentOut:
    fields = json.loads(doc.fields_json) if doc.fields_json else None
    confidence = json.loads(doc.confidence_json) if doc.confidence_json else None
    return DocumentOut(
        id=doc.id,
        asset_id=doc.asset_id,
        user_id=doc.user_id,
        doc_type=doc.doc_type,
        title=doc.title,
        original_filename=doc.original_filename,
        mime_type=doc.mime_type,
        fields=fields,
        raw_text=doc.raw_text,
        confidence=confidence,
        issue_date=doc.issue_date,
        expiry_date=doc.expiry_date,
        is_emergency_shareable=getattr(doc, "is_emergency_shareable", True),
        created_at=doc.created_at,
        asset_name=doc.asset.name if getattr(doc, "asset", None) else None,
    )


@router.get("", response_model=List[AssetOut])
def list_assets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all assets for the authenticated user with document counts and missing counts."""
    assets = db.query(Asset).filter(Asset.user_id == current_user.id).order_by(Asset.created_at.desc()).all()
    results = []
    for asset in assets:
        doc_types = {d.doc_type for d in asset.documents}
        missing = get_missing_for_asset(asset.type, doc_types)
        results.append(
            AssetOut(
                id=asset.id,
                user_id=asset.user_id,
                name=asset.name,
                type=asset.type,
                created_at=asset.created_at,
                document_count=len(asset.documents),
                missing_count=len(missing),
            )
        )
    return results


from pathlib import Path
from app.audit import log_audit


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    asset_in: AssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new asset (e.g. Honda City, Flat 302, Self)."""
    cleaned_name = asset_in.name.strip()
    if not cleaned_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset name cannot be empty.",
        )
    allowed_types = {"vehicle", "property", "person", "other"}
    asset_type = asset_in.type.lower().strip()
    if asset_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid asset category '{asset_in.type}'. Allowed: vehicle, property, person, other.",
        )

    asset = Asset(
        user_id=current_user.id,
        name=cleaned_name,
        type=asset_type,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="ASSET_CREATE",
        target=f"{asset.name} ({asset.type})",
    )

    missing = get_missing_for_asset(asset.type, set())
    return AssetOut(
        id=asset.id,
        user_id=asset.user_id,
        name=asset.name,
        type=asset.type,
        created_at=asset.created_at,
        document_count=0,
        missing_count=len(missing),
    )


@router.get("/{asset_id}", response_model=AssetDetailOut)
def get_asset_detail(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get asset details including document list, full checklist, and missing documents."""
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    present_doc_types = {d.doc_type for d in asset.documents}
    checklist = get_checklist_for_asset(asset.type, present_doc_types)
    missing = get_missing_for_asset(asset.type, present_doc_types)

    doc_out_list = [serialize_doc(d) for d in asset.documents]

    return AssetDetailOut(
        id=asset.id,
        user_id=asset.user_id,
        name=asset.name,
        type=asset.type,
        created_at=asset.created_at,
        documents=doc_out_list,
        checklist=checklist,
        missing_docs=missing,
    )


@router.delete("/{asset_id}")
def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an asset and all its associated documents, wiping encrypted files from disk."""
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.user_id == current_user.id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    # Wipe all encrypted files belonging to this asset's documents from disk
    for doc in asset.documents:
        try:
            Path(doc.file_path).unlink(missing_ok=True)
        except Exception:
            pass

    asset_name = asset.name
    asset_type = asset.type

    db.delete(asset)
    db.commit()

    log_audit(
        db=db,
        owner_id=current_user.id,
        actor_name=current_user.name,
        action="ASSET_DELETE",
        target=f"{asset_name} ({asset_type})",
    )

    return {"detail": "Asset deleted successfully", "asset_id": asset_id}

