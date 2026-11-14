"""Application service container: catalog, indexes, models and storage, built once."""
from __future__ import annotations

import logging
import threading
from typing import Any

from .catalog import Catalog, load_catalog
from .config import Settings
from .evaluation import run_evaluation
from .jsonio import atomic_write_json, read_json
from .recommender import ContentIndex, ItemKNN, Recommender
from .storage import UserRepository
from .synthetic import generate_cohort

logger = logging.getLogger("coursecompass.services")

DEFAULT_LESSONS = 10


def load_cohort(settings: Settings, catalog: Catalog) -> tuple[dict[str, Any], str]:
    """Load the synthetic cohort, regenerating it if it does not match the catalog."""
    path = settings.synthetic_interactions
    if path.exists():
        try:
            cohort = read_json(path)
            interactions = cohort.get("interactions") or []
            known = sum(1 for it in interactions if it.get("course_id") in catalog.by_id)
            if interactions and known / len(interactions) >= 0.8:
                return cohort, "loaded"
        except (OSError, ValueError):
            logger.warning("Synthetic cohort file unreadable; regenerating.")
    cohort = generate_cohort(catalog.courses, weights=settings.recommender["interaction_weights"])
    if catalog.source_kind == "dataset":
        atomic_write_json(path, cohort, indent=1)
        return cohort, "generated"
    return cohort, "generated_in_memory"


class AppServices:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or Settings()
        self.catalog = load_catalog(self.settings)
        self.content = ContentIndex(self.catalog.courses)
        self.cohort, self.cohort_status = load_cohort(self.settings, self.catalog)
        cf_cfg = self.settings.recommender["collaborative"]
        interactions = [(i["user_id"], i["course_id"], float(i["strength"])) for i in self.cohort["interactions"]]
        self.cf = ItemKNN([c["id"] for c in self.catalog.courses], interactions, cf_cfg["neighbors"],
                          cf_cfg["shrinkage"], cf_cfg["min_item_support"])
        self.recommender = Recommender(self.catalog, self.content, self.cf, self.settings.recommender)
        self.repo = UserRepository(self.settings.user_data_dir)
        self._eval_lock = threading.Lock()

    # -------------------------------------------------------------- lessons
    def default_lessons(self, course_id: str) -> tuple[int, str]:
        course = self.catalog.get(course_id) or {}
        count = course.get("module_count")
        if count:
            return int(count), "estimated_from_syllabus_modules"
        return DEFAULT_LESSONS, "default_estimate"

    # -------------------------------------------------------------- evaluation
    def run_evaluation(self) -> dict[str, Any]:
        with self._eval_lock:
            report = run_evaluation(self.catalog, self.content, self.cohort, self.settings.recommender)
            atomic_write_json(self.settings.evaluation_report, report)
            return report

    def get_evaluation(self) -> dict[str, Any] | None:
        path = self.settings.evaluation_report
        if not path.exists():
            return None
        try:
            report = read_json(path)
        except (OSError, ValueError):
            return None
        if report.get("dataset", {}).get("catalog_size") != len(self.catalog):
            return None
        return report

    # -------------------------------------------------------------- info
    def system_info(self) -> dict[str, Any]:
        report: dict[str, Any] | None = None
        if self.settings.preprocess_report.exists():
            try:
                report = read_json(self.settings.preprocess_report)
            except (OSError, ValueError):
                report = None
        return {
            "catalog": {
                "source_kind": self.catalog.source_kind,
                "record_count": len(self.catalog),
                "meta": self.catalog.meta,
                "load_notes": self.catalog.load_notes,
                "facets": self.catalog.facets(),
            },
            "preprocessing": report,
            "synthetic_cohort": {**self.cohort.get("meta", {}), "status": self.cohort_status},
            "recommender_config": self.settings.recommender,
            "storage": {
                "backend": "local JSON files",
                "recovered_files": self.repo.recovered_files,
                "demo_records": self.repo.demo_counts(),
            },
        }
