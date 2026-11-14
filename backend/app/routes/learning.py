"""My Learning: enrolments, progress, study sessions and weekly goals."""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query, Response, status

from ..schemas import EnrollIn, Enrollment, EnrollmentUpdate, GoalUpdate, LearningGoal, SessionIn, StudySession
from ..services import AppServices
from .deps import APIError, require_course, serialize_enrollment, services

router = APIRouter(tags=["learning"])


@router.get("/learning", response_model=list[Enrollment], summary="All enrolments with progress")
def list_learning(svc: AppServices = Depends(services)) -> list[dict[str, Any]]:
    sessions = svc.repo.list_sessions()
    items = [serialize_enrollment(svc, e, sessions) for e in svc.repo.list_enrollments().values()]
    return sorted(items, key=lambda e: e["enrolled_at"] or "", reverse=True)


@router.post("/learning", response_model=Enrollment, status_code=status.HTTP_201_CREATED, summary="Enrol in a course")
def enroll(body: EnrollIn, svc: AppServices = Depends(services)) -> dict[str, Any]:
    require_course(svc, body.course_id)
    if svc.repo.get_enrollment(body.course_id):
        raise APIError(409, "already_enrolled", "You are already enrolled in this course.")
    if body.target_date and body.target_date < date.today():
        raise APIError(422, "target_in_past", "Target date cannot be in the past.")
    if body.total_lessons:
        total, source = body.total_lessons, "user"
    else:
        total, source = svc.default_lessons(body.course_id)
    entry = svc.repo.enroll(body.course_id, total, source, body.target_date.isoformat() if body.target_date else None)
    return serialize_enrollment(svc, entry, svc.repo.list_sessions())


@router.patch("/learning/{course_id}", response_model=Enrollment, summary="Pause / resume / complete, or edit lessons and target date")
def update_learning(course_id: str, body: EnrollmentUpdate, svc: AppServices = Depends(services)) -> dict[str, Any]:
    require_course(svc, course_id)
    current = svc.repo.get_enrollment(course_id)
    if not current:
        raise APIError(404, "not_enrolled", "You are not enrolled in this course.")
    changes: dict[str, Any] = {}
    total = body.total_lessons if body.total_lessons is not None else current["total_lessons"]
    completed = body.completed_lessons if body.completed_lessons is not None else current["completed_lessons"]
    if completed > total:
        raise APIError(422, "invalid_lessons", f"Completed lessons ({completed}) cannot exceed total lessons ({total}).")
    if body.total_lessons is not None:
        changes["total_lessons"] = body.total_lessons
    if body.completed_lessons is not None:
        changes["completed_lessons"] = body.completed_lessons
    if body.state is not None:
        changes["state"] = body.state
        if body.state == "active" and current["state"] == "completed" and body.completed_lessons is None:
            changes["completed_lessons"] = min(current["completed_lessons"], max(0, total - 1))
    elif body.completed_lessons is not None and body.completed_lessons == total and total > 0 and current["state"] != "completed":
        changes["state"] = "completed"
    if body.clear_target_date:
        changes["target_date"] = None
    elif body.target_date is not None:
        changes["target_date"] = body.target_date.isoformat()
    entry = svc.repo.update_enrollment(course_id, changes)
    return serialize_enrollment(svc, entry, svc.repo.list_sessions())


@router.delete("/learning/{course_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove an enrolment (requires confirm=true)")
def unenroll(course_id: str, confirm: bool = Query(False), svc: AppServices = Depends(services)) -> Response:
    if not confirm:
        raise APIError(400, "confirmation_required", "Add confirm=true to remove this course from My Learning.")
    if not svc.repo.remove_enrollment(course_id):
        raise APIError(404, "not_enrolled", "You are not enrolled in this course.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/learning/{course_id}/sessions", response_model=StudySession, status_code=status.HTTP_201_CREATED,
             summary="Log study time (and optionally lessons completed)")
def log_session(course_id: str, body: SessionIn, svc: AppServices = Depends(services)) -> dict[str, Any]:
    course = require_course(svc, course_id)
    enrollment = svc.repo.get_enrollment(course_id)
    if not enrollment:
        raise APIError(409, "not_enrolled", "Enrol in the course before logging study time.")
    session_date = (body.date or date.today()).isoformat()
    session = svc.repo.add_session(course_id, session_date, body.minutes, body.lessons_completed, body.note)
    changes: dict[str, Any] = {}
    if body.lessons_completed and enrollment["state"] != "completed":
        new_total = min(enrollment["total_lessons"], enrollment["completed_lessons"] + body.lessons_completed)
        changes["completed_lessons"] = new_total
        if new_total >= enrollment["total_lessons"]:
            changes["state"] = "completed"
    if enrollment["state"] == "paused" and "state" not in changes:
        changes["state"] = "active"  # studying resumes a paused course
    if changes:
        svc.repo.update_enrollment(course_id, changes)
    return {**session, "course_title": course["title"]}


@router.get("/sessions", response_model=list[StudySession], summary="Study sessions, newest first")
def list_sessions(course_id: Optional[str] = None, limit: int = Query(200, ge=1, le=2000),
                  svc: AppServices = Depends(services)) -> list[dict[str, Any]]:
    items = svc.repo.list_sessions()
    if course_id:
        items = [s for s in items if s["course_id"] == course_id]
    items.sort(key=lambda s: (s["date"], s.get("created_at") or ""), reverse=True)
    out = []
    for s in items[:limit]:
        course = svc.catalog.get(s["course_id"])
        out.append({**s, "course_title": course["title"] if course else None})
    return out


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a study session")
def delete_session(session_id: str, svc: AppServices = Depends(services)) -> Response:
    if not svc.repo.delete_session(session_id):
        raise APIError(404, "session_not_found", "No study session with that id.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/goals", response_model=LearningGoal, summary="Weekly study goal")
def get_goals(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return svc.repo.get_goals()


@router.put("/goals", response_model=LearningGoal, summary="Update weekly study goal")
def put_goals(body: GoalUpdate, svc: AppServices = Depends(services)) -> dict[str, Any]:
    return svc.repo.save_goals(body.model_dump())
