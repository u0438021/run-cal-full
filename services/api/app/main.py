from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, imports

app = FastAPI(title="Running Data Analytics API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
app.include_router(imports.router, prefix="/v1", tags=["imports"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

