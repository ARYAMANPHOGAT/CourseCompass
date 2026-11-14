"""Shared route helpers."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from ..analytics import enrollment_status, progress_percent
from ..recommender.engine import course_summary
from ..services import AppServices


class APIError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail={"code": code, "message": message})


def services(request: Request) -> AppServices:
    return request.app.state.services


def require_course(svc: AppServices, course_id: str) -> dict[str, Any]:
    course = svc.catalog.get(course_id)
    if course is None:
        raise APIError(404, "course_not_found", f"No course with id '{course_id}' exists in the catalog.")
    return course


def serialize_enrollment(svc: AppServices, enrollment: dict[str, Any], sessions: list[dict[str, Any]]) -> dict[str, Any]:
    cid = enrollment["course_id"]
    own = [s for s in sessions if s["course_id"] == cid]
    minutes = sum(int(s["minutes"]) for s in own)
    course = svc.catalog.get(cid)
    total = int(enrollment.get("total_lessons") or 0)
    completed = total if enrollment.get("state") == "completed" else int(enrollment.get("completed_lessons") or 0)
    return {
        **{k: enrollment.get(k) for k in ("course_id", "enrolled_at", "state", "lessons_source", "target_date",
                                           "completed_at", "paused_at", "updated_at")},
        "completed_lessons": completed,
        "total_lessons": total,
        "demo": bool(enrollment.get("demo")),
        "status": enrollment_status(enrollment, minutes),
        "progress": {
            "completed_lessons": completed,
            "total_lessons": total,
            "percent": progress_percent(enrollment),
            "minutes": minutes,
            "sessions": len(own),
            "last_studied": max((s["date"] for s in own), default=None),
        },
        "course": course_summary(course) if course else None,
    }
