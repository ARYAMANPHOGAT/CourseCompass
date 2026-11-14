"""TF-IDF content filtering, preference scoring, collaborative filtering and the hybrid engine."""
from __future__ import annotations

import numpy as np
import pytest

from app.recommender.collaborative import ItemKNN
from app.recommender.content import ContentIndex
from app.recommender.preference import build_profile_context, score_preferences

WEIGHTS = {"content": 0.30, "goal": 0.25, "skill_fit": 0.10, "difficulty": 0.12, "duration": 0.10, "budget": 0.08, "quality": 0.05}


def snapshot(profile=None, wishlist=(), enrollments=None, feedback=None):
    base = {"career_goal": None, "skill_level": "beginner", "topics": [], "existing_skills": [], "objectives": "",
            "preferred_difficulty": "any", "weekly_hours": 5, "budget": "any", "preferred_duration": "any",
            "languages": ["English"], "onboarded": True}
    base.update(profile or {})
    return {"profile": base, "wishlist": [{"course_id": c} for c in wishlist], "enrollments": enrollments or {},
            "feedback": feedback or {}, "sessions": [], "goals": {}, "activity": []}


# ----------------------------------------------------------------------------- TF-IDF
TOY = [
    {"id": "sql-a", "title": "SQL for Analysts", "category": "Data", "skill_labels": [], "description": "sql queries joins databases"},
    {"id": "sql-b", "title": "Advanced SQL", "category": "Data", "skill_labels": [], "description": "sql window functions databases"},
    {"id": "art", "title": "Watercolour Painting", "category": "Art", "skill_labels": [], "description": "brushes paint colour"},
]


def test_tfidf_cosine_properties():
    idx = ContentIndex(TOY)
    sim = idx.similarity
    assert np.allclose(sim, sim.T)
    assert np.allclose(np.diag(sim), 1.0)
    assert sim[0, 1] > sim[0, 2]
    assert sim.min() >= 0 and sim.max() <= 1 + 1e-9


def test_rocchio_profile_moves_towards_positive_feedback():
    idx = ContentIndex(TOY)
    base = idx.scores(idx.profile_vector("databases"))
    fed = idx.scores(idx.profile_vector("databases", positive_ids=["art"]))
    assert fed[2] > base[2]
    plain = idx.scores(idx.profile_vector("sql joins window functions"))
    neg = idx.scores(idx.profile_vector("sql joins window functions", negative_ids=["sql-b"]))
    assert (neg[0] - neg[1]) > (plain[0] - plain[1])
    assert idx.profile_vector("", []) is None
    assert idx.matched_terms(idx.profile_vector("sql joins"), "sql-a")[:1] in (["sql"], ["joins"])


def test_real_catalog_similarity_is_cached_and_sensible(base_services):
    content = base_services.content
    n = len(base_services.catalog)
    assert content.similarity.shape == (n, n)
    sims = base_services.recommender.similar("sql-for-data-science", 5)
    titles = " ".join(s["course"]["title"].lower() for s in sims)
    assert "data" in titles
    assert all(s["course"]["id"] != "sql-for-data-science" for s in sims)
    assert [s["similarity"] for s in sims] == sorted([s["similarity"] for s in sims], reverse=True)


# ----------------------------------------------------------------------------- preference
COURSE = {"id": "c", "title": "SQL", "category": "Data Analysis", "skills": ["sql", "data-analysis"], "level": "beginner",
          "duration_bucket": "medium", "duration_hours": 12, "price_status": "free", "rating": 4.7}


def test_weighted_formula_is_renormalised_over_available_components():
    ctx = build_profile_context({"career_goal": "data-analyst", "preferred_difficulty": "beginner", "budget": "any",
                                 "preferred_duration": "any", "topics": [], "existing_skills": []})
    score, comps = score_preferences(COURSE, ctx, 0.5, 0.2, [], WEIGHTS)
    available = [c for c in comps if c.score is not None]
    expected = sum(c.weight * c.score for c in available) / sum(c.weight for c in available)
    assert score == pytest.approx(expected)
    assert {c.key for c in comps if c.score is None} == {"duration", "budget"}  # "any" preferences are not scored


def test_missing_metadata_is_not_a_negative_match():
    ctx = build_profile_context({"preferred_difficulty": "beginner", "career_goal": "data-analyst"})
    with_level, _ = score_preferences(COURSE, ctx, 0.5, 0.2, [], WEIGHTS)
    no_level, comps = score_preferences({**COURSE, "level": None}, ctx, 0.5, 0.2, [], WEIGHTS)
    advanced, _ = score_preferences({**COURSE, "level": "advanced"}, ctx, 0.5, 0.2, [], WEIGHTS)
    assert next(c for c in comps if c.key == "difficulty").score is None
    assert no_level > advanced  # unknown level is neutral, a known mismatch is penalised
    assert with_level >= no_level - 1e-9


def test_budget_difficulty_and_duration_components():
    ctx = build_profile_context({"budget": "free_only", "preferred_difficulty": "advanced", "preferred_duration": "extended"})
    _, comps = score_preferences({**COURSE, "price_status": "not_listed"}, ctx, None, None, [], WEIGHTS)
    by = {c.key: c for c in comps}
    assert by["budget"].score == pytest.approx(0.35)
    assert by["difficulty"].score == pytest.approx(0.1)  # beginner vs advanced: distance 2
    assert by["duration"].score == pytest.approx(0.25)  # medium vs extended: distance 2
    assert by["content"].score is None


def test_skill_fit_rewards_new_goal_skills():
    fresh = build_profile_context({"career_goal": "data-analyst", "existing_skills": []})
    expert = build_profile_context({"career_goal": "data-analyst", "existing_skills": ["sql", "data-analysis"]})
    _, a = score_preferences(COURSE, fresh, None, None, [], WEIGHTS)
    _, b = score_preferences(COURSE, expert, None, None, [], WEIGHTS)
    assert next(c for c in a if c.key == "skill_fit").score == 1.0
    assert next(c for c in b if c.key == "skill_fit").score == 0.0


# ----------------------------------------------------------------------------- collaborative
IDS = ["a", "b", "c", "d", "e"]


def toy_interactions():
    rows = []
    for u in range(6):  # a and b are always taken together
        rows += [(f"u{u}", "a", 2.0), (f"u{u}", "b", 2.0)]
    for u in range(6, 9):  # c and d together
        rows += [(f"u{u}", "c", 2.0), (f"u{u}", "d", 2.0)]
    rows.append(("u9", "e", 1.0))  # e has a single user: insufficient support
    return rows


def test_item_knn_learns_co_occurrence():
    cf = ItemKNN(IDS, toy_interactions(), neighbors=3, shrinkage=1.0, min_item_support=2)
    i = cf.position
    assert cf.similarity[i["a"], i["b"]] > cf.similarity[i["a"], i["c"]]
    res = cf.score({"a": 2.0, "c": 1.0}, min_user_interactions=2)
    assert res.available
    assert res.scores["b"] > 0 and res.scores["d"] > 0
    assert res.scores["e"] is None  # unseen/unsupported item -> neutral, not zero


def test_item_knn_insufficient_interactions_and_no_overlap():
    cf = ItemKNN(IDS, toy_interactions(), neighbors=3, shrinkage=1.0, min_item_support=2)
    assert not cf.score({"a": 2.0}, min_user_interactions=2).available
    assert not cf.score({}, min_user_interactions=2).available
    empty = ItemKNN(IDS, [], neighbors=3)
    assert not empty.is_trained
    assert not empty.score({"a": 1, "b": 1}).available
    lonely = ItemKNN(IDS, [("u1", "a", 1.0), ("u2", "b", 1.0)], neighbors=3, shrinkage=1.0, min_item_support=1)
    res = lonely.score({"a": 1.0, "b": 1.0})
    assert not res.available and "overlap" in res.reason


# ----------------------------------------------------------------------------- hybrid engine
def test_cold_start_profile_only_gives_relevant_recommendations(base_services, analyst_profile):
    rec = base_services.recommender.recommend(snapshot(analyst_profile), mode="hybrid", limit=10)
    assert rec["method_used"] == "content_fallback"
    assert rec["cf_status"]["available"] is False
    data_skills = {"sql", "data-analysis", "data-visualization", "excel", "statistics"}
    top = rec["results"][:5]
    assert all(set(r["course"]["skills"]) & data_skills for r in top)
    assert rec["profile_complete"] is True


def test_cold_start_without_preferences_still_returns_results(base_services):
    rec = base_services.recommender.recommend(snapshot({"onboarded": False}), limit=5)
    assert len(rec["results"]) == 5
    assert rec["profile_complete"] is False
    assert "complete onboarding" in rec["results"][0]["explanation"]["summary"].lower()


def test_hybrid_uses_cf_when_enough_interactions(base_services, analyst_profile):
    snap = snapshot(analyst_profile, wishlist=["sql-for-data-science"],
                    feedback={"excel-basics-data-analysis-ibm": {"kind": "relevant"}})
    rec = base_services.recommender.recommend(snap, mode="hybrid", limit=10)
    assert rec["method_used"] == "hybrid"
    cfg = base_services.settings.recommender["hybrid"]
    expected_lam = cfg["collaborative_weight_max"] * min(1, 2 / cfg["full_confidence_interactions"])
    assert rec["cf_status"]["weight"] == pytest.approx(expected_lam, abs=1e-3)
    for r in rec["results"]:
        total = sum(c["final_contribution"] for c in r["components"])
        assert total == pytest.approx(r["score"], abs=2e-3)  # explanation == actual calculation
        assert any(c["key"] == "collaborative" for c in r["components"])
        pref, cf = r["preference_score"], r["collaborative_score"]
        lam = r["hybrid_weights"]["collaborative"]
        assert r["score"] == pytest.approx((1 - lam) * pref + lam * (cf or 0.0), abs=2e-3)


def test_content_mode_has_no_collaborative_component(base_services, analyst_profile):
    snap = snapshot(analyst_profile, wishlist=["sql-for-data-science", "excel-basics-data-analysis-ibm"])
    rec = base_services.recommender.recommend(snap, mode="content", limit=5)
    assert rec["method_used"] == "content"
    for r in rec["results"]:
        assert all(c["key"] != "collaborative" for c in r["components"])
        assert r["score"] == pytest.approx(r["preference_score"], abs=1e-4)


def test_completed_irrelevant_and_enrolled_courses_are_excluded(base_services, analyst_profile):
    first = base_services.recommender.recommend(snapshot(analyst_profile), mode="content", limit=4)["results"]
    a, b, c, d = (r["course"]["id"] for r in first)
    snap = snapshot(
        analyst_profile,
        enrollments={a: {"state": "completed"}, b: {"state": "active"}},
        feedback={c: {"kind": "irrelevant"}, d: {"kind": "previously_studied"}},
    )
    rec = base_services.recommender.recommend(snap, mode="content", limit=50)
    ids = {r["course"]["id"] for r in rec["results"]}
    assert not ids & {a, b, c, d}
    assert rec["excluded"]["completed"] == 1 and rec["excluded"]["marked_irrelevant"] == 1
    with_enrolled = base_services.recommender.recommend(snap, mode="content", limit=200, include_enrolled=True)
    assert b in {r["course"]["id"] for r in with_enrolled["results"]}


def test_language_preference_excludes_known_other_languages(base_services, analyst_profile):
    rec = base_services.recommender.recommend(snapshot(analyst_profile), mode="content", limit=200)
    for r in rec["results"]:
        langs = r["course"]["languages"]
        assert not langs or "English" in langs
    assert rec["excluded"].get("language", 0) > 0


def test_recommendations_are_deterministic(base_services, analyst_profile):
    a = base_services.recommender.recommend(snapshot(analyst_profile), limit=20)
    b = base_services.recommender.recommend(snapshot(analyst_profile), limit=20)
    assert [r["course"]["id"] for r in a["results"]] == [r["course"]["id"] for r in b["results"]]


def test_explain_reports_gap_to_top_course(base_services, analyst_profile):
    snap = snapshot(analyst_profile)
    top = base_services.recommender.recommend(snap, limit=1)["results"][0]["course"]["id"]
    other = "astro-101-black-holes" if base_services.catalog.exists("astro-101-black-holes") else base_services.catalog.courses[-1]["id"]
    exp = base_services.recommender.explain(snap, other)
    assert exp["comparison"]["top_course"]["id"] == top
    assert exp["comparison"]["score_gap"] > 0
    assert exp["comparison"]["largest_gaps"]


def test_explanations_never_invent_prerequisites(base_services, analyst_profile):
    rec = base_services.recommender.recommend(snapshot(analyst_profile), limit=5)
    for r in rec["results"]:
        assert "not listed" in r["explanation"]["prerequisite_note"]
        assert "not a probability" in r["explanation"]["score_note"]
