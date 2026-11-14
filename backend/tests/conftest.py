"""Shared pytest fixtures. Every test gets its own temporary user-data folder; the real
data/user folder is never touched by the test suite."""
from __future__ import annotations

import copy
import warnings
from pathlib import Path

import pytest

warnings.filterwarnings("ignore", category=DeprecationWarning)

from fastapi.testclient import TestClient  # noqa: E402

from app.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services import AppServices  # noqa: E402
from app.storage import UserRepository  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def session_tmp(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("session")


@pytest.fixture(scope="session")
def base_services(session_tmp: Path) -> AppServices:
    """Catalog, TF-IDF index and CF model are built once per test session."""
    settings = Settings(user_data_dir=session_tmp / "user", evaluation_report=session_tmp / "evaluation_report.json")
    return AppServices(settings)


@pytest.fixture()
def services(base_services: AppServices, tmp_path: Path) -> AppServices:
    """Same models, but a fresh, empty user repository for every test."""
    svc = copy.copy(base_services)
    svc.settings = copy.copy(base_services.settings)
    svc.settings.user_data_dir = tmp_path / "user"
    svc.settings.evaluation_report = tmp_path / "evaluation_report.json"
    svc.repo = UserRepository(svc.settings.user_data_dir)
    return svc


@pytest.fixture()
def client(services: AppServices) -> TestClient:
    return TestClient(create_app(services=services))


DATA_ANALYST_PROFILE = {
    "display_name": "Test Student",
    "career_goal": "data-analyst",
    "skill_level": "beginner",
    "topics": ["Data Analysis"],
    "existing_skills": ["excel"],
    "objectives": "Learn SQL and data visualization to analyse business data",
    "preferred_difficulty": "beginner",
    "weekly_hours": 6,
    "budget": "free_only",
    "preferred_duration": "medium",
    "languages": ["English"],
}


@pytest.fixture()
def analyst_profile() -> dict:
    return copy.deepcopy(DATA_ANALYST_PROFILE)
