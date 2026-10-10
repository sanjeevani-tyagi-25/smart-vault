import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS
from app.database import engine, Base, ensure_sqlite_schema, SessionLocal
from app.routers import auth, assets, documents, dashboard, search, nominees, audit, notifications
from app.notifications import run_scheduled_notifications_check

# Create database tables automatically & migrate columns if needed
Base.metadata.create_all(bind=engine)
ensure_sqlite_schema()


async def background_expiry_scheduler():
    """Background task running continuously to check document expiries and create smart reminders."""
    # Brief pause after startup to allow server to be fully ready
    await asyncio.sleep(2)
    while True:
        try:
            db = SessionLocal()
            try:
                run_scheduled_notifications_check(db)
            finally:
                db.close()
        except Exception as err:
            print(f"[SmartVault Scheduler] Error running expiry checks: {err}")
        # Run periodically (e.g. every 1 hour)
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables & start background notification worker
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema()
    scheduler_task = asyncio.create_task(background_expiry_scheduler())
    yield
    # Shutdown
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Smart Vault API",
    description="Family document autopilot for Indian households with AES-256 encryption & AI extraction.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Next.js frontend (allowing configurable origins and local dev ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Exception handler for standardized errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=exc.headers or {},
        )
    # Do not leak secrets or internals in response
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred.", "error_type": type(exc).__name__},
    )

# Include API routers
app.include_router(auth.router)
app.include_router(assets.router)
app.include_router(documents.router)
app.include_router(dashboard.router)
app.include_router(search.router)
app.include_router(nominees.router)
app.include_router(audit.router)
app.include_router(notifications.router)


@app.get("/")
def root():
    return {
        "app": "Smart Vault API",
        "status": "online",
        "encryption": "AES-256-GCM",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "healthy"}
