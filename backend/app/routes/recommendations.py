"""Personalised recommendations and per-course explanations."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query

from ..schemas import RecommendationResponse
from ..services import AppServices
from ..storage import DEFAULT_PROFILE
from ..taxonomy import CAREER_BY_ID
from .deps import APIError, require_course, services

router = APIRouter(tags=["recommendations"])


@router.get("/recommendations", response_model=RecommendationResponse, summary="Ranked personalised recommendations")
def recommendations(
    mode: Literal["hybrid", "content"] = "hybrid",
    limit: int = Query(12, ge=1, le=50),
    offset: int = Query(0, ge=0, le=500),
    include_enrolled: bool = False,
    svc: AppServices = Depends(services),
) -> dict[str, Any]:
    return svc.recommender.recommend(svc.repo.snapshot(), mode, limit, include_enrolled, offset)


@router.get("/recommendations/preview", response_model=RecommendationResponse,
            summary="Landing-page preview for a career goal (does not change the saved profile)")
def preview(
    career_goal: str = Query(..., min_length=1, max_length=60),
    limit: int = Query(3, ge=1, le=12),
    svc: AppServices = Depends(services),
) -> dict[str, Any]:
    if career_goal not in CAREER_BY_ID:
        raise APIError(404, "unknown_career_goal", f"Unknown career goal '{career_goal}'.")
    snapshot = svc.repo.snapshot()
    profile = {**DEFAULT_PROFILE, "career_goal": career_goal, "onboarded": True}
    preview_snapshot = {**snapshot, "profile": profile, "wishlist": [], "enrollments": {}, "feedback": {}}
    return svc.recommender.recommend(preview_snapshot, "content", limit)


@router.get("/recommendations/explain/{course_id}", summary="Why a course ranked where it did (incl. gap to #1)")
def explain(course_id: str, mode: Literal["hybrid", "content"] = "hybrid", svc: AppServices = Depends(services)) -> dict[str, Any]:
    require_course(svc, course_id)
    return svc.recommender.explain(svc.repo.snapshot(), course_id, mode)
