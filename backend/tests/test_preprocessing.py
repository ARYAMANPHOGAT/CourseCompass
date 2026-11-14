"""Dataset loading, cleaning and validation."""
from __future__ import annotations

import json

import pytest

from app.config import RAW_CSV
from app.preprocessing import (
    canonical_url,
    file_sha256,
    load_raw_csv,
    parse_duration,
    parse_price,
    parse_syllabus,
    preprocess_dataframe,
    run_preprocessing,
)

from .conftest import FIXTURES


@pytest.fixture()
def mini():
    df = load_raw_csv(FIXTURES / "mini_courses.csv")
    courses, report = preprocess_dataframe(df)
    return {c["id"]: c for c in courses}, report


def test_column_names_normalised_and_mapped(mini):
    _, report = mini
    assert report["column_mapping"]["provider"] == "provider"
    assert report["column_mapping"]["category"] == "category"
    assert report["column_mapping"]["certificate"] == "certificate_is_available"
    assert "review_count" in report["missing_fields"]


def test_exclusions_and_reasons(mini):
    courses, report = mini
    reasons = sorted(e["reason"] for e in report["excluded_rows"])
    assert reasons == ["category_listing_page_not_a_course", "invalid_or_missing_url", "missing_title"]
    assert set(courses) == {"test-sql", "test-cloud", "test-python-project", "test-ux"}


def test_dedup_by_canonical_url(mini):
    courses, report = mini
    assert report["duplicate_rows_removed_exact"] == 1  # trailing slash variant collapsed
    assert courses["test-sql"]["url"] == "https://www.coursera.org/learn/test-sql"


def test_placeholders_become_missing_not_strings(mini):
    courses, _ = mini
    cloud = courses["test-cloud"]
    assert cloud["provider"] is None and cloud["description"] is None and cloud["rating"] is None
    assert cloud["level"] is None and cloud["language"] is None
    for course in courses.values():
        for value in course.values():
            assert value != "-"


def test_types_preserved_and_inferred(mini):
    courses, _ = mini
    assert courses["test-sql"]["content_type"] == "course"
    assert courses["test-cloud"]["content_type"] == "specialization"
    assert courses["test-ux"]["content_type"] == "professional_certificate"
    project = courses["test-python-project"]
    assert project["content_type"] == "guided_project"
    assert project["content_type_source"] == "derived_from_url"


def test_price_rating_image_and_language(mini):
    courses, _ = mini
    assert courses["test-sql"]["price_status"] == "free" and courses["test-sql"]["is_free"] is True
    assert courses["test-cloud"]["price_status"] == "not_listed" and courses["test-cloud"]["is_free"] is None
    assert courses["test-python-project"]["price_status"] == "unknown"
    assert courses["test-cloud"]["image_url"] is None  # generic partner grid is not course art
    assert courses["test-ux"]["languages"] == ["Spanish"]


def test_skills_detected_only_from_text(mini):
    courses, _ = mini
    assert "sql" in courses["test-sql"]["skills"]
    assert "ux-design" in courses["test-ux"]["skills"]
    assert courses["test-sql"]["skills_source"] == "detected_from_course_text"


@pytest.mark.parametrize(
    "raw,bucket,hours,months",
    [
        ("Approx. 7 hours to complete", "short", 7.0, None),
        ("Approx. 14 hours to complete", "medium", 14.0, None),
        ("Approx. 81 hours to complete", "long", 81.0, None),
        ("Approximately 1 month to complete", "long", None, 1.0),
        ("Approximately 6 months to complete", "extended", None, 6.0),
        (None, None, None, None),
        ("Self-paced", None, None, None),
    ],
)
def test_parse_duration(raw, bucket, hours, months):
    parsed = parse_duration(raw)
    assert parsed["duration_bucket"] == bucket
    assert parsed["duration_hours"] == hours
    assert parsed["duration_months"] == months


def test_parse_price_and_url_helpers():
    assert parse_price("free") == ("free", True)
    assert parse_price("Enroll") == ("not_listed", None)
    assert parse_price(None) == ("unknown", None)
    assert canonical_url("not a url") is None
    assert canonical_url("ftp://x.org/a") is None
    assert canonical_url("HTTPS://WWW.Coursera.org/learn/x/?ref=1#top") == "https://www.coursera.org/learn/x"


def test_syllabus_noise_removed():
    modules, text = parse_syllabus("Intro ~.~ Welcome to the course. ~.~ SHOW ALL SYLLABUS ~.~ SHOW ALL ~.~ Joins")
    assert "SHOW ALL" not in text and modules == ["Intro", "Joins"]


def test_pipeline_writes_files_and_keeps_original_unchanged(tmp_path):
    src = FIXTURES / "mini_courses.csv"
    before = file_sha256(src)
    report = run_preprocessing(src, tmp_path / "catalog.json", tmp_path / "report.json")
    assert file_sha256(src) == before
    payload = json.loads((tmp_path / "catalog.json").read_text(encoding="utf-8"))
    assert payload["meta"]["record_count"] == report["output_records"] == 4
    assert payload["meta"]["is_sample"] is False


@pytest.mark.skipif(not RAW_CSV.exists(), reason="raw Coursera CSV not present")
def test_real_dataset_is_reproducible(tmp_path):
    before = file_sha256(RAW_CSV)
    a = run_preprocessing(RAW_CSV, tmp_path / "a.json", tmp_path / "ra.json")
    b = run_preprocessing(RAW_CSV, tmp_path / "b.json", tmp_path / "rb.json")
    assert file_sha256(RAW_CSV) == before
    ca = json.loads((tmp_path / "a.json").read_text(encoding="utf-8"))["courses"]
    cb = json.loads((tmp_path / "b.json").read_text(encoding="utf-8"))["courses"]
    assert ca == cb
    assert 100 <= a["output_records"] <= 200
    assert len({c["id"] for c in ca}) == len(ca)
    assert len({c["url"] for c in ca}) == len(ca)
    assert all(c["url"].startswith("https://") for c in ca)
    assert all(c["prerequisites"] is None for c in ca)  # source has no prerequisites: none invented
    assert all(c["review_count"] is None for c in ca)  # source has no review counts: none invented
