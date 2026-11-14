"""Personalised learning roadmap for a career goal.

Stages come from the career taxonomy. For each stage, catalog courses that teach at
least one stage skill are ranked by

    0.40 * stage-skill coverage + 0.35 * personal match score + 0.15 * level fit for stage
    + 0.10 * (course category is one of the career's typical categories)

Courses are then picked greedily: each pick gets a +0.3 bonus per newly covered stage
skill (scaled by the number of stage skills), so a stage's suggestions span its skills.

where "level fit" prefers beginner courses in early stages and intermediate/advanced
courses in later ones (missing level = neutral 0.5). A stage is *completed* when the
student marks the milestone done, or automatically when they complete one of the
stage's suggested courses. Stage n depends on stage n-1; the first incomplete stage is
*current*. The roadmap is guidance only - it does not guarantee employment or competency.
"""
from __future__ import annotations

from typing import Any

from .recommender.engine import course_summary
from .taxonomy import CAREER_BY_ID, LEVELS, skill_label

DISCLAIMER = (
    "This roadmap is a suggested learning sequence built from the course catalog. It does not "
    "guarantee employment, certification or competency."
)


def _level_fit(level: str | None, stage_index: int, n_stages: int) -> float:
    if not level:
        return 0.5
    target = 0 if stage_index == 0 else (1 if stage_index < n_stages - 1 else 2)
    distance = abs(LEVELS.index(level) - target)
    return {0: 1.0, 1: 0.6, 2: 0.2}[distance]


def build_roadmap(career_id: str, catalog, match_scores: dict[str, float], snapshot: dict[str, Any],
                  milestone_state: dict[str, Any], per_stage: int = 3) -> dict[str, Any]:
    career = CAREER_BY_ID[career_id]
    enrollments = snapshot["enrollments"]
    feedback = snapshot["feedback"]
    profile = snapshot["profile"]
    preferred_langs = set(profile.get("languages") or [])
    irrelevant = {cid for cid, f in feedback.items() if f.get("kind") == "irrelevant"}
    studied = {cid for cid, f in feedback.items() if f.get("kind") == "previously_studied"}
    completed = {cid for cid, e in enrollments.items() if e.get("state") == "completed"} | studied
    known_skills = set(profile.get("existing_skills") or [])
    for cid in completed:
        course = catalog.get(cid)
        if course:
            known_skills |= set(course.get("skills") or [])

    used: set[str] = set()
    stages_out: list[dict[str, Any]] = []
    n = len(career.stages)
    for idx, stage in enumerate(career.stages):
        stage_skills = set(stage.skills)
        candidates = []
        for course in catalog.courses:
            cid = course["id"]
            if cid in irrelevant or cid in used:
                continue
            langs = set(course.get("languages") or [])
            if preferred_langs and langs and not (langs & preferred_langs):
                continue
            covered = stage_skills & set(course.get("skills") or [])
            if not covered:
                continue
            coverage = len(covered) / len(stage_skills)
            score = (0.40 * coverage + 0.35 * match_scores.get(cid, 0.0) + 0.15 * _level_fit(course.get("level"), idx, n)
                     + 0.10 * (course.get("category") in career.categories))
            candidates.append((score, cid, sorted(covered)))
        candidates.sort(key=lambda t: (-round(t[0], 10), t[1]))
        # Greedy pick: favour courses that add a stage skill not yet covered by earlier picks,
        # so every stage skill is represented when the catalog allows it.
        chosen: list[tuple[float, str, list[str]]] = []
        covered_so_far: set[str] = set()
        pool = list(candidates)
        while pool and len(chosen) < per_stage:
            best = max(pool, key=lambda t: (round(t[0] + 0.3 * len(set(t[2]) - covered_so_far) / len(stage_skills), 10), -pool.index(t)))
            chosen.append(best)
            covered_so_far |= set(best[2])
            pool.remove(best)
        used |= {cid for _, cid, _ in chosen}
        courses = []
        for score, cid, covered in chosen:
            e = enrollments.get(cid)
            courses.append({
                "course": course_summary(catalog.get(cid)),
                "roadmap_score": round(score, 4),
                "covers": [skill_label(s) for s in covered],
                "user_status": "completed" if cid in completed else (e.get("state") if e else None),
            })
        manual = (milestone_state.get("milestones") or {}).get(stage.id, {})
        auto_done = any(c["user_status"] == "completed" for c in courses)
        completed_flag = bool(manual.get("completed")) or auto_done
        stages_out.append({
            "id": stage.id,
            "order": idx + 1,
            "title": stage.title,
            "description": stage.description,
            "skills": [{"id": s, "label": skill_label(s), "known": s in known_skills} for s in stage.skills],
            "courses": courses,
            "completed": completed_flag,
            "completion_source": "manual" if manual.get("completed") else ("course_completed" if auto_done else None),
            "manually_completed": bool(manual.get("completed")),
            "depends_on": career.stages[idx - 1].id if idx > 0 else None,
            "note": None if courses else "No course in this catalog covers this stage; consider external resources.",
        })

    current_found = False
    for stage in stages_out:
        if stage["completed"]:
            stage["status"] = "completed"
        elif not current_found:
            stage["status"] = "current"
            current_found = True
        else:
            stage["status"] = "upcoming"

    next_course = None
    current = next((s for s in stages_out if s["status"] == "current"), None)
    if current:
        in_progress = [c for c in current["courses"] if c["user_status"] in ("active", "paused")]
        fresh = [c for c in current["courses"] if c["user_status"] is None]
        pick = in_progress[0] if in_progress else (fresh[0] if fresh else None)
        if pick:
            next_course = {
                "course": pick["course"],
                "action": "continue" if pick in in_progress else "start",
                "stage": current["title"],
                "reason": f"Next step in '{current['title']}': covers " + ", ".join(pick["covers"]),
            }
    done = sum(1 for s in stages_out if s["completed"])
    return {
        "career_goal": {"id": career.id, "label": career.label, "description": career.description},
        "stages": stages_out,
        "progress": {"completed_stages": done, "total_stages": len(stages_out),
                     "percent": round(100 * done / len(stages_out), 1) if stages_out else 0.0},
        "next_course": next_course,
        "disclaimer": DISCLAIMER,
        "method": ("Stage courses ranked by 0.40 x stage-skill coverage + 0.35 x your match score + 0.15 x level fit "
                   "for the stage + 0.10 x career-category match."),
    }
