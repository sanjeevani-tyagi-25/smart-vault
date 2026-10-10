from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_sqlite_schema():
    """Ensures backwards compatibility by adding any columns introduced after table creation."""
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            for col_sql in [
                "ALTER TABLE documents ADD COLUMN is_emergency_shareable BOOLEAN DEFAULT 1",
                "ALTER TABLE documents ADD COLUMN issue_date VARCHAR(20)",
                "ALTER TABLE documents ADD COLUMN expiry_date VARCHAR(20)",
            ]:
                try:
                    conn.execute(text(col_sql))
                    conn.commit()
                except Exception:
                    pass


def get_db():
    """Dependency that yields a database session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
