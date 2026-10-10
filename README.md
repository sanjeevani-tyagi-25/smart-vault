# Smart Vault — AI-Powered Family Document & Asset Management System

> **A Family Document Autopilot for Indian Households**  
> Move from passively storing documents to active intelligence: connect documents to real-world assets, track expirations, detect missing critical records, search with source citations, and securely share with trusted nominees during emergencies.

---

## 🌟 Why Smart Vault? (Innovation & Differentiation)

Traditional cloud lockers and government vaults (like DigiLocker or Google Drive) have major gaps:
1. **Scattered & Disorganized**: Files sit in unstructured folders or downloads. Smart Vault groups all documents around **physical & real-world ASSETS** (e.g. `Honda City` [Vehicle], `Flat 302` [Property], `Self` [Person]).
2. **Missed Expirations**: PUCs, insurance policies, and rental agreements expire unnoticed. Smart Vault automatically extracts dates via AI, computes urgency, and provides direct renewal links.
3. **Missing-Document Gaps**: People only discover a missing RC, PUC, or sale deed when pulled over by police or applying for a mortgage. Smart Vault runs an automated **Missing-Document Detector** against asset-specific checklists.
4. **Emergency Deadlock**: In unexpected medical emergencies or accidents, families are locked out of critical health insurance cards or deeds. Smart Vault provides **Emergency Nominee Access** with timed countdowns, owner veto controls, and a tamper-evident audit trail.

---

## 🛠️ Technology Stack

- **Backend**: FastAPI (Python 3.12+), SQLAlchemy 2.0 ORM, SQLite (`vault.db`), Pydantic v2
- **Encryption & Security**: AES-256-GCM encryption at rest with fresh 96-bit random nonces, key loaded from `VAULT_KEY` environment variable. Zero secrets or raw files ever exposed.
- **Authentication**: JWT access tokens (HS256) with bcrypt password hashing. Complete user isolation enforced at the database query layer.
- **AI Intelligence**: Google Gemini API via `google-genai` SDK + deterministic Mock AI provider (`AI_MOCK=true`) supporting English, Hindi, and mixed-language documents.
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide React icons, mobile-first responsive layout (390px mobile viewport).

---

## 🚀 Quickstart & Windows PowerShell Run Commands

### 1. Clone & Environment Setup

Open **Windows PowerShell** in the project root:

```powershell
# Navigate to project root
cd C:\Users\SANJEEVANI\.gemini\antigravity-ide\scratch\smart-vault

# Create and activate Python virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install backend dependencies
pip install -r requirements.txt
```

### 2. Configure Environment (`.env`)

Copy `.env.example` to `.env` if not already present:

```powershell
Copy-Item .env.example .env
```

Key environment settings in `.env`:
```ini
DATABASE_URL=sqlite:///./vault.db
VAULT_KEY=smartvault-aes256-secret-key-32b!
JWT_SECRET=smartvault-jwt-super-secret-key-2026
AI_MOCK=true
GEMINI_API_KEY=your_gemini_api_key_here
AI_MODEL=gemini-2.5-flash
ACCESS_WAIT_SECONDS=60
STORAGE_PATH=./storage
TEMP_PATH=./storage/temp
```

### 3. Seed Demo Data

Run the idempotent database seeder to create sample assets, documents, nominees, and audit logs:

```powershell
python scripts/seed.py
```

**Demo Account Credentials**:
- **Email**: `demo@smartvault.app`
- **Password**: `demo1234`

### 4. Start the FastAPI Backend Server

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- API Root: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- Interactive API Docs (Swagger UI): [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 5. Start the Next.js Frontend

In a separate PowerShell terminal:

```powershell
cd frontend
npm install
npm run dev
```
- Web Application: [http://localhost:3000](http://localhost:3000)

---

## 🧪 Running Automated Tests

Run the full pytest suite covering authentication, encryption roundtrips, AI extraction sanitizers, checklist detection, readiness scores, and nominee emergency flows:

```powershell
pytest -v
```

---

## 🎭 Step-by-Step Live Demo Script (Hackathon Walkthrough)

Follow this 5-minute script to demonstrate all P0 and P1 capabilities:

### Step 1: Login & Dashboard Overview
1. Open [http://localhost:3000](http://localhost:3000).
2. Click **"1-Click Fill"** to populate demo credentials (`demo@smartvault.app` / `demo1234`) and click **Sign In**.
3. **Show Dashboard**:
   - **Readiness Score Ring**: Highlights overall family readiness (Completeness + Expiry Health + Nominee Setup).
   - **Next Best Actions**: Shows dynamically calculated point improvements (e.g., *"Upload PUC for Honda City (+6 points)"*).
   - **Expiry Alerts**: Color-coded badges with direct renewal links (PolicyBazaar for insurance, Parivahan for vehicle docs).

### Step 2: Asset Inspection & Missing-Document Detector
1. Click on **Honda City (Vehicle)**.
2. Observe the **Asset Checklist**:
   - `RC` -> Verified & Present
   - `Insurance` -> Present (Expiring in 12 days)
   - `PUC` -> **Missing** (Highlighted in amber)
   - `Driving License` -> **Missing**

### Step 3: AI Document Extraction & Confirmation Flow
1. Click **"Upload Document"** on Honda City.
2. Under "Quick Demo Sample Files", select **`puc_honda.jpg`** (or drag & drop `samples/puc_honda.jpg`).
3. Click **"Extract with AI"**.
4. Watch the simulated AI intelligence extract:
   - Document Type: `PUC` (99% confidence)
   - Certificate Number: `DL01004820250012`
   - Expiry Date: Dynamically calculated to 25 days from today
   - Confidence chips: Color-coded green/amber per field
5. Review & edit the fields on the **Confirm Screen**, then click **"Confirm & Save to Vault"**.
6. The file is AES-256 encrypted and stored on disk.
7. Return to Honda City: Notice that **PUC is now checked off**, and the missing count drops!

### Step 4: Natural-Language Vault Search
1. Return to the **Dashboard**.
2. Type into the AI Search bar:  
   `When does my car insurance expire?`  
   -> Returns exact answer with source citation (`HDFC ERGO Comprehensive Motor Insurance`, `expiry_date`).
3. Try asking:  
   `What documents are missing for Flat 302?`  
   -> Returns missing documents specifically for Flat 302.

### Step 5: Emergency Nominee Access & Owner Veto Flow
1. Navigate to **Nominee Access** (`/nominees`).
2. Observe active nominee: **Priya Sharma (Spouse)**.
3. Click **"Simulate Emergency Access Request"**.
4. A live **60-second countdown** begins on the owner's screen with an alert banner and a prominent **Veto** button.
5. Demonstrate the **Veto** action or allow the countdown to expire.
6. Once unlocked, click **"Demo: Switch to Nominee View"**:
   - Nominee sees a clean, read-only portal with **only emergency-shareable documents** (Insurance, RC, Aadhaar, Registry).
   - Owner controls and non-shareable documents remain locked.

### Step 6: Security Audit Trail
1. Navigate to **Audit Log** (`/audit`).
2. Inspect the tamper-evident log capturing:
   - Document uploads & AES-256 encryption
   - Decryption downloads
   - Emergency access requests, countdowns, and approvals

---

## 🔒 Security & Privacy Guarantees

- **No Secrets Hardcoded**: All keys read from environment (`.env`).
- **AES-256-GCM at Rest**: Every document stored in `./storage` is encrypted with authenticated AES-256-GCM.
- **User Isolation**: Every database query filters by authenticated `current_user.id`.
- **No Hallucinated Verification**: Smart Vault clearly distinguishes AI field extraction from official government authenticity verification.

---

## 📁 Sample Test Files (`samples/`)

The repository includes synthetic sample files in `samples/` for testing:
- `insurance_honda.jpg`: Private car insurance (expires in 12 days)
- `puc_honda.jpg`: Pollution certificate (expires in 25 days)
- `rc_honda.jpg`: Registration certificate (RC)
- `electricity_flat302.jpg`: BSES electricity bill
- `hindi_insurance.jpg`: Hindi motor insurance policy (`language: "hi"`)
- `aadhaar_self.jpg`: Synthetic Aadhaar card with masked ID
- `rent_agreement.pdf`: Residential lease agreement
