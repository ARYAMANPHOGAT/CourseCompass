"""Hybrid recommendation engine: content + weighted preferences + collaborative filtering.

Modes
-----
content : final = preference_score (TF-IDF content relevance + preference components)
hybrid  : final = (1 - lam) * preference_score + lam * cf_norm
          lam = collaborative_weight_max * confidence
          confidence = min(1, positive_interactions / full_confidence_interactions)
          cf_norm = cf_raw / max(cf_raw over eligible courses)

If collaborative evidence is unavailable (too few interactions, no overlap, or no
interaction data), hybrid mode falls back to content mode and says so. For a course
with no cohort evidence (cf_norm is None) lam is 0 for that course only.

Every returned result carries the component scores that produced it, and each
component's contribution to the final score, so explanations are derived from the
actual calculation.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..interactions import user_interaction_strengths
from ..taxonomy import LEVELS, skill_label
from .collaborative import CFResult, ItemKNN
from .content import ContentIndex
from .preference import COMPONENT_LABELS, Component, ProfileContext, build_profile_context, score_preferences

SUMMARY_FIELDS = (
    "id", "title", "url", "provider", "content_type", "content_type_label", "category", "level", "duration_text",
    "duration_bucket", "duration_hours", "duration_months", "price_status", "is_free", "rating", "review_count",
    "language", "languages", "skills", "skill_labels", "image_url", "source", "certificate", "module_count",
)


def course_summary(course: dict[str, Any]) -> dict[str, Any]:
    summary = {k: course.get(k) for k in SUMMARY_FIELDS}
    desc = course.get("description") or ""
    summary["description_snippet"] = (desc[:217].rsplit(" ", 1)[0] + "...") if len(desc) > 220 else desc or None
    return summary


@dataclass
class UserState:
    profile: dict[str, Any]
    wishlist: set[str]
    enrollments: dict[str, dict[str, Any]]
    feedback: dict[str, dict[str, Any]]
    strengths: dict[str, float]
    learned_skills: set[str]

    @property
    def completed(self) -> set[str]:
        return {cid for cid, e in self.enrollments.items() if e.get("state") == "completed"}

    @property
    def previously_studied(self) -> set[str]:
        return {cid for cid, f in self.feedback.items() if f.get("kind") == "previously_studied"}

    @property
    def irrelevant(self) -> set[str]:
        return {cid for cid, f in self.feedback.items() if f.get("kind") == "irrelevant"}

    @property
    def active(self) -> set[str]:
        return {cid for cid, e in self.enrollments.items() if e.get("state") in ("active", "paused")}


def build_user_state(snapshot: dict[str, Any], catalog_by_id: dict[str, dict[str, Any]], interaction_weights: dict[str, float]) -> UserState:
    wishlist = [w for w in snapshot["wishlist"] if w["course_id"] in catalog_by_id]
    enrollments = {k: v for k, v in snapshot["enrollments"].items() if k in catalog_by_id}
    feedback = {k: v for k, v in snapshot["feedback"].items() if k in catalog_by_id}
    strengths = user_interaction_strengths(wishlist, enrollments, feedback, interaction_weights)
    learned: set[str] = set()
    for cid, e in enrollments.items():
        if e.get("state") == "completed":
            learned |= set(catalog_by_id[cid].get("skills") or [])
    for cid, f in feedback.items():
        if f.get("kind") == "previously_studied":
            learned |= set(catalog_by_id[cid].get("skills") or [])
    return UserState(snapshot["profile"], {w["course_id"] for w in wishlist}, enrollments, feedback, strengths, learned)


@dataclass
class Scored:
    course_id: str
    final: float
    preference: float | None
    cf_norm: float | None
    cf_raw: float | None
    lam: float
    components: list[Component]
    content_raw: float
    excluded: str | None = None
    total_weight: float = 0.0
    matched_terms: list[str] = field(default_factory=list)


@dataclass
class ScoringRun:
    mode_requested: str
    method_used: str
    ctx: ProfileContext
    state: UserState
    cf: CFResult | None
    cf_status: dict[str, Any]
    lam_max: float
    scored: list[Scored]
    profile_vector: np.ndarray | None
    excluded_counts: dict[str, int]

    def ranked(self, include_excluded: bool = False) -> list[Scored]:
        items = [s for s in self.scored if include_excluded or not s.excluded]
        return sorted(items, key=lambda s: (-round(s.final, 10), -round(s.preference or 0, 10), s.course_id))


class Recommender:
    def __init__(self, catalog, content: ContentIndex, cf: ItemKNN, config: dict[str, Any]):
        self.catalog = catalog
        self.content = content
        self.cf = cf
        self.config = config

    # ------------------------------------------------------------------ helpers
    @property
    def weights(self) -> dict[str, float]:
        return self.config["preference_weights"]

    def user_state(self, snapshot: dict[str, Any]) -> UserState:
        return build_user_state(snapshot, self.catalog.by_id, self.config["interaction_weights"])

    def _exclusion_reason(self, course: dict[str, Any], state: UserState, ctx: ProfileContext, include_enrolled: bool) -> str | None:
        cid = course["id"]
        if cid in state.completed:
            return "completed"
        if cid in state.previously_studied:
            return "previously_studied"
        if cid in state.irrelevant:
            return "marked_irrelevant"
        if not include_enrolled and cid in state.active:
            return "enrolled"
        langs = set(course.get("languages") or [])
        if ctx.languages and langs and not (langs & ctx.languages):
            return "language"
        return None

    # ------------------------------------------------------------------ scoring
    def score_all(self, state: UserState, mode: str = "hybrid", include_enrolled: bool = False) -> ScoringRun:
        ctx = build_profile_context(state.profile, state.learned_skills)
        rocchio = self.config["rocchio"]
        positives = sorted(cid for cid, s in state.strengths.items() if s > 0)
        negatives = sorted(cid for cid, s in state.strengths.items() if s < 0)
        profile_vec = self.content.profile_vector(
            ctx.query_text, positives, negatives, rocchio["alpha"], rocchio["beta_positive"], rocchio["gamma_negative"]
        )
        raw = self.content.scores(profile_vec)
        courses = self.catalog.courses
        exclusions = [self._exclusion_reason(c, state, ctx, include_enrolled) for c in courses]
        eligible = np.array([e is None for e in exclusions])
        max_raw = float(raw[eligible].max()) if eligible.any() and profile_vec is not None else 0.0

        hybrid_cfg = self.config["hybrid"]
        cf_result: CFResult | None = None
        lam_max = 0.0
        method = "content"
        cf_status: dict[str, Any] = {"available": False, "reason": "Content mode selected.", "user_interactions": len(positives),
                                     "min_required": hybrid_cfg["min_user_interactions"], "confidence": 0.0,
                                     "data_label": "synthetic demo cohort"}
        if mode == "hybrid":
            cf_result = self.cf.score(state.strengths, hybrid_cfg["min_user_interactions"])
            cf_status["reason"] = cf_result.reason
            if cf_result.available:
                confidence = min(1.0, cf_result.user_items / max(1, hybrid_cfg["full_confidence_interactions"]))
                lam_max = hybrid_cfg["collaborative_weight_max"] * confidence
                method = "hybrid"
                cf_status.update({"available": True, "confidence": round(confidence, 3), "weight": round(lam_max, 3)})
            else:
                method = "content_fallback"
        cf_max = 0.0
        if cf_result and cf_result.available:
            vals = [cf_result.scores.get(c["id"]) for c, ok in zip(courses, eligible) if ok]
            cf_max = max([v for v in vals if v is not None] or [0.0])

        scored: list[Scored] = []
        for i, course in enumerate(courses):
            content_norm = (float(raw[i]) / max_raw) if (profile_vec is not None and max_raw > 0) else None
            if content_norm is not None:
                content_norm = min(1.0, content_norm)
            pref, comps = score_preferences(course, ctx, content_norm, float(raw[i]), [], self.weights)
            cf_raw = cf_result.scores.get(course["id"]) if (cf_result and cf_result.available) else None
            cf_norm = (cf_raw / cf_max) if (cf_raw is not None and cf_max > 0) else (0.0 if cf_raw is not None else None)
            lam = lam_max if cf_norm is not None else 0.0
            pref_value = pref if pref is not None else 0.0
            final = (1 - lam) * pref_value + lam * (cf_norm or 0.0)
            total_weight = sum(c.weight for c in comps if c.score is not None and c.weight > 0)
            scored.append(Scored(course["id"], float(final), pref, cf_norm, cf_raw, lam, comps, float(raw[i]),
                                 exclusions[i], total_weight))
        excluded_counts: dict[str, int] = {}
        for e in exclusions:
            if e:
                excluded_counts[e] = excluded_counts.get(e, 0) + 1
        return ScoringRun(mode, method, ctx, state, cf_result, cf_status, lam_max, scored, profile_vec, excluded_counts)

    # ------------------------------------------------------------------ results
    def result_dict(self, run: ScoringRun, s: Scored, rank: int | None) -> dict[str, Any]:
        course = self.catalog.by_id[s.course_id]
        terms = self.content.matched_terms(run.profile_vector, s.course_id)
        for comp in s.components:
            if comp.key == "content" and comp.score is not None:
                comp.data["matched_terms"] = terms
                comp.detail = f"Text similarity {s.content_raw:.2f} ({comp.score * 100:.0f}% of best catalog match)" + (
                    "; shared terms: " + ", ".join(terms[:4]) if terms else "")
        comp_dicts = [c.as_dict(s.total_weight) for c in s.components]
        for c in comp_dicts:
            c["final_contribution"] = round((1 - s.lam) * c["contribution"], 4)
        if run.method_used == "hybrid":
            comp_dicts.append(self._cf_component(run, s))
        explanation = self.build_explanation(run, s, course, comp_dicts, terms)
        return {
            "rank": rank,
            "course": course_summary(course),
            "score": round(s.final, 4),
            "match_percent": int(round(s.final * 100)),
            "preference_score": None if s.preference is None else round(s.preference, 4),
            "collaborative_score": None if s.cf_norm is None else round(s.cf_norm, 4),
            "method": run.method_used,
            "hybrid_weights": {"preference": round(1 - s.lam, 4), "collaborative": round(s.lam, 4)},
            "components": comp_dicts,
            "explanation": explanation,
            "excluded_reason": s.excluded,
        }

    def _cf_component(self, run: ScoringRun, s: Scored) -> dict[str, Any]:
        neighbours = []
        if run.cf and s.course_id in run.cf.contributions:
            for cid, value in run.cf.contributions[s.course_id]:
                neighbours.append({"course_id": cid, "title": self.catalog.by_id[cid]["title"], "weight": round(value, 4)})
        if s.cf_norm is None:
            detail = "No reliable co-interaction evidence for this course in the synthetic demo cohort"
        elif neighbours:
            detail = ("Synthetic demo learners who engaged with " + ", ".join(f"'{n['title']}'" for n in neighbours[:2])
                      + " also engaged with this course")
        else:
            detail = "No co-interaction overlap with your saved/enrolled courses"
        return {
            "key": "collaborative",
            "label": COMPONENT_LABELS["collaborative"],
            "score": None if s.cf_norm is None else round(s.cf_norm, 4),
            "weight": round(run.lam_max, 4),
            "effective_weight": round(s.lam, 4),
            "contribution": round(s.cf_norm or 0.0, 4),
            "final_contribution": round(s.lam * (s.cf_norm or 0.0), 4),
            "available": s.cf_norm is not None,
            "detail": detail,
            "data": {"neighbours": neighbours, "raw": None if s.cf_raw is None else round(s.cf_raw, 4),
                     "source": "synthetic demo cohort"},
        }

    def build_explanation(self, run: ScoringRun, s: Scored, course: dict[str, Any], comps: list[dict[str, Any]],
                          terms: list[str]) -> dict[str, Any]:
        ctx = run.ctx
        by_key = {c["key"]: c for c in comps}
        phrases = {
            "content": lambda c: ("its description closely matches your goals" if (c["score"] or 0) >= 0.6
                                  else "its text overlaps with your profile"),
            "goal": lambda c: c["detail"][0].lower() + c["detail"][1:] if c["detail"] else "it fits your goal",
            "skill_fit": lambda c: ("it teaches skills that are new to you" if (c["score"] or 0) >= 0.5
                                    else "it reinforces skills you have"),
            "difficulty": lambda c: f"its {course.get('level') or ''} level suits you".replace("  ", " "),
            "duration": lambda c: "its length fits your schedule",
            "budget": lambda c: "it is listed as free",
            "quality": lambda c: f"learners rated it {course.get('rating'):.1f}/5" if course.get("rating") else "it is well rated",
            "collaborative": lambda c: "similar learners in the synthetic demo cohort engaged with it",
        }
        positives = sorted(
            [c for c in comps if c["available"] and (c["score"] or 0) >= 0.5 and c["final_contribution"] > 0],
            key=lambda c: -c["final_contribution"],
        )
        if not ctx.has_preferences and not run.state.strengths:
            summary = "Ranked by rating and general fit only - complete onboarding for personalised recommendations."
        elif positives:
            top = [phrases[c["key"]](c) for c in positives[:2]]
            summary = "Recommended because " + " and ".join(top) + "."
        else:
            summary = "Weak match: few of your preferences are satisfied by this course."
        reasons = []
        for c in sorted([c for c in comps if c["available"]], key=lambda c: -c["final_contribution"]):
            score = c["score"] or 0
            impact = "positive" if score >= 0.6 else "neutral" if score >= 0.35 else "negative"
            reasons.append({"key": c["key"], "label": c["label"], "text": c["detail"], "impact": impact,
                            "score": c["score"], "final_contribution": c["final_contribution"]})
        unavailable = [{"key": c["key"], "label": c["label"], "text": c["detail"]} for c in comps if not c["available"]]

        goal_data = by_key.get("goal", {}).get("data", {})
        fit_data = by_key.get("skill_fit", {}).get("data", {})
        cautions: list[str] = []
        level = course.get("level")
        if level and ctx.skill_level in LEVELS and LEVELS.index(level) > LEVELS.index(ctx.skill_level):
            cautions.append(f"Listed as {level.title()} while you describe your level as {ctx.skill_level.title()}.")
        if not level:
            cautions.append("Difficulty level is not listed in the source data.")
        if ctx.free_only and course.get("price_status") != "free":
            cautions.append("Not confirmed as free in the source data.")
        weeks = by_key.get("duration", {}).get("data", {}).get("estimated_weeks")
        if weeks and weeks > 12:
            cautions.append(f"About {weeks:g} weeks at your current weekly hours.")
        if not course.get("languages"):
            cautions.append("Language is not listed in the source data.")
        prereq = course.get("prerequisites")
        prerequisite_note = (
            f"Listed prerequisites: {prereq}" if prereq
            else "Prerequisites are not listed in the source data, so prerequisite gaps cannot be checked."
        )
        return {
            "summary": summary,
            "reasons": reasons,
            "unavailable_components": unavailable,
            "matched_topics": [goal_data["topic_match"]] if goal_data.get("topic_match") else [],
            "matched_career_skills": [skill_label(x) for x in goal_data.get("career_skills_matched", [])],
            "new_skills": [skill_label(x) for x in fit_data.get("new_skills", [])],
            "known_skills": [skill_label(x) for x in fit_data.get("known_skills", [])],
            "matched_terms": terms,
            "career_goal": ctx.career.label if ctx.career else None,
            "cautions": cautions,
            "prerequisite_note": prerequisite_note,
            "score_note": "Match score is a preference-match score, not a probability of success or a model accuracy.",
        }

    # ------------------------------------------------------------------ public API
    def recommend(self, snapshot: dict[str, Any], mode: str = "hybrid", limit: int = 12,
                  include_enrolled: bool = False, offset: int = 0) -> dict[str, Any]:
        state = self.user_state(snapshot)
        run = self.score_all(state, mode, include_enrolled)
        ranked = run.ranked()
        page = ranked[offset: offset + limit]
        return {
            "mode_requested": mode,
            "method_used": run.method_used,
            "cf_status": run.cf_status,
            "weights": {"preference": self.weights, "collaborative_max": self.config["hybrid"]["collaborative_weight_max"]},
            "profile_complete": run.ctx.has_preferences,
            "total_candidates": len(ranked),
            "excluded": run.excluded_counts,
            "results": [self.result_dict(run, s, offset + i + 1) for i, s in enumerate(page)],
        }

    def explain(self, snapshot: dict[str, Any], course_id: str, mode: str = "hybrid") -> dict[str, Any]:
        state = self.user_state(snapshot)
        run = self.score_all(state, mode, include_enrolled=False)
        ranked = run.ranked()
        target = next(s for s in run.scored if s.course_id == course_id)
        rank = next((i + 1 for i, s in enumerate(ranked) if s.course_id == course_id), None)
        result = self.result_dict(run, target, rank)
        comparison = None
        if ranked and ranked[0].course_id != course_id:
            top = self.result_dict(run, ranked[0], 1)
            top_contrib = {c["key"]: c["final_contribution"] for c in top["components"]}
            gaps = []
            for c in result["components"]:
                delta = round(c["final_contribution"] - top_contrib.get(c["key"], 0.0), 4)
                if delta < -0.005:
                    gaps.append({"key": c["key"], "label": c["label"], "this": c["final_contribution"],
                                 "top": top_contrib.get(c["key"], 0.0), "delta": delta})
            gaps.sort(key=lambda g: g["delta"])
            comparison = {
                "top_course": top["course"],
                "top_score": top["score"],
                "score_gap": round(top["score"] - result["score"], 4),
                "largest_gaps": gaps[:4],
                "text": (
                    f"Ranked #{rank} of {len(ranked)}" if rank else "Excluded from recommendations"
                ) + (f"; biggest gap vs #1: {gaps[0]['label'].lower()}." if gaps else "."),
            }
        result["comparison"] = comparison
        result["total_ranked"] = len(ranked)
        result["method_used"] = run.method_used
        result["cf_status"] = run.cf_status
        return result

    def detail_scoring(self, snapshot: dict[str, Any], course_ids: list[str], mode: str = "hybrid") -> dict[str, dict[str, Any]]:
        """Personalised scoring for specific courses (course detail, comparison, search cards)."""
        state = self.user_state(snapshot)
        run = self.score_all(state, mode, include_enrolled=True)
        ranked = run.ranked(include_excluded=False)
        ranks = {s.course_id: i + 1 for i, s in enumerate(ranked)}
        by_id = {s.course_id: s for s in run.scored}
        out = {}
        for cid in course_ids:
            if cid in by_id:
                out[cid] = self.result_dict(run, by_id[cid], ranks.get(cid))
        return out

    def match_scores(self, snapshot: dict[str, Any], mode: str = "hybrid") -> tuple[dict[str, float], bool]:
        state = self.user_state(snapshot)
        run = self.score_all(state, mode, include_enrolled=True)
        return {s.course_id: s.final for s in run.scored}, run.ctx.has_preferences

    def similar(self, course_id: str, limit: int = 6) -> list[dict[str, Any]]:
        source = self.catalog.by_id[course_id]
        cos = self.content.similar(course_id)
        src_level = source.get("level")
        src_langs = set(source.get("languages") or [])
        results = []
        for i, course in enumerate(self.catalog.courses):
            if course["id"] == course_id:
                continue
            same_cat = bool(source.get("category")) and course.get("category") == source.get("category")
            lvl = course.get("level")
            level_match = 1.0 if (src_level and lvl and src_level == lvl) else 0.5 if (
                src_level and lvl and abs(LEVELS.index(src_level) - LEVELS.index(lvl)) == 1) else 0.0
            score = 0.85 * float(cos[i]) + 0.10 * same_cat + 0.05 * level_match
            langs = set(course.get("languages") or [])
            if src_langs and langs and not (src_langs & langs):
                score *= 0.8
            shared = [s for s in course.get("skills") or [] if s in set(source.get("skills") or [])]
            results.append((score, float(cos[i]), same_cat, level_match, shared, course))
        results.sort(key=lambda r: (-round(r[0], 10), r[5]["id"]))
        out = []
        for score, cos_v, same_cat, level_match, shared, course in results[:limit]:
            reasons = [f"Content similarity {cos_v:.2f}"]
            if shared:
                reasons.append("Shared skills: " + ", ".join(skill_label(s) for s in shared[:3]))
            if same_cat:
                reasons.append(f"Same category ({course.get('category')})")
            if level_match == 1.0:
                reasons.append(f"Same level ({course.get('level')})")
            out.append({"course": course_summary(course), "similarity": round(score, 4), "content_similarity": round(cos_v, 4),
                        "reasons": reasons})
        return out

    def pairwise_similarity(self, ids: list[str]) -> list[list[float]]:
        pos = [self.content.position[i] for i in ids]
        return [[round(float(self.content.similarity[a, b]) if a != b else 1.0, 4) for b in pos] for a in pos]
