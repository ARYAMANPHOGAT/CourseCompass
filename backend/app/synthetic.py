"""Deterministic generator for the SYNTHETIC demo interaction cohort.

The Coursera CSV contains no user-course interaction history, so collaborative
filtering and offline evaluation need a stand-in. This module simulates learners:

* each synthetic learner gets a career goal (from taxonomy), a preferred difficulty and,
  for some learners, an affinity for one provider (a "program" effect that content
  features alone do not capture);
* courses are sampled without replacement with probability proportional to
  exp(affinity / temperature), where affinity mixes career-skill coverage, category
  match, provider match, level match and the dataset rating, plus random noise;
* each sampled course gets an interaction type (save / enroll / complete / relevant),
  and some learners mark an off-topic course "irrelevant".

Every record carries `synthetic: true`. These records are NOT real student behaviour
and must never be used to claim real-world effectiveness.

Regenerate with:  python -m app.synthetic
"""
from __future__ import annotations

import argparse
from typing import Any

import numpy as np

from .config import SYNTHETIC_INTERACTIONS, Settings
from .jsonio import atomic_write_json, utc_now_iso
from .taxonomy import CAREER_GOALS, LEVELS

GENERATOR_VERSION = "1.0.0"
DEFAULT_SEED = 42
DEFAULT_USERS = 150


def generate_cohort(courses: list[dict[str, Any]], n_users: int = DEFAULT_USERS, seed: int = DEFAULT_SEED,
                    weights: dict[str, float] | None = None) -> dict[str, Any]:
    weights = weights or {"save": 1.0, "enroll": 2.0, "complete": 3.0, "relevant": 2.0, "irrelevant": -2.0}
    rng = np.random.default_rng(seed)
    providers = [c.get("provider") for c in courses if c.get("provider")]
    provider_counts: dict[str, int] = {}
    for p in providers:
        provider_counts[p] = provider_counts.get(p, 0) + 1
    common_providers = sorted([p for p, n in provider_counts.items() if n >= 4], key=lambda p: (-provider_counts[p], p))

    users: list[dict[str, Any]] = []
    interactions: list[dict[str, Any]] = []
    course_skills = [set(c.get("skills") or []) for c in courses]
    english = np.array([("English" in (c.get("languages") or [])) or not c.get("languages") for c in courses])

    for u in range(n_users):
        career = CAREER_GOALS[int(rng.integers(len(CAREER_GOALS)))]
        difficulty = LEVELS[int(rng.choice(3, p=[0.6, 0.3, 0.1]))]
        provider = common_providers[int(rng.integers(len(common_providers)))] if common_providers and rng.random() < 0.5 else None
        english_only = rng.random() < 0.9
        user_id = f"synthetic-{u + 1:03d}"
        users.append({
            "id": user_id,
            "career_goal": career.id,
            "preferred_difficulty": difficulty,
            "provider_affinity": provider,
            "languages": ["English"] if english_only else [],
            "synthetic": True,
        })
        career_skills = set(career.skills)
        affinity = np.zeros(len(courses))
        for i, c in enumerate(courses):
            coverage = len(course_skills[i] & career_skills) / max(1, min(3, len(career_skills)))
            affinity[i] = (
                2.5 * min(1.0, coverage)
                + 1.0 * (c.get("category") in career.categories)
                + 1.2 * (provider is not None and c.get("provider") == provider)
                + 0.4 * (c.get("level") == difficulty)
                + 0.3 * (min(max(((c.get("rating") or 4.5) - 4.5), -1.0), 0.5))
            )
        affinity += rng.gumbel(0.0, 0.35, size=len(courses))
        mask = english if english_only else np.ones(len(courses), dtype=bool)
        logits = np.where(mask, affinity / 0.6, -np.inf)
        probs = np.exp(logits - np.max(logits[mask]))
        probs = probs / probs.sum()
        n_items = int(min(14, max(4, 4 + rng.poisson(4))))
        n_items = min(n_items, int(mask.sum()))
        chosen = rng.choice(len(courses), size=n_items, replace=False, p=probs)
        for i in chosen:
            kind = str(rng.choice(["save", "enroll", "complete", "relevant"], p=[0.30, 0.35, 0.25, 0.10]))
            strength = weights[kind] + (weights["enroll"] if kind == "complete" else 0.0)
            interactions.append({"user_id": user_id, "course_id": courses[int(i)]["id"], "type": kind,
                                 "strength": float(strength), "synthetic": True})
        if rng.random() < 0.3:
            low = np.argsort(affinity)[: max(5, len(courses) // 5)]
            j = int(rng.choice(low))
            if j not in set(int(x) for x in chosen):
                interactions.append({"user_id": user_id, "course_id": courses[j]["id"], "type": "irrelevant",
                                     "strength": float(weights["irrelevant"]), "synthetic": True})
    return {
        "meta": {
            "synthetic": True,
            "label": "SYNTHETIC demo cohort - not real student behaviour",
            "generator_version": GENERATOR_VERSION,
            "seed": seed,
            "n_users": n_users,
            "n_interactions": len(interactions),
            "catalog_size": len(courses),
            "generated_at": utc_now_iso(),
            "description": (
                "Simulated learners whose course choices are sampled from career-skill coverage, "
                "category, provider affinity, level and rating with random noise. Used only to "
                "demonstrate collaborative filtering and to exercise the offline evaluation pipeline."
            ),
        },
        "users": users,
        "interactions": interactions,
    }


def main(argv: list[str] | None = None) -> int:
    from .catalog import load_catalog

    parser = argparse.ArgumentParser(description="Generate the synthetic demo interaction cohort.")
    parser.add_argument("--users", type=int, default=DEFAULT_USERS)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    args = parser.parse_args(argv)
    settings = Settings()
    catalog = load_catalog(settings)
    cohort = generate_cohort(catalog.courses, args.users, args.seed)
    atomic_write_json(settings.synthetic_interactions, cohort, indent=1)
    print(f"[synthetic] {cohort['meta']['n_users']} synthetic learners, {cohort['meta']['n_interactions']} interactions "
          f"-> {settings.synthetic_interactions.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
