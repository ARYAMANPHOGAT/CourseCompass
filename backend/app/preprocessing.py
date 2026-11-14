"""Reproducible preprocessing pipeline: raw Coursera CSV -> cleaned catalog JSON.

Run from the backend folder:

    python -m app.preprocessing            # uses data/raw/webautomation_coursera.csv
    python -m app.preprocessing --csv path/to/file.csv

The original CSV is never modified. Every transformation is recorded in
data/processed/preprocessing_report.json. No metadata is fabricated: missing values
stay missing (null) and derived fields (content type inferred from URL, detected
skills, duration bucket) are labelled as derived.
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import pandas as pd

from .config import PREPROCESS_REPORT, PROCESSED_CATALOG, RAW_CSV
from .jsonio import atomic_write_json, utc_now_iso
from .taxonomy import CONTENT_TYPES, detect_skills, skill_label

logger = logging.getLogger("coursecompass.preprocessing")

PIPELINE_VERSION = "1.0.0"
PLACEHOLDERS = {"-", "", "—", "–", "n/a", "na", "none", "null", "nan", "not available"}

COLUMN_ALIASES: dict[str, list[str]] = {
    "url": ["url", "link", "course_url"],
    "title": ["title", "name", "course_title", "course_name"],
    "provider": ["associated_university_institution_company", "provider", "institution", "organization", "university", "partner"],
    "content_type": ["type", "content_type", "course_type"],
    "image": ["image", "image_url", "thumbnail"],
    "category": ["category_subject_area", "category", "subject", "subject_area"],
    "certificate": ["certificate_is_available", "certificate", "certificate_available"],
    "description": ["description", "summary", "about"],
    "duration": ["duration", "length", "time_to_complete"],
    "language": ["language", "languages"],
    "level": ["level", "difficulty", "difficulty_level"],
    "prerequisites": ["prerequisites", "prerequisite", "requirements"],
    "price": ["price", "cost"],
    "rating": ["rating", "stars", "average_rating"],
    "review_count": ["review_count", "reviews", "num_reviews", "ratings_count", "number_of_reviews"],
    "syllabus": ["syllabus", "modules", "curriculum"],
    "timestamp": ["timestamp", "scraped_at", "date_scraped"],
}

SOURCE_LABEL = "Coursera catalog snapshot (webautomation_coursera.csv)"
GENERIC_IMAGE_MARKERS = ("Grid_Coursera_Partners",)
SYLLABUS_NOISE = {"show all syllabus", "show all", "show more", "see all"}
ZERO_WIDTH = re.compile(r"[​‌‍﻿]")
WHITESPACE = re.compile(r"\s+")


def normalize_column_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name).strip().lower()).strip("_")


def resolve_columns(columns: list[str]) -> dict[str, str | None]:
    """Map canonical field -> actual (normalized) column name, or None if absent."""
    normalized = {normalize_column_name(c): c for c in columns}
    mapping: dict[str, str | None] = {}
    for field, aliases in COLUMN_ALIASES.items():
        mapping[field] = next((a for a in aliases if a in normalized), None)
    return mapping


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    text = ZERO_WIDTH.sub("", str(value))
    text = WHITESPACE.sub(" ", text).strip()
    if text.lower() in PLACEHOLDERS:
        return None
    return text


def canonical_url(value: str | None) -> str | None:
    """Validate and canonicalize a URL (http/https only, no query/fragment/trailing slash)."""
    if not value:
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or " " in value.strip():
        return None
    path = re.sub(r"/{2,}", "/", parsed.path).rstrip("/")
    return urlunparse(("https", parsed.netloc.lower(), path, "", "", ""))


def infer_type_from_url(url: str) -> str | None:
    path = urlparse(url).path.lower()
    if path.startswith("/learn/"):
        return "course"
    if path.startswith("/specializations/"):
        return "specialization"
    if path.startswith("/professional-certificates/"):
        return "professional_certificate"
    if path.startswith("/projects/"):
        return "guided_project"
    if path.startswith("/browse/"):
        return "category_page"
    return None


def normalize_type(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.strip().lower()
    if key in {"course", "courses"}:
        return "course"
    if key.startswith("specialization"):
        return "specialization"
    if key.startswith("professional certificate") or key.startswith("professional-certificate"):
        return "professional_certificate"
    if key.startswith("guided project") or key == "project":
        return "guided_project"
    return None


def parse_level(raw: str | None) -> str | None:
    if not raw:
        return None
    key = raw.lower()
    for level in ("beginner", "intermediate", "advanced"):
        if level in key:
            return level
    if "mixed" in key:
        return None
    return None


DURATION_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(hour|hr|month|week|minute|min)s?", re.IGNORECASE)


def parse_duration(raw: str | None) -> dict[str, Any]:
    """Parse 'Approx. 14 hours to complete' / 'Approximately 6 months to complete'.

    Buckets (documented assumption, no hours-per-week is inferred for month values):
    short < 10 h; medium 10-40 h; long > 40 h or <= 3 months; extended > 3 months.
    """
    result: dict[str, Any] = {"duration_hours": None, "duration_months": None, "duration_bucket": None}
    if not raw:
        return result
    match = DURATION_RE.search(raw)
    if not match:
        return result
    value = float(match.group(1).replace(",", "."))
    unit = match.group(2).lower()
    if unit in {"minute", "min"}:
        hours = value / 60.0
        result["duration_hours"] = round(hours, 2)
    elif unit in {"hour", "hr"}:
        result["duration_hours"] = value
    elif unit == "week":
        result["duration_months"] = round(value / 4.345, 2)
    elif unit == "month":
        result["duration_months"] = value
    hours = result["duration_hours"]
    months = result["duration_months"]
    if hours is not None:
        result["duration_bucket"] = "short" if hours < 10 else "medium" if hours <= 40 else "long"
    elif months is not None:
        result["duration_bucket"] = "long" if months <= 3 else "extended"
    return result


def parse_price(raw: str | None) -> tuple[str, bool | None]:
    """Return (price_status, is_free). 'Enroll' means the source page showed an enroll
    button without a captured price, so the price is treated as 'not_listed'."""
    if not raw:
        return "unknown", None
    key = raw.strip().lower()
    if key in {"free", "free enrollment", "audit for free"} or key.startswith("free"):
        return "free", True
    if key in {"enroll", "enroll now", "enroll for free"}:
        return ("free", True) if "free" in key else ("not_listed", None)
    if re.search(r"\d", key):
        return "paid", False
    return "not_listed", None


def parse_rating(raw: str | None) -> float | None:
    if not raw:
        return None
    try:
        value = float(raw.replace(",", "."))
    except ValueError:
        return None
    return value if 0.0 <= value <= 5.0 else None


def parse_int(raw: str | None) -> int | None:
    if not raw:
        return None
    digits = re.sub(r"[^\d]", "", raw)
    return int(digits) if digits else None


def _looks_like_module_title(segment: str) -> bool:
    if len(segment) > 90 or len(segment.split()) > 12:
        return False
    if segment.endswith((".", "!", "?", ":")):
        return False
    lowered = segment.lower()
    return not lowered.startswith(("this ", "in this", "you ", "we ", "welcome", "learn "))


def parse_syllabus(raw: str | None) -> tuple[list[str], str | None]:
    """Split the '~.~' separated syllabus into (module titles, cleaned full text)."""
    if not raw:
        return [], None
    segments = [clean_text(s) for s in raw.split("~.~")]
    segments = [s for s in segments if s and s.lower() not in SYLLABUS_NOISE]
    if not segments:
        return [], None
    modules: list[str] = []
    for seg in segments:
        if _looks_like_module_title(seg) and seg not in modules:
            modules.append(seg)
    return modules[:30], " ".join(segments)


def make_course_id(url: str, used: set[str]) -> str:
    path = urlparse(url).path.strip("/")
    slug = path.split("/")[-1] if path else "course"
    slug = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-") or "course"
    candidate = slug
    if candidate in used:
        prefix = path.split("/")[0] if "/" in path else "item"
        candidate = f"{prefix}-{slug}"
    suffix = 2
    base = candidate
    while candidate in used:
        candidate = f"{base}-{suffix}"
        suffix += 1
    used.add(candidate)
    return candidate


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_raw_csv(path: Path) -> pd.DataFrame:
    """Read every column as text so no value is silently coerced."""
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return pd.read_csv(path, dtype=str, keep_default_na=False, encoding=encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    raise ValueError(f"Could not decode {path.name}: {last_error}")


def preprocess_dataframe(df: pd.DataFrame) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Clean a raw dataframe. Returns (courses, report)."""
    report: dict[str, Any] = {"input_rows": int(len(df)), "input_columns": list(df.columns)}
    df = df.rename(columns={c: normalize_column_name(c) for c in df.columns})
    mapping = resolve_columns(list(df.columns))
    report["column_mapping"] = mapping
    report["missing_fields"] = [f for f, col in mapping.items() if col is None]

    def col(row: pd.Series, field: str) -> str | None:
        name = mapping.get(field)
        return clean_text(row.get(name)) if name else None

    placeholder_counts: dict[str, int] = {}
    for field, name in mapping.items():
        if name:
            values = df[name].astype(str).map(lambda v: (ZERO_WIDTH.sub("", v).strip().lower() in PLACEHOLDERS))
            placeholder_counts[field] = int(values.sum())
    report["placeholder_or_empty_values"] = placeholder_counts

    excluded: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        raw_url = col(row, "url")
        url = canonical_url(raw_url)
        title = col(row, "title")
        if not url:
            excluded.append({"row": int(idx) + 2, "reason": "invalid_or_missing_url", "value": raw_url})
            continue
        url_type = infer_type_from_url(url)
        if url_type == "category_page":
            excluded.append({"row": int(idx) + 2, "reason": "category_listing_page_not_a_course", "value": url})
            continue
        if not title:
            excluded.append({"row": int(idx) + 2, "reason": "missing_title", "value": url})
            continue
        dataset_type = normalize_type(col(row, "content_type"))
        content_type = dataset_type or url_type
        if not content_type:
            excluded.append({"row": int(idx) + 2, "reason": "unknown_content_type", "value": url})
            continue
        image_raw = col(row, "image")
        image_url = canonical_url(image_raw) if image_raw else None
        image_specific = bool(image_url) and not any(m in (image_raw or "") for m in GENERIC_IMAGE_MARKERS)
        if image_url and not image_specific:
            image_url = None  # generic partner grid, not course artwork -> use local fallback
        price_status, is_free = parse_price(col(row, "price"))
        certificate_raw = col(row, "certificate")
        language = col(row, "language")
        modules, syllabus_text = parse_syllabus(col(row, "syllabus"))
        candidates.append(
            {
                "_row": int(idx) + 2,
                "_timestamp": col(row, "timestamp") or "",
                "url": url,
                "title": title,
                "provider": col(row, "provider"),
                "content_type": content_type,
                "content_type_source": "dataset" if dataset_type else "derived_from_url",
                "category": col(row, "category"),
                "description": col(row, "description"),
                "level": parse_level(col(row, "level")),
                "duration_text": col(row, "duration"),
                **parse_duration(col(row, "duration")),
                "price_status": price_status,
                "price_text": col(row, "price"),
                "is_free": is_free,
                "rating": parse_rating(col(row, "rating")),
                "review_count": parse_int(col(row, "review_count")),
                "certificate": (True if certificate_raw and "certificate" in certificate_raw.lower() else None),
                "language": language,
                "languages": [p.strip() for p in language.split(",") if p.strip()] if language else [],
                "prerequisites": col(row, "prerequisites"),
                "modules": modules,
                "module_count": len(modules) or None,
                "syllabus_text": syllabus_text,
                "image_url": image_url,
                "scraped_at": col(row, "timestamp"),
            }
        )

    # Deduplicate by canonical URL. Identical rows collapse; differing rows keep the
    # most complete record (ties -> latest timestamp, then earliest row).
    by_url: dict[str, list[dict[str, Any]]] = {}
    for cand in candidates:
        by_url.setdefault(cand["url"], []).append(cand)
    exact_dupes = 0
    merged_dupes = 0
    deduped: list[dict[str, Any]] = []
    for url, group in by_url.items():
        if len(group) == 1:
            deduped.append(group[0])
            continue
        signatures = {repr({k: v for k, v in g.items() if not k.startswith("_") and k != "scraped_at"}) for g in group}
        if len(signatures) == 1:
            exact_dupes += len(group) - 1
        else:
            merged_dupes += len(group) - 1

        def completeness(rec: dict[str, Any]) -> tuple[int, str, int]:
            filled = sum(1 for k, v in rec.items() if not k.startswith("_") and v not in (None, [], ""))
            return (filled, rec["_timestamp"], -rec["_row"])

        deduped.append(max(group, key=completeness))

    # Repeated titles with different URLs are distinct offerings: keep them and flag.
    title_groups: dict[str, list[dict[str, Any]]] = {}
    for rec in deduped:
        title_groups.setdefault(rec["title"].lower(), []).append(rec)
    repeated_titles = [t for t, g in title_groups.items() if len(g) > 1]

    used_ids: set[str] = set()
    courses: list[dict[str, Any]] = []
    for rec in sorted(deduped, key=lambda r: r["url"]):
        rec = {k: v for k, v in rec.items() if not k.startswith("_")}
        rec["id"] = make_course_id(rec["url"], used_ids)
        rec["content_type_label"] = CONTENT_TYPES.get(rec["content_type"], rec["content_type"])
        body = " ".join(filter(None, [rec.get("description"), rec.get("syllabus_text")]))
        rec["skills"] = detect_skills(rec["title"], body, category=rec.get("category"))
        rec["skill_labels"] = [skill_label(s) for s in rec["skills"]]
        rec["skills_source"] = "detected_from_course_text"
        rec["duplicate_title"] = rec["title"].lower() in repeated_titles
        rec["source"] = "dataset"
        courses.append(rec)

    def count_missing(field: str) -> int:
        return sum(1 for c in courses if c.get(field) in (None, [], ""))

    report.update(
        {
            "excluded_rows": excluded,
            "excluded_count": len(excluded),
            "duplicate_rows_removed_exact": exact_dupes,
            "duplicate_rows_merged_differing": merged_dupes,
            "repeated_titles_kept_distinct": repeated_titles,
            "output_records": len(courses),
            "by_content_type": _count(courses, "content_type"),
            "by_level": _count(courses, "level"),
            "by_price_status": _count(courses, "price_status"),
            "by_duration_bucket": _count(courses, "duration_bucket"),
            "by_language": _count(courses, "language"),
            "missing_after_cleaning": {
                f: count_missing(f)
                for f in ("provider", "category", "description", "level", "duration_bucket", "rating", "language", "syllabus_text", "image_url", "prerequisites", "review_count")
            },
            "courses_with_detected_skills": sum(1 for c in courses if c["skills"]),
            "content_type_derived_from_url": sum(1 for c in courses if c["content_type_source"] != "dataset"),
        }
    )
    return courses, report


def _count(courses: list[dict[str, Any]], field: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for c in courses:
        key = str(c.get(field)) if c.get(field) is not None else "missing"
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def run_preprocessing(
    raw_csv: Path = RAW_CSV,
    out_catalog: Path = PROCESSED_CATALOG,
    out_report: Path = PREPROCESS_REPORT,
) -> dict[str, Any]:
    if not raw_csv.exists():
        raise FileNotFoundError(f"Raw dataset not found: {raw_csv.name}")
    df = load_raw_csv(raw_csv)
    courses, report = preprocess_dataframe(df)
    if not courses:
        raise ValueError("Preprocessing produced zero usable course records.")
    sha = file_sha256(raw_csv)
    meta = {
        "source": SOURCE_LABEL,
        "source_file": raw_csv.name,
        "source_sha256": sha,
        "pipeline_version": PIPELINE_VERSION,
        "generated_at": utc_now_iso(),
        "record_count": len(courses),
        "is_sample": False,
        "provenance_note": (
            "Records were scraped from public Coursera catalog pages (timestamps July 2022) and "
            "distributed as webautomation_coursera.csv. Course text, ratings and links belong to "
            "Coursera and its partners. Redistribution terms of the CSV are not documented; use for "
            "private academic demonstration only and verify licensing before publishing."
        ),
    }
    report = {"meta": meta, **report}
    atomic_write_json(out_catalog, {"meta": meta, "courses": courses})
    atomic_write_json(out_report, report)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Clean the Coursera CSV into the CourseCompass catalog.")
    parser.add_argument("--csv", type=Path, default=RAW_CSV, help="Path to the raw CSV")
    parser.add_argument("--out", type=Path, default=PROCESSED_CATALOG, help="Output catalog JSON path")
    parser.add_argument("--report", type=Path, default=PREPROCESS_REPORT, help="Output report JSON path")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        report = run_preprocessing(args.csv, args.out, args.report)
    except (FileNotFoundError, ValueError) as exc:
        print(f"[preprocessing] {exc}", file=sys.stderr)
        return 1
    print(
        f"[preprocessing] {report['input_rows']} rows -> {report['output_records']} courses "
        f"({report['excluded_count']} excluded, {report['duplicate_rows_removed_exact']} exact duplicates removed)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
