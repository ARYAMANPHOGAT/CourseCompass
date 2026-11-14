"""FastAPI application factory.

Start locally (from the backend folder):
    python -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000
Interactive API docs:                       http://127.0.0.1:8000/docs
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import __version__
from .config import Settings
from .routes import courses, insights, learning, library, profile, recommendations
from .services import AppServices

logger = logging.getLogger("coursecompass")

API_PREFIX = "/api"


def _error(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)


def create_app(settings: Settings | None = None, services: AppServices | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    svc = services or AppServices(settings)
    app = FastAPI(
        title="CourseCompass AI API",
        version=__version__,
        description=(
            "Local API for the CourseCompass AI course recommender. Single demo profile, JSON-file "
            "storage, no authentication. Collaborative filtering uses a clearly labelled synthetic cohort."
        ),
    )
    app.state.services = svc
    app.add_middleware(
        CORSMiddleware,
        allow_origins=svc.settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return _error(exc.status_code, exc.detail["code"], exc.detail["message"])
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return _error(exc.status_code, code, str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
            details.append({"field": loc or None, "message": err.get("msg", "invalid value")})
        message = "; ".join(f"{d['field']}: {d['message']}" if d["field"] else d["message"] for d in details[:3])
        return _error(422, "validation_error", message or "Invalid request.", details)

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:  # pragma: no cover - defensive
        logger.exception("Unhandled error: %s", exc.__class__.__name__)
        return _error(500, "internal_error", "Something went wrong on the server. Check the backend terminal for details.")

    for router in (courses.router, recommendations.router, profile.router, library.router, learning.router, insights.router):
        app.include_router(router, prefix=API_PREFIX)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {"name": "CourseCompass AI API", "docs": "/docs", "health": f"{API_PREFIX}/health"}

    return app

