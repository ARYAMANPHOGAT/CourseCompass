"""Central configuration: project-relative paths and recommender settings.

All paths are resolved relative to the backend folder so the project works from any
location on disk (no machine-specific paths). The user-data directory can be
overridden with the COURSECOMPASS_USER_DATA_DIR environment variable (used by tests).
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger("coursecompass")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
RAW_CSV = DATA_DIR / "raw" / "webautomation_coursera.csv"
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_CATALOG = PROCESSED_DIR / "catalog.json"
PREPROCESS_REPORT = PROCESSED_DIR / "preprocessing_report.json"
EVALUATION_REPORT = PROCESSED_DIR / "evaluation_report.json"
SAMPLE_CATALOG = DATA_DIR / "sample" / "sample_catalog.json"
SYNTHETIC_INTERACTIONS = DATA_DIR / "demo" / "synthetic_interactions.json"
RECOMMENDER_CONFIG = BACKEND_DIR / "config" / "recommender.json"
DEFAULT_USER_DATA_DIR = DATA_DIR / "user"

# Default recommender configuration. backend/config/recommender.json overrides these values.
DEFAULT_RECOMMENDER_CONFIG: dict[str, Any] = {
    "preference_weights": {
        "content": 0.30,
        "goal": 0.25,
        "skill_fit": 0.10,
        "difficulty": 0.12,
        "duration": 0.10,
        "budget": 0.08,
        "quality": 0.05,
    },
    "hybrid": {
        "collaborative_weight_max": 0.30,
        "full_confidence_interactions": 5,
        "min_user_interactions": 2,
    },
    "collaborative": {
        "neighbors": 20,
        "shrinkage": 5.0,
        "min_item_support": 2,
    },
    "rocchio": {"alpha": 1.0, "beta_positive": 0.6, "gamma_negative": 0.4},
    "interaction_weights": {
        "save": 1.0,
        "enroll": 2.0,
        "complete": 3.0,
        "relevant": 2.0,
        "irrelevant": -2.0,
        "previously_studied": 2.0,
        "rating_per_star_from_3": 1.0,
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_recommender_config(path: Path | None = None) -> dict[str, Any]:
    """Load recommender weights; fall back to defaults if the file is missing/invalid."""
    path = path or RECOMMENDER_CONFIG
    if not path.exists():
        return json.loads(json.dumps(DEFAULT_RECOMMENDER_CONFIG))
    try:
        with path.open("r", encoding="utf-8") as fh:
            user_cfg = json.load(fh)
        return _deep_merge(DEFAULT_RECOMMENDER_CONFIG, user_cfg)
    except (OSError, json.JSONDecodeError) as exc:  # pragma: no cover - defensive
        logger.warning("Invalid recommender config (%s); using defaults.", exc)
        return json.loads(json.dumps(DEFAULT_RECOMMENDER_CONFIG))


@dataclass
class Settings:
    """Runtime settings. Tests create Settings with temporary directories."""

    raw_csv: Path = RAW_CSV
    processed_catalog: Path = PROCESSED_CATALOG
    preprocess_report: Path = PREPROCESS_REPORT
    evaluation_report: Path = EVALUATION_REPORT
    sample_catalog: Path = SAMPLE_CATALOG
    synthetic_interactions: Path = SYNTHETIC_INTERACTIONS
    user_data_dir: Path = field(
        default_factory=lambda: Path(os.environ.get("COURSECOMPASS_USER_DATA_DIR", DEFAULT_USER_DATA_DIR))
    )
    recommender: dict[str, Any] = field(default_factory=load_recommender_config)
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.environ.get(
                "COURSECOMPASS_CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
            ).split(",")
            if o.strip()
        ]
    )
