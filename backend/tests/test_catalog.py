"""Catalog fallback chain: processed JSON -> rebuild from CSV -> bundled sample."""
from __future__ import annotations

from app.catalog import load_catalog
from app.config import SAMPLE_CATALOG, Settings
from app.services import AppServices

from .conftest import FIXTURES


def test_rebuilds_from_raw_csv_when_processed_missing(tmp_path):
    settings = Settings(raw_csv=FIXTURES / "mini_courses.csv", processed_catalog=tmp_path / "catalog.json",
                        preprocess_report=tmp_path / "report.json", user_data_dir=tmp_path / "user")
    catalog = load_catalog(settings)
    assert catalog.source_kind == "dataset" and len(catalog) == 4
    assert (tmp_path / "catalog.json").exists()


def test_corrupt_processed_catalog_is_rebuilt(tmp_path):
    bad = tmp_path / "catalog.json"
    bad.write_text("{oops", encoding="utf-8")
    settings = Settings(raw_csv=FIXTURES / "mini_courses.csv", processed_catalog=bad,
                        preprocess_report=tmp_path / "report.json", user_data_dir=tmp_path / "user")
    catalog = load_catalog(settings)
    assert len(catalog) == 4 and catalog.load_notes


def test_sample_catalog_used_when_no_dataset(tmp_path):
    settings = Settings(raw_csv=tmp_path / "missing.csv", processed_catalog=tmp_path / "missing.json",
                        preprocess_report=tmp_path / "r.json", sample_catalog=SAMPLE_CATALOG,
                        user_data_dir=tmp_path / "user", synthetic_interactions=tmp_path / "synthetic.json",
                        evaluation_report=tmp_path / "eval.json")
    svc = AppServices(settings)
    assert svc.catalog.source_kind == "sample"
    assert all(c["title"].startswith("[Sample]") and c["url"] is None for c in svc.catalog.courses)
    rec = svc.recommender.recommend(svc.repo.snapshot(), limit=3)
    assert len(rec["results"]) == 3
    assert svc.cohort_status == "generated_in_memory"  # sample data never overwrites demo files
    assert not (tmp_path / "synthetic.json").exists()
