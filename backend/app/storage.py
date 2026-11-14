"""Local JSON persistence for all user-entered data.

`UserRepository` is the only component that touches files under data/user/. The rest
of the backend talks to it through plain methods, so a database-backed repository with
the same method names could replace it later without changing routes, the frontend or
the recommendation algorithms.

Safety rules implemented here:
* atomic writes (temp file + os.replace) - no half-written files;
* malformed/unreadable files are moved aside as *.corrupt-<timestamp>.json, never deleted;
* every write goes through a process-wide re-entrant lock;
* destructive resets back up the whole folder first.
"""
from __future__ import annotations

import copy
import logging
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .jsonio import atomic_write_json, backup_corrupt_file, read_json, utc_now_iso

logger = logging.getLogger("coursecompass.storage")

SCHEMA_VERSION = 1
ACTIVITY_LIMIT = 3000

DEFAULT_PROFILE: dict[str, Any] = {
    "id": "demo-student",
    "display_name": "Demo Student",
    "career_goal": None,
    "skill_level": "beginner",
    "topics": [],
    "existing_skills": [],
    "objectives": "",
    "preferred_difficulty": "any",
    "weekly_hours": 5.0,
    "budget": "any",
    "preferred_duration": "any",
    "languages": ["English"],
    "onboarded": False,
    "updated_at": None,
}

DEFAULT_GOALS: dict[str, Any] = {
    "weekly_hours_target": 5.0,
    "weekly_sessions_target": 3,
    "updated_at": None,
}


def _defaults() -> dict[str, Callable[[], Any]]:
    return {
        "profile": lambda: copy.deepcopy(DEFAULT_PROFILE),
        "wishlist": lambda: {"items": []},
        "feedback": lambda: {"items": {}},
        "enrollments": lambda: {"items": {}},
        "sessions": lambda: {"items": []},
        "goals": lambda: copy.deepcopy(DEFAULT_GOALS),
        "roadmap": lambda: {"careers": {}},
        "activity": lambda: {"items": []},
        "meta": lambda: {"schema_version": SCHEMA_VERSION, "created_at": utc_now_iso()},
    }


# Expected top-level shape of each file, used to detect structurally corrupt data.
_SHAPES: dict[str, dict[str, type]] = {
    "wishlist": {"items": list},
    "feedback": {"items": dict},
    "enrollments": {"items": dict},
    "sessions": {"items": list},
    "roadmap": {"careers": dict},
    "activity": {"items": list},
}


class UserRepository:
    """JSON-file repository for the single local demo profile."""

    FILES = ("profile", "wishlist", "feedback", "enrollments", "sessions", "goals", "roadmap", "activity", "meta")

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._defaults = _defaults()
        self.recovered_files: list[str] = []
        self.initialize()

    # ------------------------------------------------------------------ low level
    def _path(self, name: str) -> Path:
        return self.root / f"{name}.json"

    def _valid_shape(self, name: str, data: Any) -> bool:
        if not isinstance(data, dict):
            return False
        for key, typ in _SHAPES.get(name, {}).items():
            if not isinstance(data.get(key), typ):
                return False
        return True

    def _load(self, name: str) -> Any:
        path = self._path(name)
        with self._lock:
            if not path.exists():
                return self._defaults[name]()
            try:
                data = read_json(path)
            except (OSError, ValueError) as exc:
                logger.warning("Could not read %s (%s); restoring defaults.", path.name, exc.__class__.__name__)
                data = None
            if data is None or not self._valid_shape(name, data):
                backup_corrupt_file(path)
                self.recovered_files.append(path.name)
                data = self._defaults[name]()
                atomic_write_json(path, data)
            if name == "profile":
                merged = copy.deepcopy(DEFAULT_PROFILE)
                merged.update({k: v for k, v in data.items() if k in DEFAULT_PROFILE})
                data = merged
            if name == "goals":
                merged = copy.deepcopy(DEFAULT_GOALS)
                merged.update({k: v for k, v in data.items() if k in DEFAULT_GOALS})
                data = merged
            return data

    def _save(self, name: str, data: Any) -> None:
        with self._lock:
            atomic_write_json(self._path(name), data)

    def initialize(self) -> None:
        """Create any missing files and validate existing ones."""
        with self._lock:
            for name in self.FILES:
                path = self._path(name)
                if not path.exists():
                    atomic_write_json(path, self._defaults[name]())
                else:
                    self._load(name)

    # ------------------------------------------------------------------ activity
    def log_activity(self, kind: str, course_id: str | None = None, detail: dict[str, Any] | None = None,
                     *, demo: bool = False, at: str | None = None) -> dict[str, Any]:
        with self._lock:
            data = self._load("activity")
            event = {
                "id": uuid.uuid4().hex[:12],
                "type": kind,
                "course_id": course_id,
                "at": at or utc_now_iso(),
                "detail": detail or {},
                "demo": demo,
            }
            data["items"].append(event)
            if len(data["items"]) > ACTIVITY_LIMIT:
                data["items"] = data["items"][-ACTIVITY_LIMIT:]
            self._save("activity", data)
            return event

    def list_activity(self) -> list[dict[str, Any]]:
        return list(self._load("activity")["items"])

    # ------------------------------------------------------------------ profile
    def get_profile(self) -> dict[str, Any]:
        return self._load("profile")

    def save_profile(self, profile: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self._load("profile")
            current.update({k: v for k, v in profile.items() if k in DEFAULT_PROFILE and k != "id"})
            current["updated_at"] = utc_now_iso()
            self._save("profile", current)
            self.log_activity("profile_updated", detail={"career_goal": current.get("career_goal")})
            return current

    def reset_profile(self) -> dict[str, Any]:
        with self._lock:
            profile = copy.deepcopy(DEFAULT_PROFILE)
            profile["updated_at"] = utc_now_iso()
            self._save("profile", profile)
            self.log_activity("profile_reset")
            return profile

    # ------------------------------------------------------------------ wishlist
    def list_wishlist(self) -> list[dict[str, Any]]:
        return list(self._load("wishlist")["items"])

    def add_wishlist(self, course_id: str, note: str | None = None, *, demo: bool = False) -> dict[str, Any]:
        with self._lock:
            data = self._load("wishlist")
            for item in data["items"]:
                if item["course_id"] == course_id:
                    return item
            entry = {"course_id": course_id, "added_at": utc_now_iso(), "note": note, "demo": demo}
            data["items"].append(entry)
            self._save("wishlist", data)
            self.log_activity("wishlist_added", course_id, demo=demo)
            return entry

    def remove_wishlist(self, course_id: str) -> bool:
        with self._lock:
            data = self._load("wishlist")
            before = len(data["items"])
            data["items"] = [i for i in data["items"] if i["course_id"] != course_id]
            if len(data["items"]) == before:
                return False
            self._save("wishlist", data)
            self.log_activity("wishlist_removed", course_id)
            return True

    # ------------------------------------------------------------------ feedback
    def list_feedback(self) -> dict[str, dict[str, Any]]:
        return dict(self._load("feedback")["items"])

    def set_feedback(self, course_id: str, kind: str | None, rating: int | None, *, demo: bool = False) -> dict[str, Any]:
        with self._lock:
            data = self._load("feedback")
            entry = data["items"].get(course_id, {"course_id": course_id, "kind": None, "rating": None})
            if kind is not None:
                entry["kind"] = kind
            if rating is not None:
                entry["rating"] = rating
            entry["updated_at"] = utc_now_iso()
            entry["demo"] = demo and entry.get("demo", True)
            data["items"][course_id] = entry
            self._save("feedback", data)
            self.log_activity("feedback", course_id, {"kind": entry["kind"], "rating": entry["rating"]}, demo=demo)
            return entry

    def clear_feedback(self, course_id: str) -> bool:
        with self._lock:
            data = self._load("feedback")
            if course_id not in data["items"]:
                return False
            del data["items"][course_id]
            self._save("feedback", data)
            self.log_activity("feedback_cleared", course_id)
            return True

    # ------------------------------------------------------------------ enrollments
    def list_enrollments(self) -> dict[str, dict[str, Any]]:
        return dict(self._load("enrollments")["items"])

    def get_enrollment(self, course_id: str) -> dict[str, Any] | None:
        return self._load("enrollments")["items"].get(course_id)

    def enroll(self, course_id: str, total_lessons: int, lessons_source: str, target_date: str | None,
               *, demo: bool = False, at: str | None = None) -> dict[str, Any]:
        with self._lock:
            data = self._load("enrollments")
            if course_id in data["items"]:
                return data["items"][course_id]
            now = at or utc_now_iso()
            entry = {
                "course_id": course_id,
                "enrolled_at": now,
                "state": "active",
                "completed_lessons": 0,
                "total_lessons": total_lessons,
                "lessons_source": lessons_source,
                "target_date": target_date,
                "completed_at": None,
                "paused_at": None,
                "updated_at": now,
                "demo": demo,
            }
            data["items"][course_id] = entry
            self._save("enrollments", data)
            self.log_activity("enrolled", course_id, {"total_lessons": total_lessons}, demo=demo, at=now)
            return entry

    def update_enrollment(self, course_id: str, changes: dict[str, Any], *, demo: bool = False,
                          at: str | None = None) -> dict[str, Any] | None:
        """Apply validated changes. Caller guarantees completed_lessons <= total_lessons."""
        with self._lock:
            data = self._load("enrollments")
            entry = data["items"].get(course_id)
            if entry is None:
                return None
            now = at or utc_now_iso()
            before = dict(entry)
            for key in ("state", "completed_lessons", "total_lessons", "target_date"):
                if key in changes:
                    entry[key] = changes[key]
            if entry["total_lessons"] and entry["completed_lessons"] > entry["total_lessons"]:
                entry["completed_lessons"] = entry["total_lessons"]
            if "total_lessons" in changes:
                entry["lessons_source"] = "user"
            if entry["state"] == "completed" and before.get("state") != "completed":
                entry["completed_at"] = now
                entry["completed_lessons"] = entry["total_lessons"]
            if entry["state"] != "completed":
                entry["completed_at"] = None
            entry["paused_at"] = now if entry["state"] == "paused" and before.get("state") != "paused" else (
                entry.get("paused_at") if entry["state"] == "paused" else None
            )
            entry["updated_at"] = now
            if not demo:
                entry["demo"] = False  # a demo record the user edits becomes real user data
            data["items"][course_id] = entry
            self._save("enrollments", data)
            if entry["completed_lessons"] != before.get("completed_lessons") or entry["total_lessons"] != before.get("total_lessons"):
                self.log_activity(
                    "progress_updated",
                    course_id,
                    {"completed_lessons": entry["completed_lessons"], "total_lessons": entry["total_lessons"]},
                    demo=demo,
                    at=now,
                )
            if entry["state"] != before.get("state"):
                self.log_activity("status_changed", course_id, {"from": before.get("state"), "to": entry["state"]}, demo=demo, at=now)
            return entry

    def remove_enrollment(self, course_id: str) -> bool:
        with self._lock:
            data = self._load("enrollments")
            if course_id not in data["items"]:
                return False
            del data["items"][course_id]
            self._save("enrollments", data)
            self.log_activity("unenrolled", course_id)
            return True

    # ------------------------------------------------------------------ sessions
    def list_sessions(self) -> list[dict[str, Any]]:
        return list(self._load("sessions")["items"])

    def add_session(self, course_id: str, date: str, minutes: int, lessons_completed: int, note: str | None,
                    *, demo: bool = False, at: str | None = None) -> dict[str, Any]:
        with self._lock:
            data = self._load("sessions")
            session = {
                "id": uuid.uuid4().hex[:12],
                "course_id": course_id,
                "date": date,
                "minutes": minutes,
                "lessons_completed": lessons_completed,
                "note": note,
                "created_at": at or utc_now_iso(),
                "demo": demo,
            }
            data["items"].append(session)
            self._save("sessions", data)
            self.log_activity("session_logged", course_id, {"minutes": minutes, "date": date}, demo=demo, at=at)
            return session

    def delete_session(self, session_id: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._load("sessions")
            found = next((s for s in data["items"] if s["id"] == session_id), None)
            if not found:
                return None
            data["items"] = [s for s in data["items"] if s["id"] != session_id]
            self._save("sessions", data)
            self.log_activity("session_deleted", found["course_id"], {"minutes": found["minutes"]})
            return found

    # ------------------------------------------------------------------ goals
    def get_goals(self) -> dict[str, Any]:
        return self._load("goals")

    def save_goals(self, goals: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self._load("goals")
            current.update({k: v for k, v in goals.items() if k in DEFAULT_GOALS})
            current["updated_at"] = utc_now_iso()
            self._save("goals", current)
            self.log_activity("goal_updated", detail={"weekly_hours_target": current["weekly_hours_target"]})
            return current

    # ------------------------------------------------------------------ roadmap
    def get_roadmap_state(self, career_id: str) -> dict[str, Any]:
        return self._load("roadmap")["careers"].get(career_id, {"milestones": {}})

    def set_milestone(self, career_id: str, stage_id: str, completed: bool) -> dict[str, Any]:
        with self._lock:
            data = self._load("roadmap")
            career = data["careers"].setdefault(career_id, {"milestones": {}})
            career["milestones"][stage_id] = {
                "completed": completed,
                "updated_at": utc_now_iso(),
            }
            self._save("roadmap", data)
            self.log_activity("milestone_completed" if completed else "milestone_reopened", detail={"career_goal": career_id, "stage": stage_id})
            return career["milestones"][stage_id]

    # ------------------------------------------------------------------ demo data
    def demo_counts(self) -> dict[str, int]:
        return {
            "wishlist": sum(1 for i in self.list_wishlist() if i.get("demo")),
            "feedback": sum(1 for i in self.list_feedback().values() if i.get("demo")),
            "enrollments": sum(1 for i in self.list_enrollments().values() if i.get("demo")),
            "sessions": sum(1 for i in self.list_sessions() if i.get("demo")),
            "activity": sum(1 for i in self.list_activity() if i.get("demo")),
        }

    def clear_demo_data(self) -> dict[str, int]:
        with self._lock:
            removed = self.demo_counts()
            wl = self._load("wishlist")
            wl["items"] = [i for i in wl["items"] if not i.get("demo")]
            self._save("wishlist", wl)
            fb = self._load("feedback")
            fb["items"] = {k: v for k, v in fb["items"].items() if not v.get("demo")}
            self._save("feedback", fb)
            en = self._load("enrollments")
            en["items"] = {k: v for k, v in en["items"].items() if not v.get("demo")}
            self._save("enrollments", en)
            ss = self._load("sessions")
            ss["items"] = [s for s in ss["items"] if not s.get("demo")]
            self._save("sessions", ss)
            ac = self._load("activity")
            ac["items"] = [a for a in ac["items"] if not a.get("demo")]
            self._save("activity", ac)
            return removed

    # ------------------------------------------------------------------ reset
    def backup_all(self) -> Path:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        target = self.root / "backups" / f"backup-{stamp}-{uuid.uuid4().hex[:6]}"
        target.mkdir(parents=True, exist_ok=True)
        for name in self.FILES:
            path = self._path(name)
            if path.exists():
                shutil.copy2(path, target / path.name)
        return target

    def reset_all(self) -> Path:
        """Back up every file, then restore defaults. Returns the backup folder."""
        with self._lock:
            backup = self.backup_all()
            for name in self.FILES:
                atomic_write_json(self._path(name), self._defaults[name]())
            return backup

    def snapshot(self) -> dict[str, Any]:
        """Read-only view of all user data (used by recommendations and analytics)."""
        with self._lock:
            return {
                "profile": self.get_profile(),
                "wishlist": self.list_wishlist(),
                "feedback": self.list_feedback(),
                "enrollments": self.list_enrollments(),
                "sessions": self.list_sessions(),
                "goals": self.get_goals(),
                "activity": self.list_activity(),
            }
