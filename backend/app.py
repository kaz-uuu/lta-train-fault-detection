"""FastAPI service behind the PS3 workbench.

    uvicorn backend.app:app --reload

The routes under /api/ps3 check uploaded files, run each subsystem's model and package the
prediction files. OpenAPI at /docs.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend import schemas as S
from backend.model_registry import Predictor
from backend.workbench import Workbench, create_router

# the Vite dev server
CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def create_app(models: Predictor | None = None) -> FastAPI:
    app = FastAPI(
        title="Train condition monitoring",
        version="1.0.0",
        description=(
            "Workbench API for NEBULA X PS3: upload a subsystem's data, see what the checks and "
            "the model make of it, and download the prediction files."
        ),
    )
    app.state.bench = Workbench(models=models)
    app.include_router(create_router(app.state.bench))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(CORS_ORIGINS),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(KeyError)
    async def not_found(_: Request, exc: KeyError):
        return JSONResponse(status_code=404, content={"detail": f"not found: {exc.args[0]}"})

    @app.exception_handler(ValueError)
    async def bad_request(_: Request, exc: ValueError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.get("/api/health", response_model=S.Health, tags=["system"])
    def health():
        return S.Health()

    return app


_app: FastAPI | None = None


def __getattr__(name: str):
    """`uvicorn backend.app:app` builds the app on first access, not at import."""
    global _app
    if name == "app":
        if _app is None:
            _app = create_app()
        return _app
    raise AttributeError(name)
