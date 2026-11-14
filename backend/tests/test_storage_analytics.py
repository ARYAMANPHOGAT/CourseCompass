"""JSON persistence safety, analytics calculations and the roadmap."""
from __future__ import annotations

import json
from datetime import date, timedelta

from app.analytics import compute_analytics, enrollment_status, progress_percent, streaks
from app.roadmap import build_roadmap
from app.storage import UserRepository


def test_atomic_write_persists_across_instances(tmp_path):
    repo = UserRepository(tmp_path)
    repo.add_wishlist("course-a")
    repo.enroll("course-a", 8, "user", None)
    again = UserRepository(tmp_path)
    assert [w["course_id"] for w in again.list_wishlist()] == ["course-a"]
    assert again.get_enrollment("course-a")["total_lessons"] == 8
    assert not list(tmp_path.glob("*.tmp"))


def test_malformed_json_is_backed_up_not_discarded(tmp_path):
    repo = UserRepository(tmp_path)
    (tmp_path / "wishlist.json").write_text("{ this is not json", encoding="utf-8")
    assert repo.list_wishlist() == []
    backups = list(tmp_path.glob("wishlist.corrupt-*.json"))
    assert len(backups) == 1 and "not json" in backups[0].read_text(encoding="utf-8")
    assert "wishlist.json" in repo.recovered_files


def test_wrong_shape_is_recovered(tmp_path):
    (tmp_path / "sessions.json").write_text(json.dumps([1, 2, 3]), encoding="utf-8")
    repo = UserRepository(tmp_path)
    assert repo.list_sessions() == []
    assert list(tmp_path.glob("sessions.corrupt-*.json"))


def test_reset_backs_up_first(tmp_path):
    repo = UserRepository(tmp_path)
    repo.add_wishlist("course-a")
    backup = repo.reset_all()
    assert repo.list_wishlist() == []
    saved = json.loads((backup / "wishlist.json").read_text(encoding="utf-8"))
    assert saved["items"][0]["course_id"] == "course-a"


def test_clear_demo_only_removes_demo_records(tmp_path):
    repo = UserRepository(tmp_path)
    repo.add_wishlist("real")
    repo.add_wishlist("fake", demo=True)
    repo.enroll("demo-course", 5, "default_estimate", None, demo=True)
    repo.enroll("adopted", 5, "default_estimate", None, demo=True)
    repo.update_enrollment("adopted", {"completed_lessons": 1})  # user edit adopts demo record
    removed = repo.clear_demo_data()
    assert removed["wishlist"] == 1 and removed["enrollments"] == 1
    assert [w["course_id"] for w in repo.list_wishlist()] == ["real"]
    assert set(repo.list_enrollments()) == {"adopted"}


def test_completion_sets_lessons_and_timestamps(tmp_path):
    repo = UserRepository(tmp_path)
    repo.enroll("c", 4, "user", None)
    e = repo.update_enrollment("c", {"state": "completed"})
    assert e["completed_lessons"] == 4 and e["completed_at"]
    e = repo.update_enrollment("c", {"state": "paused"})
    assert e["completed_at"] is None and e["paused_at"]


def test_status_and_progress_helpers():
    assert enrollment_status({"state": "active", "completed_lessons": 0}, 0) == "not_started"
    assert enrollment_status({"state": "active", "completed_lessons": 0}, 30) == "in_progress"
    assert enrollment_status({"state": "paused", "completed_lessons": 2}, 0) == "paused"
    assert enrollment_status({"state": "completed"}, 0) == "completed"
    assert progress_percent({"state": "active", "completed_lessons": 3, "total_lessons": 4}) == 75.0
    assert progress_percent({"state": "active", "completed_lessons": 3, "total_lessons": 0}) == 0.0


def test_streaks():
    today = date(2026, 10, 28)
    days = {today, today - timedelta(days=1), today - timedelta(days=2), today - timedelta(days=10), today - timedelta(days=11)}
    assert streaks(days, today) == (3, 3)
    assert streaks({today - timedelta(days=1)}, today) == (1, 1)  # yesterday keeps streak alive
    assert streaks({today - timedelta(days=3)}, today) == (0, 1)
    assert streaks(set(), today) == (0, 0)


def test_analytics_from_persisted_data(services):
    today = date.today()
    repo = services.repo
    cid = "sql-for-data-science"
    repo.enroll(cid, 4, "user", (today + timedelta(days=10)).isoformat())
    repo.add_session(cid, today.isoformat(), 90, 1, None)
    repo.add_session(cid, (today - timedelta(days=1)).isoformat(), 30, 0, None)
    repo.update_enrollment(cid, {"completed_lessons": 1})
    repo.save_goals({"weekly_hours_target": 4, "weekly_sessions_target": 2})
    a = compute_analytics(repo.snapshot(), services.catalog, today)
    assert a["totals"]["total_minutes"] == 120
    assert a["totals"]["in_progress"] == 1
    assert a["totals"]["current_streak"] >= 1
    this_week = sum(1 for d in (today, today - timedelta(days=1)) if d >= today - timedelta(days=today.weekday()))
    assert a["weekly_goal"]["done_sessions"] == this_week
    assert a["daily_activity"][-1]["minutes"] == 90
    assert a["progress_over_time"][-1]["completed_lessons"] == 1
    assert any(r["value"] > 0 for r in a["skill_radar"])
    assert a["course_targets"][0]["course_id"] == cid
    assert a["demo"]["includes_demo_data"] is False


def test_empty_analytics_has_zeroes_not_fake_values(services):
    a = compute_analytics(services.repo.snapshot(), services.catalog)
    assert a["totals"]["total_minutes"] == 0 and a["totals"]["enrolled"] == 0
    assert all(w["minutes"] == 0 for w in a["weekly_activity"])
    assert all(r["value"] == 0 for r in a["skill_radar"])
    assert a["recent_activity"] == [] or all(not r["demo"] for r in a["recent_activity"])


def test_roadmap_statuses_and_auto_completion(services):
    snap = services.repo.snapshot()
    scores, _ = services.recommender.match_scores(snap, "content")
    rm = build_roadmap("data-analyst", services.catalog, scores, snap, services.repo.get_roadmap_state("data-analyst"))
    assert [s["status"] for s in rm["stages"]] == ["current", "upcoming", "upcoming", "upcoming"]
    assert "does not guarantee" in rm["disclaimer"]
    first_course = rm["stages"][0]["courses"][0]["course"]["id"]
    services.repo.enroll(first_course, 3, "user", None)
    services.repo.update_enrollment(first_course, {"state": "completed"})
    services.repo.set_milestone("data-analyst", "da-2", True)
    snap = services.repo.snapshot()
    rm = build_roadmap("data-analyst", services.catalog, scores, snap, services.repo.get_roadmap_state("data-analyst"))
    statuses = [s["status"] for s in rm["stages"]]
    assert statuses[:3] == ["completed", "completed", "current"]
    assert rm["stages"][0]["completion_source"] == "course_completed"
    assert rm["stages"][1]["completion_source"] == "manual"
    assert rm["next_course"]["stage"] == rm["stages"][2]["title"]
