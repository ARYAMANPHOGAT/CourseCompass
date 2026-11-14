"""Catalog search, filtering, sorting and pagination for the Discover page."""
from __future__ import annotations

import re
from typing import Any

from .recommender.engine import course_summary
from .taxonomy import DURATION_BUCKETS, SKILL_BY_ID

SORTS = {"relevance", "match", "rating", "duration", "title"}


def _duration_sort_key(course: dict[str, Any]) -> tuple[int, float]:
    bucket = course.get("duration_bucket")
    if bucket is None:
        return (99, 0.0)
    hours = course.get("duration_hours")
    months = course.get("duration_months")
    magnitude = hours if hours is not None else (months or 0) * 1000
    return (DURATION_BUCKETS.index(bucket), float(magnitude))


def search_courses(
    catalog,
    content_index,
    *,
    q: str | None = None,
    categories: list[str] | None = None,
    content_types: list[str] | None = None,
    levels: list[str] | None = None,
    durations: list[str] | None = None,
    free_only: bool = False,
    min_rating: float | None = None,
    languages: list[str] | None = None,
    skills: list[str] | None = None,
    sort: str = "relevance",
    page: int = 1,
    page_size: int = 12,
    match_scores: dict[str, float] | None = None,
) -> dict[str, Any]:
    courses = catalog.courses
    relevance: dict[str, float] = {}
    query = (q or "").strip()
    if query:
        tfidf = content_index.search_scores(query)
        terms = [t for t in re.split(r"\W+", query.lower()) if len(t) > 1]
        for i, c in enumerate(courses):
            title = (c.get("title") or "").lower()
            text = " ".join(
                filter(None, [title, (c.get("description") or "").lower(), (c.get("category") or "").lower(),
                              " ".join(c.get("skill_labels") or []).lower()])
            )
            score = float(tfidf[i])
            if query.lower() in title:
                score += 0.5
            elif terms and all(t in title for t in terms):
                score += 0.35
            if terms and all(t in text for t in terms):
                score += 0.2
            skill_hit = any(query.lower() in (lbl or "").lower() for lbl in c.get("skill_labels") or [])
            if skill_hit:
                score += 0.25
            if score > 0.02:
                relevance[c["id"]] = score
        courses = [c for c in courses if c["id"] in relevance]

    def keep(c: dict[str, Any]) -> bool:
        if categories and c.get("category") not in categories:
            return False
        if content_types and c.get("content_type") not in content_types:
            return False
        if levels and c.get("level") not in levels:
            return False
        if durations and c.get("duration_bucket") not in durations:
            return False
        if free_only and c.get("price_status") != "free":
            return False
        if min_rating is not None and (c.get("rating") is None or c["rating"] < min_rating):
            return False
        if languages and not (set(c.get("languages") or []) & set(languages)):
            return False
        if skills and not (set(c.get("skills") or []) & set(skills)):
            return False
        return True

    filtered = [c for c in courses if keep(c)]
    facets = catalog.facets(filtered)

    if sort not in SORTS:
        sort = "relevance"
    if sort == "relevance" and not query:
        sort = "match" if match_scores else "rating"
    if sort == "match" and not match_scores:
        sort = "rating"
    if sort == "relevance":
        filtered.sort(key=lambda c: (-relevance.get(c["id"], 0.0), c["title"].lower()))
    elif sort == "match":
        filtered.sort(key=lambda c: (-(match_scores or {}).get(c["id"], 0.0), c["title"].lower()))
    elif sort == "rating":
        filtered.sort(key=lambda c: (c.get("rating") is None, -(c.get("rating") or 0), c["title"].lower()))
    elif sort == "duration":
        filtered.sort(key=lambda c: (_duration_sort_key(c), c["title"].lower()))
    elif sort == "title":
        filtered.sort(key=lambda c: c["title"].lower())

    total = len(filtered)
    page_size = max(1, min(60, page_size))
    pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, min(page, pages))
    start = (page - 1) * page_size
    items = []
    for c in filtered[start: start + page_size]:
        summary = course_summary(c)
        summary["match_percent"] = int(round(match_scores[c["id"]] * 100)) if match_scores and c["id"] in match_scores else None
        summary["relevance"] = round(relevance[c["id"]], 4) if c["id"] in relevance else None
        items.append(summary)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
        "sort": sort,
        "facets": facets,
        "query": query or None,
        "unknown_skills": [s for s in (skills or []) if s not in SKILL_BY_ID],
    }
