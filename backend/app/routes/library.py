"""Wishlist and relevance-feedback endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response, status

from ..recommender.engine import course_summary
from ..schemas import Feedback, FeedbackIn, WishlistAdd, WishlistEntry
from ..services import AppServices
from .deps import APIError, require_course, services

router = APIRouter(tags=["wishlist & feedback"])


@router.get("/wishlist", response_model=list[WishlistEntry], summary="Saved courses")
def get_wishlist(svc: AppServices = Depends(services)) -> list[dict[str, Any]]:
    out = []
    for item in svc.repo.list_wishlist():
        course = svc.catalog.get(item["course_id"])
        out.append({**item, "course": course_summary(course) if course else None})
    return out


@router.post("/wishlist", response_model=WishlistEntry, status_code=status.HTTP_201_CREATED, summary="Save a course")
def add_wishlist(body: WishlistAdd, svc: AppServices = Depends(services)) -> dict[str, Any]:
    course = require_course(svc, body.course_id)
    entry = svc.repo.add_wishlist(body.course_id, body.note)
    return {**entry, "course": course_summary(course)}


@router.delete("/wishlist/{course_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove a saved course")
def remove_wishlist(course_id: str, svc: AppServices = Depends(services)) -> Response:
    if not svc.repo.remove_wishlist(course_id):
        raise APIError(404, "not_in_wishlist", "That course is not in your wishlist.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/feedback", response_model=list[Feedback], summary="All relevance feedback and ratings")
def get_feedback(svc: AppServices = Depends(services)) -> list[dict[str, Any]]:
    return list(svc.repo.list_feedback().values())


@router.post("/feedback", response_model=Feedback, summary="Mark relevant / irrelevant / previously studied, or rate 1-5")
def post_feedback(body: FeedbackIn, svc: AppServices = Depends(services)) -> dict[str, Any]:
    require_course(svc, body.course_id)
    return svc.repo.set_feedback(body.course_id, body.kind, body.rating)


@router.delete("/feedback/{course_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Clear feedback for a course")
def delete_feedback(course_id: str, svc: AppServices = Depends(services)) -> Response:
    if not svc.repo.clear_feedback(course_id):
        raise APIError(404, "no_feedback", "No feedback recorded for that course.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
