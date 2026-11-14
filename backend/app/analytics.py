"""Learning analytics computed exclusively from persisted user data.

Nothing here is hard-coded: every number is derived from data/user/*.json. Records
created by "Seed demo activity" carry demo=true and the response reports how many of
them are included so the UI can label demo data clearly.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from .taxonomy import SKILL_BY_ID, SKILL_GROUPS

ACTIVITY_TEXT = {
    "enrolled": "Enrolled in",
    "unenrolled": "Removed from My Learning:",
    "progress_updated": "Updated progress on",
    "status_changed": "Changed status of",
    "session_logged": "Logged a study session for",
    "session_deleted": "Deleted a study session for",
    "wishlist_added": "Saved",
    "wishlist_removed": "Removed from wishlist:",
    "feedback": "Gave feedback on",
    "feedback_cleared": "Cleared feedback on",
    "milestone_completed": "Completed a roadmap milestone",
    "milestone_reopened": "Reopened a roadmap milestone",
    "goal_updated": "Updated weekly goal",
    "profile_updated": "Updated preferences",
    "profile_reset": "Reset preferences",
}


def enrollment_status(enrollment: dict[str, Any], minutes: int) -> str:
    state = enrollment.get("state")
    if state == "completed":
        return "completed"
    if state == "paused":
        return "paused"
    if enrollment.get("completed_lessons", 0) == 0 and minutes == 0:
        return "not_started"
    return "in_progress"


def progress_percent(enrollment: dict[str, Any]) -> float:
    if enrollment.get("state") == "completed":
        return 100.0
    total = enrollment.get("total_lessons") or 0
    if total <= 0:
        return 0.0
    return round(100.0 * min(enrollment.get("completed_lessons", 0), total) / total, 1)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def streaks(days: set[date], today: date) -> tuple[int, int]:
    """(current streak, longest streak) in consecutive study days."""
    if not days:
        return 0, 0
    current = 0
    cursor = today if today in days else today - timedelta(days=1)
    while cursor in days:
        current += 1
        cursor -= timedelta(days=1)
    longest = 0
    run = 0
    prev: date | None = None
    for d in sorted(days):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        longest = max(longest, run)
        prev = d
    return current, longest


def compute_analytics(snapshot: dict[str, Any], catalog, today: date | None = None) -> dict[str, Any]:
    today = today or date.today()
    sessions = snapshot["sessions"]
    enrollments = snapshot["enrollments"]
    goals = snapshot["goals"]
    activity = snapshot["activity"]
    feedback = snapshot["feedback"]

    minutes_by_course: dict[str, int] = defaultdict(int)
    minutes_by_day: dict[date, int] = defaultdict(int)
    sessions_by_day: dict[date, int] = defaultdict(int)
    for s in sessions:
        d = _parse_date(s.get("date"))
        if not d:
            continue
        minutes_by_course[s["course_id"]] += int(s.get("minutes", 0))
        minutes_by_day[d] += int(s.get("minutes", 0))
        sessions_by_day[d] += 1
    total_minutes = sum(minutes_by_day.values())

    statuses: dict[str, int] = {"not_started": 0, "in_progress": 0, "paused": 0, "completed": 0}
    per_course: list[dict[str, Any]] = []
    for cid, e in enrollments.items():
        status = enrollment_status(e, minutes_by_course.get(cid, 0))
        statuses[status] += 1
        course = catalog.get(cid)
        per_course.append({
            "course_id": cid,
            "title": course["title"] if course else cid,
            "status": status,
            "progress_percent": progress_percent(e),
            "minutes": minutes_by_course.get(cid, 0),
        })

    week_start = today - timedelta(days=today.weekday())
    target_hours = float(goals.get("weekly_hours_target") or 0)
    target_sessions = int(goals.get("weekly_sessions_target") or 0)

    weekly = []
    for w in range(11, -1, -1):
        start = week_start - timedelta(weeks=w)
        mins = sum(minutes_by_day.get(start + timedelta(days=d), 0) for d in range(7))
        count = sum(sessions_by_day.get(start + timedelta(days=d), 0) for d in range(7))
        weekly.append({
            "week_start": start.isoformat(),
            "label": start.strftime("%b %d"),
            "minutes": mins,
            "hours": round(mins / 60, 2),
            "sessions": count,
            "goal_met": target_hours > 0 and mins >= target_hours * 60,
        })
    this_week = weekly[-1]

    monthly = []
    year, month = today.year, today.month
    months = []
    for _ in range(6):
        months.append((year, month))
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    for y, m in reversed(months):
        mins = sum(v for d, v in minutes_by_day.items() if d.year == y and d.month == m)
        count = sum(v for d, v in sessions_by_day.items() if d.year == y and d.month == m)
        monthly.append({"month": f"{y}-{m:02d}", "label": date(y, m, 1).strftime("%b %Y"), "minutes": mins,
                        "hours": round(mins / 60, 2), "sessions": count})

    daily = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        daily.append({"date": d.isoformat(), "label": d.strftime("%a %d"), "minutes": minutes_by_day.get(d, 0),
                      "hours": round(minutes_by_day.get(d, 0) / 60, 2)})

    # Progress over time: replay progress events (absolute lesson counts per course).
    events = sorted(
        [a for a in activity if a.get("type") == "progress_updated" and a.get("course_id") in enrollments],
        key=lambda a: a.get("at") or "",
    )
    latest: dict[str, int] = {}
    progress_series = []
    start_day = today - timedelta(days=29)
    idx = 0
    for i in range(30):
        day = start_day + timedelta(days=i)
        while idx < len(events):
            at = _parse_dt(events[idx].get("at"))
            if at is None or at.date() <= day:
                latest[events[idx]["course_id"]] = int(events[idx]["detail"].get("completed_lessons", 0))
                idx += 1
            else:
                break
        progress_series.append({"date": day.isoformat(), "label": day.strftime("%b %d"),
                                "completed_lessons": sum(latest.values())})
    total_lessons = sum(int(e.get("total_lessons") or 0) for e in enrollments.values())
    done_lessons = sum(
        int(e.get("total_lessons") or 0) if e.get("state") == "completed" else int(e.get("completed_lessons") or 0)
        for e in enrollments.values()
    )

    # Skill exposure radar (exposure from course progress, NOT a competency assessment).
    exposure: dict[str, float] = defaultdict(float)
    skill_exposure: dict[str, float] = defaultdict(float)
    sources: list[tuple[str, float]] = [(cid, progress_percent(e) / 100.0) for cid, e in enrollments.items()]
    sources += [(cid, 1.0) for cid, f in feedback.items() if f.get("kind") == "previously_studied" and cid not in enrollments]
    for cid, frac in sources:
        course = catalog.get(cid)
        if not course or not course.get("skills") or frac <= 0:
            continue
        share = frac / len(course["skills"])
        for sid in course["skills"]:
            skill = SKILL_BY_ID.get(sid)
            if skill:
                exposure[skill.group] += share
                skill_exposure[sid] += share
    radar = [
        {"group": g, "label": label, "value": round(100 * (1 - math.exp(-1.5 * exposure.get(g, 0.0))), 1)}
        for g, label in SKILL_GROUPS.items()
    ]
    top_skills = sorted(
        [{"skill": sid, "label": SKILL_BY_ID[sid].label, "value": round(100 * (1 - math.exp(-1.5 * v)), 1)}
         for sid, v in skill_exposure.items()],
        key=lambda x: -x["value"],
    )[:8]

    study_days = {d for d, v in minutes_by_day.items() if v > 0}
    current_streak, longest_streak = streaks(study_days, today)

    first_enrolled = min((e.get("enrolled_at") for e in enrollments.values() if e.get("enrolled_at")), default=None)
    first_session = min((s.get("date") for s in sessions if s.get("date")), default=None)
    first_completed = min((e.get("completed_at") for e in enrollments.values() if e.get("completed_at")), default=None)
    goal_weeks = [w for w in weekly if w["goal_met"]]
    milestones = [
        {"id": "first-enrollment", "label": "First enrollment", "achieved": bool(enrollments), "date": first_enrolled},
        {"id": "first-session", "label": "First study session", "achieved": bool(sessions), "date": first_session},
        {"id": "five-hours", "label": "5 hours studied", "achieved": total_minutes >= 300, "progress": min(1.0, total_minutes / 300)},
        {"id": "twenty-hours", "label": "20 hours studied", "achieved": total_minutes >= 1200, "progress": min(1.0, total_minutes / 1200)},
        {"id": "first-completion", "label": "First course completed", "achieved": statuses["completed"] > 0, "date": first_completed},
        {"id": "streak-3", "label": "3-day streak", "achieved": longest_streak >= 3, "progress": min(1.0, longest_streak / 3)},
        {"id": "streak-7", "label": "7-day streak", "achieved": longest_streak >= 7, "progress": min(1.0, longest_streak / 7)},
        {"id": "weekly-goal", "label": "Met a weekly goal", "achieved": bool(goal_weeks),
         "date": goal_weeks[-1]["week_start"] if goal_weeks else None},
    ]

    course_targets = []
    for cid, e in enrollments.items():
        target = _parse_date(e.get("target_date"))
        if not target or e.get("state") == "completed":
            continue
        enrolled = _parse_dt(e.get("enrolled_at"))
        enrolled_day = enrolled.date() if enrolled else today
        span = max(1, (target - enrolled_day).days)
        elapsed = min(span, max(0, (today - enrolled_day).days))
        expected = round(100 * elapsed / span, 1)
        actual = progress_percent(e)
        course = catalog.get(cid)
        course_targets.append({
            "course_id": cid,
            "title": course["title"] if course else cid,
            "target_date": target.isoformat(),
            "days_left": (target - today).days,
            "progress_percent": actual,
            "expected_percent": expected,
            "on_track": actual >= expected,
        })
    course_targets.sort(key=lambda t: t["target_date"])

    recent = []
    for a in sorted(activity, key=lambda a: a.get("at") or "", reverse=True)[:15]:
        course = catalog.get(a.get("course_id")) if a.get("course_id") else None
        recent.append({
            "id": a["id"],
            "type": a["type"],
            "at": a.get("at"),
            "text": ACTIVITY_TEXT.get(a["type"], a["type"].replace("_", " ").capitalize()),
            "course_id": a.get("course_id"),
            "course_title": course["title"] if course else None,
            "detail": a.get("detail", {}),
            "demo": bool(a.get("demo")),
        })

    demo_records = (
        sum(1 for s in sessions if s.get("demo"))
        + sum(1 for e in enrollments.values() if e.get("demo"))
    )
    return {
        "generated_for": today.isoformat(),
        "totals": {
            "enrolled": len(enrollments),
            "completed": statuses["completed"],
            "in_progress": statuses["in_progress"],
            "paused": statuses["paused"],
            "not_started": statuses["not_started"],
            "total_minutes": total_minutes,
            "total_hours": round(total_minutes / 60, 2),
            "sessions": len(sessions),
            "lessons_completed": done_lessons,
            "lessons_total": total_lessons,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "wishlist": len(snapshot["wishlist"]),
        },
        "weekly_goal": {
            "target_hours": target_hours,
            "target_sessions": target_sessions,
            "done_hours": this_week["hours"],
            "done_sessions": this_week["sessions"],
            "percent": round(min(100.0, 100 * this_week["minutes"] / (target_hours * 60)), 1) if target_hours > 0 else None,
            "week_start": week_start.isoformat(),
            "weeks_goal_met_last_12": len(goal_weeks),
        },
        "weekly_activity": weekly,
        "monthly_activity": monthly,
        "daily_activity": daily,
        "completion_breakdown": [{"status": k, "count": v} for k, v in statuses.items()],
        "progress_over_time": progress_series,
        "skill_radar": radar,
        "top_skills": top_skills,
        "milestones": milestones,
        "course_targets": course_targets,
        "courses": sorted(per_course, key=lambda c: -c["minutes"]),
        "recent_activity": recent,
        "demo": {"includes_demo_data": demo_records > 0, "demo_records": demo_records},
        "notes": [
            "All figures are calculated from your locally saved activity.",
            "Skill exposure reflects course progress weighted by detected course skills; it is not a competency assessment.",
        ],
    }
