"""Demo profile and preference endpoints (no authentication: single local profile)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..schemas import ConfirmBody, ProfileUpdate, StudentProfile
from ..services import AppServices
from .deps import APIError, services

router = APIRouter(tags=["profile"])


@router.get("/profile", response_model=StudentProfile, summary="Get the local demo profile")
def get_profile(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return svc.repo.get_profile()


@router.put("/profile", response_model=StudentProfile, summary="Save onboarding preferences")
def put_profile(body: ProfileUpdate, svc: AppServices = Depends(services)) -> dict[str, Any]:
    categories = set(svc.catalog.categories())
    unknown_topics = [t for t in body.topics if t not in categories]
    if unknown_topics:
        raise APIError(422, "unknown_topics", f"Unknown topics: {', '.join(unknown_topics)}")
    languages = set(svc.catalog.languages())
    unknown_langs = [lang for lang in body.languages if lang not in languages]
    if unknown_langs:
        raise APIError(422, "unknown_languages", f"Unknown languages: {', '.join(unknown_langs)}")
    data = body.model_dump()
    data["topics"] = sorted(set(body.topics))
    return svc.repo.save_profile(data)


@router.post("/profile/reset", response_model=StudentProfile, summary="Reset preferences to defaults (requires confirm)")
def reset_profile(body: ConfirmBody, svc: AppServices = Depends(services)) -> dict[str, Any]:
    if not body.confirm:
        raise APIError(400, "confirmation_required", "Set confirm=true to reset preferences.")
    return svc.repo.reset_profile()
