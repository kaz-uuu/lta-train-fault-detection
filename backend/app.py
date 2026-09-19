"""FastAPI service behind the PS3 workbench.

    uvicorn backend.app:app --reload

The routes under /api/ps3 check uploaded files, run each subsystem's model and package the
prediction files. OpenAPI at /docs.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend import schemas as S
from backend.assistant import create_assistant_router
from backend.model_registry import Predictor
from backend.workbench import Workbench, create_router

# the Vite dev server
CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")


def create_app(models: Predictor | None = None) -> FastAPI:
    app = FastAPI(
        title="Train condition monitoring",
        version="1.0.0",
        description=(
            "Upload a subsystem's recorded data, validate it, run the subsystem's fault-detection "
            "model and download the predictions."
        ),
    )
    app.state.bench = Workbench(models=models)
    app.include_router(create_router(app.state.bench))
    app.include_router(create_assistant_router(app.state.bench))

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

    static_dir = Path(os.getenv("TFD_STATIC_DIR", "frontend/dist"))
    if static_dir.is_dir():
        assets = static_dir / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="frontend-assets")

        @app.get("/", include_in_schema=False)
        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str = ""):
            """Serve the built React application and its client-side routes."""
            candidate = (static_dir / path).resolve()
            if static_dir.resolve() in candidate.parents and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(static_dir / "index.html")

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
