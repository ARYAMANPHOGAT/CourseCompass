"""API endpoints, invalid requests and the full end-to-end user journey (incl. restart)."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.main import create_app
from app.services import AppServices
from app.storage import UserRepository


def test_health_and_docs(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["catalog_records"] > 0
    assert client.get("/openapi.json").status_code == 200


def test_cors_allows_vite_dev_origin(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_search_filter_sort_paginate(client):
    r = client.get("/api/courses", params={"q": "python", "page_size": 5})
    body = r.json()
    assert r.status_code == 200 and body["total"] > 0 and len(body["items"]) <= 5
    assert any("python" in i["title"].lower() for i in body["items"])
    r = client.get("/api/courses", params={"content_type": "guided_project"})
    assert all(i["content_type"] == "guided_project" for i in r.json()["items"])
    r = client.get("/api/courses", params={"free_only": True, "min_rating": 4.8, "sort": "rating", "page_size": 60})
    ratings = [i["rating"] for i in r.json()["items"]]
    assert ratings == sorted(ratings, reverse=True) and min(ratings) >= 4.8
    r = client.get("/api/courses", params={"level": "beginner", "page": 2, "page_size": 10})
    assert r.json()["page"] == 2 and all(i["level"] == "beginner" for i in r.json()["items"])
    assert client.get("/api/courses", params={"q": "qqqzzzxx"}).json()["total"] == 0
    assert "categories" in client.get("/api/courses").json()["facets"]


def test_invalid_requests_return_clean_errors(client):
    r = client.get("/api/courses/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "course_not_found"
    r = client.get("/api/courses", params={"page_size": 1000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert "Traceback" not in r.text and "/home" not in r.text and "C:\\" not in r.text
    assert client.post("/api/wishlist", json={"course_id": "nope"}).status_code == 404
    assert client.post("/api/wishlist", json={}).status_code == 422
    assert client.post("/api/learning", json={"course_id": "sql-for-data-science", "total_lessons": 0}).status_code == 422
    assert client.post("/api/learning/sql-for-data-science/sessions", json={"minutes": 30}).status_code == 409
    assert client.post("/api/feedback", json={"course_id": "sql-for-data-science"}).status_code == 422
    assert client.put("/api/goals", json={"weekly_hours_target": -1}).status_code == 422
    assert client.post("/api/system/reset", json={"confirm": False}).status_code == 400
    assert client.post("/api/courses/compare", json={"course_ids": ["sql-for-data-science"]}).status_code == 422
    assert client.get("/api/roadmap").status_code == 400
    assert client.get("/api/roadmap", params={"career_goal": "pirate"}).status_code == 404


def test_lesson_and_session_validation(client):
    cid = "sql-for-data-science"
    assert client.post("/api/learning", json={"course_id": cid, "total_lessons": 4}).status_code == 201
    assert client.post("/api/learning", json={"course_id": cid}).status_code == 409
    assert client.patch(f"/api/learning/{cid}", json={"completed_lessons": 5}).status_code == 422
    assert client.post(f"/api/learning/{cid}/sessions", json={"minutes": 0}).status_code == 422
    assert client.post(f"/api/learning/{cid}/sessions", json={"minutes": 30, "date": "2999-01-01"}).status_code == 422
    r = client.post(f"/api/learning/{cid}/sessions", json={"minutes": 30, "lessons_completed": 10})
    assert r.status_code == 201
    e = client.get("/api/learning").json()[0]
    assert e["completed_lessons"] == 4 and e["status"] == "completed"  # capped at total, auto-complete
    assert client.delete(f"/api/learning/{cid}").status_code == 400  # needs confirm
    assert client.delete(f"/api/learning/{cid}", params={"confirm": True}).status_code == 204


def test_full_user_journey_with_restart(services, analyst_profile, tmp_path):
    client = TestClient(create_app(services=services))
    # 1. launch + load catalog
    assert client.get("/api/health").json()["catalog_records"] == len(services.catalog)
    taxonomy = client.get("/api/meta/taxonomy").json()
    assert taxonomy["career_goals"] and taxonomy["skills"]
    # 2. edit preferences
    r = client.put("/api/profile", json=analyst_profile)
    assert r.status_code == 200 and r.json()["onboarded"] is True
    # 3. recommendations (cold start -> content fallback) with explanations
    rec = client.get("/api/recommendations", params={"limit": 6}).json()
    assert rec["method_used"] == "content_fallback" and len(rec["results"]) == 6
    first = rec["results"][0]
    assert first["explanation"]["summary"] and first["components"]
    a, b, c = (x["course"]["id"] for x in rec["results"][:3])
    # 4. search / filter / sort with match scores
    found = client.get("/api/courses", params={"q": "sql", "sort": "match"}).json()
    assert found["personalized"] is True and found["items"][0]["match_percent"] is not None
    # 5. compare
    cmp = client.post("/api/courses/compare", json={"course_ids": [a, b, c]}).json()
    assert len(cmp["items"]) == 3 and len(cmp["content_similarity"]) == 3
    # 6. save, enrol, log study time, update lessons
    assert client.post("/api/wishlist", json={"course_id": a}).status_code == 201
    r = client.post("/api/learning", json={"course_id": b, "total_lessons": 6,
                                            "target_date": (date.today() + timedelta(days=30)).isoformat()})
    assert r.status_code == 201
    assert client.post(f"/api/learning/{b}/sessions", json={"minutes": 50, "lessons_completed": 2}).status_code == 201
    r = client.patch(f"/api/learning/{b}", json={"completed_lessons": 3})
    assert r.json()["progress"]["percent"] == 50.0
    # 7. goals + roadmap milestone
    assert client.put("/api/goals", json={"weekly_hours_target": 3, "weekly_sessions_target": 2}).status_code == 200
    roadmap = client.get("/api/roadmap").json()
    stage = roadmap["stages"][0]["id"]
    assert client.patch(f"/api/roadmap/data-analyst/milestones/{stage}", json={"completed": True}).status_code == 200
    # 8. feedback changes the ranking inputs -> hybrid now available
    assert client.post("/api/feedback", json={"course_id": c, "kind": "relevant", "rating": 5}).status_code == 200
    rec2 = client.get("/api/recommendations", params={"limit": 6}).json()
    assert rec2["method_used"] == "hybrid" and rec2["cf_status"]["user_interactions"] >= 2
    assert b not in {x["course"]["id"] for x in rec2["results"]}  # enrolled courses excluded
    # 9. analytics reflect the activity
    an = client.get("/api/analytics").json()
    assert an["totals"]["total_minutes"] == 50 and an["totals"]["enrolled"] == 1
    assert an["weekly_goal"]["done_hours"] > 0
    assert an["recent_activity"]
    # 10. restart backend (new app + new repository on the same folder) -> data persisted
    restarted_services = AppServices.__new__(AppServices)
    restarted_services.__dict__.update(services.__dict__)
    restarted_services.repo = UserRepository(services.settings.user_data_dir)
    client2 = TestClient(create_app(services=restarted_services))
    assert client2.get("/api/profile").json()["career_goal"] == "data-analyst"
    assert [w["course_id"] for w in client2.get("/api/wishlist").json()] == [a]
    learning = client2.get("/api/learning").json()
    assert learning[0]["course_id"] == b and learning[0]["completed_lessons"] == 3
    assert client2.get("/api/analytics").json()["totals"]["total_minutes"] == 50
    road2 = client2.get("/api/roadmap").json()
    assert road2["stages"][0]["status"] == "completed"
    assert client2.get("/api/goals").json()["weekly_hours_target"] == 3


def test_demo_seed_is_labelled_and_removable(client, analyst_profile):
    client.put("/api/profile", json=analyst_profile)
    client.post("/api/wishlist", json={"course_id": "sql-for-data-science"})
    seeded = client.post("/api/system/demo/seed").json()
    assert seeded["seeded"] is True
    an = client.get("/api/analytics").json()
    assert an["demo"]["includes_demo_data"] is True and an["totals"]["total_minutes"] > 0
    removed = client.post("/api/system/demo/clear", json={"confirm": True}).json()["removed"]
    assert removed["sessions"] > 0
    an = client.get("/api/analytics").json()
    assert an["demo"]["includes_demo_data"] is False and an["totals"]["total_minutes"] == 0
    assert [w["course_id"] for w in client.get("/api/wishlist").json()] == ["sql-for-data-science"]


def test_evaluation_and_system_info(client):
    ev = client.get("/api/evaluation").json()
    assert ev["dataset"]["synthetic"] is True and "hybrid" in ev["results"]
    info = client.get("/api/system/info").json()
    assert info["catalog"]["record_count"] > 0 and "provenance_note" in info["catalog"]["meta"]
    assert info["synthetic_cohort"]["synthetic"] is True


def test_preview_does_not_change_profile(client):
    r = client.get("/api/recommendations/preview", params={"career_goal": "ux-designer", "limit": 3})
    assert r.status_code == 200 and len(r.json()["results"]) == 3
    assert any("ux-design" in x["course"]["skills"] for x in r.json()["results"])
    assert client.get("/api/profile").json()["career_goal"] is None
    assert client.get("/api/recommendations/preview", params={"career_goal": "nope"}).status_code == 404


def test_explain_endpoint(client, analyst_profile):
    client.put("/api/profile", json=analyst_profile)
    r = client.get("/api/recommendations/explain/sql-for-data-science").json()
    assert r["course"]["id"] == "sql-for-data-science" and r["explanation"]["reasons"]
