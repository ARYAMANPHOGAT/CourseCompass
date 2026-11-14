"""Transparent weighted preference scoring.

    preference_score = sum_k (w_k * s_k) / sum_k w_k     over components k with s_k available

Every component s_k is in [0, 1]. A component is *unavailable* (None) when the course
lacks the metadata or the student has no preference for it (e.g. "any" difficulty).
Unavailable components are dropped from both numerator and denominator, so missing
metadata is never treated as a negative match.

Components (default weights in config.py / backend/config/recommender.json):
  content     TF-IDF cosine between the student profile (with Rocchio feedback) and the
              course, divided by the best cosine in the catalog for this profile.
  goal        Career-goal skill coverage and chosen-topic (category) match.
  skill_fit   Share of the course's goal-relevant skills the student does not know yet.
  difficulty  Ordinal distance between course level and preferred difficulty.
  duration    Ordinal distance between course duration bucket and preferred duration.
  budget      Free-only preference vs. price status (only when budget is free-only).
  quality     Dataset rating mapped from 3.5..5.0 onto 0..1 (small weight).

Correlated-signal note: `content` measures free-text similarity while `goal` and
`skill_fit` use the structured skill taxonomy; their weights are kept moderate so the
same evidence is not counted at full strength twice.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..taxonomy import CAREER_BY_ID, DURATION_BUCKETS, DURATION_BUCKET_LABELS, LEVELS, CareerGoal, skill_label

COMPONENT_LABELS = {
    "content": "Content relevance",
    "goal": "Goal & topic alignment",
    "skill_fit": "New-skill fit",
    "difficulty": "Difficulty fit",
    "duration": "Duration fit",
    "budget": "Budget fit",
    "quality": "Learner rating",
    "collaborative": "Collaborative signal",
}

_DIFFICULTY_BY_DISTANCE = {0: 1.0, 1: 0.5, 2: 0.1}
_DURATION_BY_DISTANCE = {0: 1.0, 1: 0.6, 2: 0.25, 3: 0.0}


@dataclass
class ProfileContext:
    """Pre-digested student profile used for scoring every course."""

    career: CareerGoal | None
    topics: set[str]
    known_skills: set[str]
    declared_skills: set[str]
    preferred_difficulty: str | None
    skill_level: str
    preferred_duration: str | None
    weekly_hours: float
    free_only: bool
    languages: set[str]
    query_text: str
    has_preferences: bool
    learned_skills: set[str] = field(default_factory=set)

    @property
    def career_skills(self) -> list[str]:
        return list(self.career.skills) if self.career else []


def build_profile_context(profile: dict[str, Any], learned_skills: set[str] | None = None) -> ProfileContext:
    career = CAREER_BY_ID.get(profile.get("career_goal") or "")
    declared = set(profile.get("existing_skills") or [])
    learned = set(learned_skills or set())
    difficulty = profile.get("preferred_difficulty")
    duration = profile.get("preferred_duration")
    topics = set(profile.get("topics") or [])
    objectives = (profile.get("objectives") or "").strip()
    query_parts: list[str] = []
    if career:
        query_parts += [career.label, career.description]
        query_parts += [skill_label(s) for s in career.skills if s not in declared]
    query_parts += sorted(topics)
    if objectives:
        query_parts.append(objectives)
    has_prefs = bool(career or topics or objectives or (difficulty and difficulty != "any")
                     or (duration and duration != "any") or profile.get("budget") == "free_only")
    return ProfileContext(
        career=career,
        topics=topics,
        known_skills=declared | learned,
        declared_skills=declared,
        learned_skills=learned,
        preferred_difficulty=difficulty if difficulty in LEVELS else None,
        skill_level=profile.get("skill_level") or "beginner",
        preferred_duration=duration if duration in DURATION_BUCKETS else None,
        weekly_hours=float(profile.get("weekly_hours") or 0),
        free_only=profile.get("budget") == "free_only",
        languages=set(profile.get("languages") or []),
        query_text=" ".join(query_parts),
        has_preferences=has_prefs,
    )


@dataclass
class Component:
    key: str
    score: float | None
    weight: float
    detail: str
    data: dict[str, Any] = field(default_factory=dict)

    @property
    def label(self) -> str:
        return COMPONENT_LABELS.get(self.key, self.key)

    def as_dict(self, total_weight: float) -> dict[str, Any]:
        available = self.score is not None
        effective = (self.weight / total_weight) if (available and total_weight > 0) else 0.0
        return {
            "key": self.key,
            "label": self.label,
            "score": None if self.score is None else round(float(self.score), 4),
            "weight": round(self.weight, 4),
            "effective_weight": round(effective, 4),
            "contribution": round(effective * float(self.score), 4) if available else 0.0,
            "available": available,
            "detail": self.detail,
            "data": self.data,
        }


def _goal_component(course: dict[str, Any], ctx: ProfileContext) -> tuple[float | None, str, dict[str, Any]]:
    course_skills = set(course.get("skills") or [])
    parts: list[float] = []
    matched_career: list[str] = []
    data: dict[str, Any] = {}
    detail_bits: list[str] = []
    if ctx.career:
        career_skills = ctx.career_skills
        matched_career = [s for s in career_skills if s in course_skills]
        denom = min(3, len(career_skills)) or 1
        parts.append(min(1.0, len(matched_career) / denom))
        data["career_skills_matched"] = matched_career
        if matched_career:
            detail_bits.append(
                f"covers {len(matched_career)} {ctx.career.label} skill{'s' if len(matched_career) != 1 else ''}: "
                + ", ".join(skill_label(s) for s in matched_career[:4])
            )
        else:
            detail_bits.append(f"no detected {ctx.career.label} skills")
    if ctx.topics:
        in_topic = course.get("category") in ctx.topics
        parts.append(1.0 if in_topic else 0.0)
        data["topic_match"] = course.get("category") if in_topic else None
        detail_bits.append(f"in your topic '{course.get('category')}'" if in_topic else "outside your chosen topics")
    if not parts:
        return None, "No career goal or topics selected", data
    text = "; ".join(detail_bits)
    return sum(parts) / len(parts), text[:1].upper() + text[1:], data


def _skill_fit_component(course: dict[str, Any], ctx: ProfileContext) -> tuple[float | None, str, dict[str, Any]]:
    course_skills = list(course.get("skills") or [])
    if not course_skills:
        return None, "No skills detected in course text", {}
    if not ctx.career and not ctx.known_skills:
        return None, "No career goal or known skills to compare against", {}
    relevant = [s for s in course_skills if s in set(ctx.career_skills)] if ctx.career else course_skills
    known = [s for s in course_skills if s in ctx.known_skills]
    if ctx.career and not relevant:
        new_any = [s for s in course_skills if s not in ctx.known_skills]
        return 0.3 * (len(new_any) / len(course_skills)), "Teaches skills outside your career goal", {
            "new_skills": new_any, "known_skills": known}
    new_relevant = [s for s in relevant if s not in ctx.known_skills]
    score = len(new_relevant) / len(relevant)
    if new_relevant:
        detail = "New for you: " + ", ".join(skill_label(s) for s in new_relevant[:4])
    else:
        detail = "You already know: " + ", ".join(skill_label(s) for s in relevant[:4])
    return score, detail, {"new_skills": new_relevant, "known_skills": known}


def _difficulty_component(course: dict[str, Any], ctx: ProfileContext) -> tuple[float | None, str, dict[str, Any]]:
    level = course.get("level")
    if not ctx.preferred_difficulty:
        return None, "No preferred difficulty set", {}
    if not level:
        return None, "Level not listed in source data", {}
    distance = abs(LEVELS.index(level) - LEVELS.index(ctx.preferred_difficulty))
    score = _DIFFICULTY_BY_DISTANCE[distance]
    detail = (
        f"{level.title()} level matches your preference"
        if distance == 0
        else f"{level.title()} level vs your preferred {ctx.preferred_difficulty}"
    )
    return score, detail, {"level": level, "distance": distance}


def _duration_component(course: dict[str, Any], ctx: ProfileContext) -> tuple[float | None, str, dict[str, Any]]:
    bucket = course.get("duration_bucket")
    data: dict[str, Any] = {}
    hours = course.get("duration_hours")
    if hours and ctx.weekly_hours > 0:
        data["estimated_weeks"] = round(hours / ctx.weekly_hours, 1)
    if not ctx.preferred_duration:
        return None, "No preferred duration set", data
    if not bucket:
        return None, "Duration not listed in source data", data
    distance = abs(DURATION_BUCKETS.index(bucket) - DURATION_BUCKETS.index(ctx.preferred_duration))
    score = _DURATION_BY_DISTANCE[distance]
    detail = f"{DURATION_BUCKET_LABELS[bucket]}" + (" fits your preference" if distance == 0 else f" vs preferred {ctx.preferred_duration}")
    if "estimated_weeks" in data:
        detail += f" (~{data['estimated_weeks']} weeks at {ctx.weekly_hours:g} h/week)"
    return score, detail, data


def _budget_component(course: dict[str, Any], ctx: ProfileContext) -> tuple[float | None, str, dict[str, Any]]:
    if not ctx.free_only:
        return None, "No budget restriction", {}
    status = course.get("price_status")
    if status == "free":
        return 1.0, "Listed as free in source data", {"price_status": status}
    if status == "not_listed":
        return 0.35, "Price not listed in source data (may not be free)", {"price_status": status}
    if status == "paid":
        return 0.0, "Listed with a price", {"price_status": status}
    return None, "Price unknown in source data", {"price_status": status}


def _quality_component(course: dict[str, Any]) -> tuple[float | None, str, dict[str, Any]]:
    rating = course.get("rating")
    if rating is None:
        return None, "No rating in source data", {}
    score = min(1.0, max(0.0, (float(rating) - 3.5) / 1.5))
    return score, f"Rated {rating:.1f}/5 (review count not available)", {"rating": rating}


def score_preferences(
    course: dict[str, Any],
    ctx: ProfileContext,
    content_norm: float | None,
    content_raw: float | None,
    matched_terms: list[str],
    weights: dict[str, float],
) -> tuple[float | None, list[Component]]:
    components: list[Component] = []
    if content_norm is None:
        components.append(Component("content", None, weights["content"], "No profile text or feedback yet"))
    else:
        detail = f"Text similarity {content_raw:.2f} ({content_norm * 100:.0f}% of best catalog match)"
        if matched_terms:
            detail += "; shared terms: " + ", ".join(matched_terms[:4])
        components.append(Component("content", content_norm, weights["content"], detail,
                                    {"cosine": round(float(content_raw or 0), 4), "matched_terms": matched_terms}))
    for key, fn in (
        ("goal", _goal_component),
        ("skill_fit", _skill_fit_component),
        ("difficulty", _difficulty_component),
        ("duration", _duration_component),
        ("budget", _budget_component),
    ):
        score, detail, data = fn(course, ctx)
        components.append(Component(key, score, weights[key], detail, data))
    q_score, q_detail, q_data = _quality_component(course)
    components.append(Component("quality", q_score, weights["quality"], q_detail, q_data))

    available = [c for c in components if c.score is not None and c.weight > 0]
    total = sum(c.weight for c in available)
    if total <= 0:
        return None, components
    return sum(c.weight * float(c.score) for c in available) / total, components
