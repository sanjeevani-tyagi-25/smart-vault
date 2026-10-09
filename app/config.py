import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from smart-vault root
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./vault.db")
VAULT_KEY = os.getenv("VAULT_KEY", "smartvault-aes256-secret-key-32b!")

JWT_SECRET = os.getenv("JWT_SECRET", "smartvault-jwt-super-secret-key-2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

AI_MOCK = os.getenv("AI_MOCK", "true").lower() in ("true", "1", "yes")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gemini-2.5-flash")
AI_TIMEOUT_SECONDS = int(os.getenv("AI_TIMEOUT_SECONDS", "30"))

ACCESS_WAIT_SECONDS = int(os.getenv("ACCESS_WAIT_SECONDS", "60"))

STORAGE_PATH = Path(os.getenv("STORAGE_PATH", str(BASE_DIR / "storage")))
TEMP_PATH = Path(os.getenv("TEMP_PATH", str(STORAGE_PATH / "temp")))

# Ensure storage directories exist
STORAGE_PATH.mkdir(parents=True, exist_ok=True)
TEMP_PATH.mkdir(parents=True, exist_ok=True)

ENABLE_RESEND_EMAIL = os.getenv("ENABLE_RESEND_EMAIL", "false").lower() in ("true", "1", "yes")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
