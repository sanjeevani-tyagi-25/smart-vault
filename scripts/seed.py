"""
Seed script for Smart Vault demo.
Creates:
- Demo User: demo@smartvault.app / demo1234
- Assets: Honda City (vehicle), Flat 302 (property), Self (person)
- 7 Documents with varied expiries:
  * Honda City: RC (healthy), Insurance (expiring in 12 days) -> PUC & Driving License MISSING!
  * Flat 302: Registry (healthy), Electricity Bill (healthy), Property Tax Receipt (EXPIRED 40 days ago)
  * Self: Aadhaar (healthy), Health Insurance (expiring in 45 days)
- Active Nominee: Priya Sharma (Spouse)
- One past resolved AccessRequest (approved)
- Audit log entries
- Fully encrypted blobs on disk with AES-256 GCM
"""
import os
import sys
import uuid
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone

# Ensure UTF-8 stdout on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal, Base, engine, ensure_sqlite_schema
from app.models import User, Asset, Document, Nominee, AccessRequest, AuditLog
from app.auth import hash_password
from app.crypto import encrypt_bytes
from app.config import STORAGE_PATH


def seed_database():
    print("[*] Starting Smart Vault database seed...")
    STORAGE_PATH.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema()
    db = SessionLocal()

    today = datetime.now(timezone.utc).date()

    try:
        # 1. Clean existing demo user if present (idempotent)
        existing = db.query(User).filter(User.email == "demo@smartvault.app").first()
        if existing:
            print("  [-] Removing existing demo user data...")
            db.delete(existing)
            db.commit()

        # 2. Create demo user
        user = User(
            name="Aarav Sharma",
            email="demo@smartvault.app",
            password_hash=hash_password("demo1234"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"  [+] Created user: {user.name} ({user.email})")

        # 3. Create assets
        honda = Asset(user_id=user.id, name="Honda City", type="vehicle")
        flat = Asset(user_id=user.id, name="Flat 302", type="property")
        self_asset = Asset(user_id=user.id, name="Self", type="person")

        db.add_all([honda, flat, self_asset])
        db.commit()
        db.refresh(honda)
        db.refresh(flat)
        db.refresh(self_asset)
        print("  [+] Created assets: Honda City, Flat 302, Self")

        # Helper to create encrypted file and document record
        def add_doc(asset_id, doc_type, title, filename, fields, issue_dt, expiry_dt, emergency_share=True):
            enc_name = f"{uuid.uuid4().hex}.enc"
            enc_path = STORAGE_PATH / enc_name
            raw_payload = f"Encrypted Vault Document: {title}\nType: {doc_type}\nNumber: {fields.get('number')}\nHolder: {fields.get('holder_name')}".encode("utf-8")
            enc_bytes = encrypt_bytes(raw_payload)
            enc_path.write_bytes(enc_bytes)

            confidence = {
                "doc_type": 0.98,
                "number": 0.95,
                "holder_name": 0.96,
                "issue_date": 0.92 if issue_dt else 0.0,
                "expiry_date": 0.97 if expiry_dt else 0.0,
            }

            doc = Document(
                asset_id=asset_id,
                user_id=user.id,
                doc_type=doc_type,
                title=title,
                file_path=str(enc_path),
                original_filename=filename,
                mime_type="application/pdf",
                fields_json=json.dumps(fields),
                raw_text=raw_payload.decode("utf-8"),
                confidence_json=json.dumps(confidence),
                issue_date=issue_dt,
                expiry_date=expiry_dt,
                is_emergency_shareable=emergency_share,
            )
            db.add(doc)
            return doc

        # 4. Add Documents
        # Honda City: RC (healthy) & Insurance (expires in 12 days)
        rc_doc = add_doc(
            honda.id,
            "RC",
            "Certificate of Vehicle Registration (RC)",
            "rc_honda.pdf",
            {"number": "DL-01-AB-1234", "holder_name": "Aarav Sharma", "issuer": "Mall Road RTO Delhi"},
            "2021-04-15",
            "2036-04-14",
            emergency_share=True,
        )

        ins_exp = (today + timedelta(days=12)).isoformat()
        ins_doc = add_doc(
            honda.id,
            "Insurance",
            "HDFC ERGO Comprehensive Motor Insurance",
            "insurance_honda.pdf",
            {"number": "2311-2049-8812-00", "holder_name": "Aarav Sharma", "issuer": "HDFC ERGO General Insurance Co. Ltd."},
            (today - timedelta(days=353)).isoformat(),
            ins_exp,
            emergency_share=True,
        )

        # Flat 302: Registry (healthy), Electricity Bill (healthy), Property Tax Receipt (EXPIRED 40 days ago)
        reg_doc = add_doc(
            flat.id,
            "Registry",
            "Registered Sale Deed - Flat 302",
            "registry_flat302.pdf",
            {"number": "REG/SD/2020/4482", "holder_name": "Aarav Sharma", "issuer": "Sub-Registrar VII Saket"},
            "2020-11-19",
            None,
            emergency_share=True,
        )

        elec_doc = add_doc(
            flat.id,
            "Electricity Bill",
            "BSES Rajdhani Electricity Bill",
            "electricity_flat302.pdf",
            {"number": "CA-102938475", "holder_name": "Aarav Sharma", "issuer": "BSES Rajdhani Power Ltd"},
            (today - timedelta(days=10)).isoformat(),
            None,
            emergency_share=False,
        )

        tax_exp = (today - timedelta(days=40)).isoformat()
        tax_doc = add_doc(
            flat.id,
            "Property Tax Receipt",
            "MCD Property Tax Receipt 2024-25",
            "property_tax_mcd.pdf",
            {"number": "PT-2024-009182", "holder_name": "Aarav Sharma", "issuer": "Municipal Corporation of Delhi"},
            (today - timedelta(days=405)).isoformat(),
            tax_exp,
            emergency_share=False,
        )

        # Self: Aadhaar (healthy), Health Insurance (expires in 45 days)
        aadhaar_doc = add_doc(
            self_asset.id,
            "Aadhaar",
            "Government of India - Aadhaar Card",
            "aadhaar_self.pdf",
            {"number": "XXXX-XXXX-4819", "holder_name": "Aarav Sharma", "issuer": "UIDAI"},
            "2016-08-12",
            None,
            emergency_share=True,
        )

        health_exp = (today + timedelta(days=45)).isoformat()
        health_doc = add_doc(
            self_asset.id,
            "Health Insurance",
            "Star Health Family Optima Policy",
            "health_insurance.pdf",
            {"number": "P/120000/01/2025/004921", "holder_name": "Aarav Sharma", "issuer": "Star Health & Allied Insurance Co."},
            (today - timedelta(days=320)).isoformat(),
            health_exp,
            emergency_share=True,
        )

        db.commit()
        print("  [+] Created 7 documents (1 expired, 1 in 12 days, 1 in 45 days, 4 healthy)")

        # 5. Nominee setup
        nominee = Nominee(
            owner_id=user.id,
            name="Priya Sharma",
            email="priya.sharma@example.com",
            relationship="Spouse",
            status="active",
        )
        db.add(nominee)
        db.commit()
        db.refresh(nominee)
        print(f"  [+] Added active nominee: {nominee.name} ({nominee.relationship})")

        # 6. Past approved access request
        past_req = AccessRequest(
            owner_id=user.id,
            nominee_id=nominee.id,
            status="approved",
            requested_at=datetime.now(timezone.utc) - timedelta(days=3),
            unlocks_at=datetime.now(timezone.utc) - timedelta(days=3, seconds=-60),
            resolved_at=datetime.now(timezone.utc) - timedelta(days=3, seconds=-60),
        )
        db.add(past_req)
        db.commit()
        print("  [+] Created past emergency access record (approved)")

        # 7. Audit log entries
        audit_entries = [
            AuditLog(owner_id=user.id, actor_name=user.name, action="USER_REGISTER", target="Account created", timestamp=datetime.now(timezone.utc) - timedelta(days=10)),
            AuditLog(owner_id=user.id, actor_name=user.name, action="ASSET_CREATED", target="Honda City (vehicle)", timestamp=datetime.now(timezone.utc) - timedelta(days=10)),
            AuditLog(owner_id=user.id, actor_name=user.name, action="DOCUMENT_UPLOAD", target="HDFC ERGO Comprehensive Motor Insurance (Honda City)", timestamp=datetime.now(timezone.utc) - timedelta(days=9)),
            AuditLog(owner_id=user.id, actor_name=user.name, action="NOMINEE_ADDED", target="Priya Sharma (Spouse)", timestamp=datetime.now(timezone.utc) - timedelta(days=8)),
            AuditLog(owner_id=user.id, actor_name=nominee.name, action="REQUEST_EMERGENCY_ACCESS", target="Emergency countdown initiated", timestamp=datetime.now(timezone.utc) - timedelta(days=3)),
            AuditLog(owner_id=user.id, actor_name="System", action="EMERGENCY_ACCESS_APPROVED", target="Access auto-unlocked for nominee Priya Sharma", timestamp=datetime.now(timezone.utc) - timedelta(days=3, seconds=-60)),
        ]
        db.add_all(audit_entries)
        db.commit()
        print("  [+] Created initial audit log entries")

        print("\n[SUCCESS] Database seeded successfully!")
        print("   Demo Login:")
        print("   Email:    demo@smartvault.app")
        print("   Password: demo1234")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
