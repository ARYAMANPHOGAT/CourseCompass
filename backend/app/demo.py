"""Seed clearly labelled DEMO activity so analytics can be shown in a presentation.

Every record created here has demo=true. Analytics reports how many demo records are
included and the Settings page can remove them all without touching real user data.
Seeding is deterministic (fixed random seed) relative to the current date.
"""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

DEMO_SEED = 2024


def _at(day: date, hour: int = 19) -> str:
    return datetime.combine(day, time(hour, 0), tzinfo=timezone.utc).isoformat()


def seed_demo(services, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    repo = services.repo
    snapshot = repo.snapshot()
    taken = set(snapshot["enrollments"]) | {w["course_id"] for w in snapshot["wishlist"]} | set(snapshot["feedback"])
    recs = services.recommender.recommend(snapshot, mode="content", limit=20)
    candidates = [r["course"]["id"] for r in recs["results"] if r["course"]["id"] not in taken]
    if len(candidates) < 6:
        extra = sorted(services.catalog.courses, key=lambda c: (-(c.get("rating") or 0), c["id"]))
        candidates += [c["id"] for c in extra if c["id"] not in taken and c["id"] not in candidates]
    if len(candidates) < 4:
        return {"seeded": False, "reason": "Not enough unused courses to seed demo activity."}
    rng = random.Random(DEMO_SEED)
    plan = [
        (candidates[0], 34, "complete"),
        (candidates[1], 24, 0.6),
        (candidates[2], 12, 0.3),
        (candidates[3], 3, 0.0),
    ]
    created = {"enrollments": 0, "sessions": 0, "wishlist": 0, "feedback": 0}
    for course_id, days_ago, target in plan:
        start = today - timedelta(days=days_ago)
        total, source = services.default_lessons(course_id)
        target_date = (today + timedelta(days=21 + days_ago)).isoformat() if target != "complete" else None
        repo.enroll(course_id, total, source, target_date, demo=True, at=_at(start, 9))
        created["enrollments"] += 1
        goal_lessons = total if target == "complete" else int(round(total * float(target)))
        done = 0
        day = start
        keep_studying = target not in ("complete", 0.0)  # in-progress courses stay active up to today
        while day <= today:
            recent = keep_studying and day >= today - timedelta(days=6)
            if done >= goal_lessons and not recent:
                if not keep_studying:
                    break
                day += timedelta(days=1)
                continue
            if rng.random() < 0.55 or (keep_studying and day >= today - timedelta(days=2)):
                minutes = rng.choice([25, 30, 40, 45, 60, 75, 90])
                lessons = 1 if rng.random() < 0.7 else 0
                lessons = max(0, min(lessons, goal_lessons - done))
                repo.add_session(course_id, day.isoformat(), minutes, lessons, "Demo study session", demo=True,
                                 at=_at(day, 20))
                created["sessions"] += 1
                if lessons:
                    done += lessons
                    repo.update_enrollment(course_id, {"completed_lessons": done}, demo=True, at=_at(day, 20))
            day += timedelta(days=1)
        if target == "complete":
            repo.update_enrollment(course_id, {"state": "completed"}, demo=True, at=_at(min(today, day), 21))
    for course_id in candidates[4:6]:
        repo.add_wishlist(course_id, "Saved in demo mode", demo=True)
        created["wishlist"] += 1
    repo.set_feedback(candidates[0], "relevant", 5, demo=True)
    created["feedback"] += 1
    repo.log_activity("demo_seeded", detail=created, demo=True)
    return {"seeded": True, "created": created, "courses": [p[0] for p in plan]}
