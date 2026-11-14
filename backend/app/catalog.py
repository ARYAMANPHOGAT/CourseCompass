"""Course catalog loading with a documented fallback chain.

1. data/processed/catalog.json (output of `python -m app.preprocessing`)
2. If missing/invalid and the raw CSV exists -> run preprocessing now
3. Otherwise -> the clearly labelled bundled SAMPLE catalog
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .jsonio import read_json
from .preprocessing import run_preprocessing
from .taxonomy import CONTENT_TYPES, DURATION_BUCKETS, LEVELS

logger = logging.getLogger("coursecompass.catalog")

REQUIRED_FIELDS = ("id", "title")


@dataclass
class Catalog:
    courses: list[dict[str, Any]]
    meta: dict[str, Any]
    source_kind: str  # "dataset" | "sample"
    load_notes: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.courses = sorted(self.courses, key=lambda c: c["id"])
        self.by_id: dict[str, dict[str, Any]] = {c["id"]: c for c in self.courses}
        self.index: dict[str, int] = {c["id"]: i for i, c in enumerate(self.courses)}

    def __len__(self) -> int:
        return len(self.courses)

    def get(self, course_id: str) -> dict[str, Any] | None:
        return self.by_id.get(course_id)

    def exists(self, course_id: str) -> bool:
        return course_id in self.by_id

    def categories(self) -> list[str]:
        return sorted({c["category"] for c in self.courses if c.get("category")})

    def languages(self) -> list[str]:
        return sorted({lang for c in self.courses for lang in c.get("languages") or []})

    def facets(self, courses: list[dict[str, Any]] | None = None) -> dict[str, list[dict[str, Any]]]:
        courses = self.courses if courses is None else courses

        def count(field_name: str, order: list[str] | None = None, labels: dict[str, str] | None = None) -> list[dict[str, Any]]:
            counts: dict[str, int] = {}
            for c in courses:
                key = c.get(field_name)
                if key is None:
                    continue
                counts[key] = counts.get(key, 0) + 1
            keys = [k for k in order if k in counts] if order else sorted(counts, key=lambda k: (-counts[k], k))
            return [{"value": k, "label": (labels or {}).get(k, k), "count": counts[k]} for k in keys]

        lang_counts: dict[str, int] = {}
        for c in courses:
            for lang in c.get("languages") or []:
                lang_counts[lang] = lang_counts.get(lang, 0) + 1
        return {
            "categories": count("category"),
            "content_types": count("content_type", list(CONTENT_TYPES), CONTENT_TYPES),
            "levels": count("level", LEVELS),
            "durations": count("duration_bucket", DURATION_BUCKETS),
            "price_statuses": count("price_status", ["free", "not_listed", "paid", "unknown"]),
            "languages": [
                {"value": k, "label": k, "count": v} for k, v in sorted(lang_counts.items(), key=lambda kv: (-kv[1], kv[0]))
            ],
        }


def _validate(courses: Any) -> list[dict[str, Any]]:
    if not isinstance(courses, list):
        raise ValueError("catalog 'courses' must be a list")
    valid: list[dict[str, Any]] = []
    seen: set[str] = set()
    for c in courses:
        if not isinstance(c, dict) or any(not c.get(f) for f in REQUIRED_FIELDS):
            continue
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        c.setdefault("skills", [])
        c.setdefault("skill_labels", [])
        c.setdefault("languages", [])
        c.setdefault("modules", [])
        valid.append(c)
    return valid


def _load_file(path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = read_json(path)
    courses = _validate(payload.get("courses"))
    if not courses:
        raise ValueError("catalog contains no valid course records")
    return courses, payload.get("meta", {})


def load_catalog(settings: Settings) -> Catalog:
    notes: list[str] = []
    if settings.processed_catalog.exists():
        try:
            courses, meta = _load_file(settings.processed_catalog)
            return Catalog(courses, meta, "sample" if meta.get("is_sample") else "dataset", notes)
        except (OSError, ValueError) as exc:
            notes.append(f"Processed catalog unreadable ({exc.__class__.__name__}); rebuilding.")
            logger.warning(notes[-1])
    if settings.raw_csv.exists():
        try:
            run_preprocessing(settings.raw_csv, settings.processed_catalog, settings.preprocess_report)
            courses, meta = _load_file(settings.processed_catalog)
            notes.append("Catalog rebuilt from the raw CSV at startup.")
            return Catalog(courses, meta, "dataset", notes)
        except (OSError, ValueError) as exc:
            notes.append(f"Raw CSV could not be processed ({exc}).")
            logger.warning(notes[-1])
    courses, meta = _load_file(settings.sample_catalog)
    notes.append("Using the bundled SAMPLE catalog (fictional demo records).")
    logger.warning(notes[-1])
    return Catalog(courses, meta, "sample", notes)
