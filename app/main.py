from fastapi import FastAPI, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import engine, Base, ensure_sqlite_schema
from app.routers import auth, assets, documents, dashboard, search, nominees, audit

# Create database tables automatically & migrate columns if needed
Base.metadata.create_all(bind=engine)
ensure_sqlite_schema()

app = FastAPI(
    title="Smart Vault API",
    description="Family document autopilot for Indian households with AES-256 encryption & AI extraction.",
    version="1.0.0",
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
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
