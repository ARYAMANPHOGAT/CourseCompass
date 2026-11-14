"""Catalog, course detail, similar courses, comparison and taxonomy endpoints."""
from __future__ import annotations

from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query

from ..recommender.engine import course_summary
from ..schemas import CompareIn
from ..search import search_courses
from ..services import AppServices
from ..taxonomy import CAREER_GOALS, CONTENT_TYPES, DURATION_BUCKET_LABELS, LEVELS, SKILL_GROUPS, SKILLS
from .deps import APIError, require_course, services

router = APIRouter(tags=["courses"])


@router.get("/meta/taxonomy", summary="Career goals, skills, categories and filter vocabularies")
def taxonomy(svc: AppServices = Depends(services)) -> dict[str, Any]:
    return {
        "career_goals": [
            {"id": c.id, "label": c.label, "description": c.description, "skills": list(c.skills),
             "categories": list(c.categories)} for c in CAREER_GOALS
        ],
        "skills": [{"id": s.id, "label": s.label, "group": s.group, "group_label": SKILL_GROUPS[s.group]} for s in SKILLS],
        "skill_groups": [{"id": k, "label": v} for k, v in SKILL_GROUPS.items()],
        "categories": svc.catalog.categories(),
        "languages": svc.catalog.languages(),
        "levels": LEVELS,
        "durations": [{"id": k, "label": v} for k, v in DURATION_BUCKET_LABELS.items()],
        "content_types": [{"id": k, "label": v} for k, v in CONTENT_TYPES.items()],
        "catalog_source": svc.catalog.source_kind,
    }


@router.get("/courses", summary="Search, filter, sort and paginate the catalog")
def list_courses(
    q: Optional[str] = Query(None, max_length=200, description="Search title, description, topic and skill"),
    category: list[str] = Query(default_factory=list),
    content_type: list[str] = Query(default_factory=list),
    level: list[str] = Query(default_factory=list),
    duration: list[str] = Query(default_factory=list),
    language: list[str] = Query(default_factory=list),
    skill: list[str] = Query(default_factory=list),
    free_only: bool = False,
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    sort: Literal["relevance", "match", "rating", "duration", "title"] = "relevance",
    page: int = Query(1, ge=1, le=1000),
    page_size: int = Query(12, ge=1, le=60),
    svc: AppServices = Depends(services),
) -> dict[str, Any]:
    snapshot = svc.repo.snapshot()
    scores, has_prefs = svc.recommender.match_scores(snapshot)
    result = search_courses(
        svc.catalog, svc.content, q=q, categories=category, content_types=content_type, levels=level,
        durations=duration, free_only=free_only, min_rating=min_rating, languages=language, skills=skill,
        sort=sort, page=page, page_size=page_size, match_scores=scores if has_prefs else None,
    )
    wishlist = {w["course_id"] for w in snapshot["wishlist"]}
    for item in result["items"]:
        e = snapshot["enrollments"].get(item["id"])
        item["user"] = {"wishlisted": item["id"] in wishlist, "enrollment_state": e.get("state") if e else None,
                        "feedback": (snapshot["feedback"].get(item["id"]) or {}).get("kind")}
    result["personalized"] = has_prefs
    return result


@router.get("/courses/{course_id}", summary="Course detail with personalised score and explanation")
def course_detail(course_id: str, mode: Literal["hybrid", "content"] = "hybrid",
                  svc: AppServices = Depends(services)) -> dict[str, Any]:
    course = require_course(svc, course_id)
    snapshot = svc.repo.snapshot()
    scoring = svc.recommender.detail_scoring(snapshot, [course_id], mode)[course_id]
    e = snapshot["enrollments"].get(course_id)
    full = {**course_summary(course), **{k: course.get(k) for k in (
        "description", "modules", "prerequisites", "content_type_source", "skills_source", "scraped_at")}}
    return {
        "course": full,
        "personalization": scoring,
        "profile_complete": svc.repo.get_profile().get("onboarded", False),
        "user": {
            "wishlisted": any(w["course_id"] == course_id for w in snapshot["wishlist"]),
            "enrollment_state": e.get("state") if e else None,
            "feedback": snapshot["feedback"].get(course_id),
        },
        "link": {
            "url": course.get("url"),
            "validated": bool(course.get("url")),
            "note": "Link validated as a well-formed https URL from the dataset; availability on the provider site is not guaranteed."
            if course.get("url") else "No external link available for this record.",
        },
    }


@router.get("/courses/{course_id}/similar", summary="Similar courses by content and metadata")
def similar_courses(course_id: str, limit: int = Query(6, ge=1, le=20), svc: AppServices = Depends(services)) -> dict[str, Any]:
    require_course(svc, course_id)
    return {"course_id": course_id, "items": svc.recommender.similar(course_id, limit),
            "method": "0.85 x TF-IDF cosine + 0.10 x same category + 0.05 x level match (x0.8 if languages differ)"}


@router.post("/courses/compare", summary="Compare 2-3 courses side by side")
def compare_courses(body: CompareIn, svc: AppServices = Depends(services)) -> dict[str, Any]:
    ids = list(dict.fromkeys(body.course_ids))
    if len(ids) < 2:
        raise APIError(422, "compare_needs_two", "Select at least two different courses to compare.")
    for cid in ids:
        require_course(svc, cid)
    snapshot = svc.repo.snapshot()
    scoring = svc.recommender.detail_scoring(snapshot, ids, body.mode)
    skill_sets = {cid: set(svc.catalog.get(cid).get("skills") or []) for cid in ids}
    shared = set.intersection(*skill_sets.values()) if skill_sets else set()
    from ..taxonomy import skill_label

    return {
        "items": [
            {
                "course": {**course_summary(svc.catalog.get(cid)), "modules": svc.catalog.get(cid).get("modules") or []},
                "personalization": scoring[cid],
                "unique_skills": [skill_label(s) for s in sorted(skill_sets[cid] - shared)],
            }
            for cid in ids
        ],
        "shared_skills": [skill_label(s) for s in sorted(shared)],
        "content_similarity": svc.recommender.pairwise_similarity(ids),
    }
