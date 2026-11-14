"""Offline evaluation: Precision@K, Recall@K and NDCG@K with a per-user hold-out split.

Definitions
-----------
* Ground truth: a synthetic learner's held-out *positive* interactions (strength > 0).
* Split: for every synthetic learner with >= MIN_POSITIVES positive courses, a seeded
  random 25% (at least 1) of their positive courses is held out as test items. All other
  interactions form the training set. Collaborative filtering is re-trained on the
  training set only, and each learner's training items are removed from their candidate
  list, so no test interaction leaks into training or ranking.
* Relevance is binary (held-out = relevant).
* Precision@K = hits in top K / K (K is used even when fewer than K candidates exist).
* Recall@K = hits in top K / number of held-out items.
* NDCG@K = DCG@K / IDCG@K with DCG = sum rel_i / log2(i + 1) over ranks i = 1..K and the
  ideal ranking placing min(K, |relevant|) hits first.
* Aggregation: macro-average over evaluated learners (each learner weighs equally),
  reported with standard deviation and a normal-approximation 95% interval.
* Learners with too few positives are excluded and counted in the report.
* Ties in scores are broken by course id, so results are deterministic.

Methods compared: popularity baseline, cold-start content (profile only), content
(profile + training feedback), collaborative only, and hybrid.

LIMITATION: the cohort is synthetic and was generated from the same skill taxonomy the
content scorer uses, so these numbers only demonstrate that the pipeline works; they are
not evidence of real-world recommendation quality or learning outcomes.

Run:  python -m app.evaluation
"""
from __future__ import annotations

import argparse
import math
from typing import Any, Iterable

import numpy as np

from .jsonio import atomic_write_json, utc_now_iso
from .recommender.collaborative import ItemKNN
from .recommender.engine import Recommender, UserState

MIN_POSITIVES = 4
TEST_FRACTION = 0.25
DEFAULT_KS = (5, 10)
SPLIT_SEED = 7


def precision_at_k(ranked: list[str], relevant: set[str], k: int) -> float:
    if k <= 0:
        raise ValueError("k must be positive")
    return len(set(ranked[:k]) & relevant) / k


def recall_at_k(ranked: list[str], relevant: set[str], k: int) -> float | None:
    if k <= 0:
        raise ValueError("k must be positive")
    if not relevant:
        return None
    return len(set(ranked[:k]) & relevant) / len(relevant)


def ndcg_at_k(ranked: list[str], relevant: set[str], k: int) -> float | None:
    if k <= 0:
        raise ValueError("k must be positive")
    if not relevant:
        return None
    dcg = sum(1.0 / math.log2(i + 2) for i, cid in enumerate(ranked[:k]) if cid in relevant)
    idcg = sum(1.0 / math.log2(i + 2) for i in range(min(k, len(relevant))))
    return dcg / idcg if idcg > 0 else None


def _summary(values: list[float]) -> dict[str, float | int]:
    arr = np.array(values, dtype=float)
    if arr.size == 0:
        return {"mean": 0.0, "std": 0.0, "ci95": 0.0, "n": 0}
    std = float(arr.std(ddof=1)) if arr.size > 1 else 0.0
    return {"mean": round(float(arr.mean()), 4), "std": round(std, 4),
            "ci95": round(1.96 * std / math.sqrt(arr.size), 4) if arr.size > 1 else 0.0, "n": int(arr.size)}


def split_cohort(cohort: dict[str, Any], valid_ids: set[str], seed: int = SPLIT_SEED,
                 test_fraction: float = TEST_FRACTION, min_positives: int = MIN_POSITIVES) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    per_user: dict[str, dict[str, float]] = {}
    for it in cohort["interactions"]:
        if it["course_id"] not in valid_ids:
            continue
        per_user.setdefault(it["user_id"], {})
        per_user[it["user_id"]][it["course_id"]] = per_user[it["user_id"]].get(it["course_id"], 0.0) + float(it["strength"])
    train: list[tuple[str, str, float]] = []
    test: dict[str, set[str]] = {}
    train_by_user: dict[str, dict[str, float]] = {}
    excluded = 0
    for user_id in sorted(per_user):
        items = per_user[user_id]
        positives = sorted(c for c, s in items.items() if s > 0)
        if len(positives) < min_positives:
            excluded += 1
            held: set[str] = set()
        else:
            n_test = max(1, int(round(test_fraction * len(positives))))
            order = rng.permutation(len(positives))
            held = {positives[i] for i in order[:n_test]}
            test[user_id] = held
        train_by_user[user_id] = {c: s for c, s in items.items() if c not in held}
        train += [(user_id, c, s) for c, s in train_by_user[user_id].items()]
    return {"train": train, "test": test, "train_by_user": train_by_user, "excluded_users": excluded}


def _rank(scores: Iterable[tuple[str, float]], exclude: set[str]) -> list[str]:
    return [cid for cid, _ in sorted(((c, s) for c, s in scores if c not in exclude), key=lambda t: (-round(t[1], 10), t[0]))]


def run_evaluation(catalog, content_index, cohort: dict[str, Any], config: dict[str, Any],
                   ks: tuple[int, ...] = DEFAULT_KS, seed: int = SPLIT_SEED) -> dict[str, Any]:
    valid = set(catalog.by_id)
    split = split_cohort(cohort, valid, seed)
    cf_cfg = config["collaborative"]
    cf = ItemKNN([c["id"] for c in catalog.courses], split["train"], cf_cfg["neighbors"], cf_cfg["shrinkage"],
                 cf_cfg["min_item_support"])
    rec = Recommender(catalog, content_index, cf, config)
    users = {u["id"]: u for u in cohort["users"]}
    popularity: dict[str, float] = {c["id"]: 0.0 for c in catalog.courses}
    for _, cid, s in split["train"]:
        if s > 0:
            popularity[cid] += 1

    methods = ["popularity", "content_cold_start", "content", "collaborative", "hybrid"]
    metrics: dict[str, dict[str, list[float]]] = {m: {} for m in methods}
    hybrid_fallbacks = 0
    for user_id, relevant in sorted(split["test"].items()):
        persona = users.get(user_id, {})
        profile = {
            "career_goal": persona.get("career_goal"),
            "preferred_difficulty": persona.get("preferred_difficulty", "any"),
            "skill_level": persona.get("preferred_difficulty", "beginner"),
            "languages": persona.get("languages", []),
            "budget": "any",
            "preferred_duration": "any",
            "topics": [],
            "existing_skills": [],
            "objectives": "",
            "weekly_hours": 5,
        }
        train_items = split["train_by_user"].get(user_id, {})
        exclude = set(train_items)
        rankings: dict[str, list[str]] = {}
        rankings["popularity"] = _rank(popularity.items(), exclude)
        cold = rec.score_all(UserState(profile, set(), {}, {}, {}, set()), "content", include_enrolled=True)
        rankings["content_cold_start"] = _rank(((s.course_id, s.final) for s in cold.scored), exclude)
        state = UserState(profile, set(), {}, {}, dict(train_items), set())
        content_run = rec.score_all(state, "content", include_enrolled=True)
        rankings["content"] = _rank(((s.course_id, s.final) for s in content_run.scored), exclude)
        cf_res = cf.score(train_items, config["hybrid"]["min_user_interactions"])
        rankings["collaborative"] = _rank(
            ((c, (v if v is not None else -1.0)) for c, v in (cf_res.scores.items() if cf_res.available else [])), exclude
        ) if cf_res.available else rankings["popularity"]
        hybrid_run = rec.score_all(state, "hybrid", include_enrolled=True)
        if hybrid_run.method_used != "hybrid":
            hybrid_fallbacks += 1
        rankings["hybrid"] = _rank(((s.course_id, s.final) for s in hybrid_run.scored), exclude)
        for method, ranked in rankings.items():
            for k in ks:
                metrics[method].setdefault(f"precision@{k}", []).append(precision_at_k(ranked, relevant, k))
                metrics[method].setdefault(f"recall@{k}", []).append(recall_at_k(ranked, relevant, k) or 0.0)
                metrics[method].setdefault(f"ndcg@{k}", []).append(ndcg_at_k(ranked, relevant, k) or 0.0)

    results = {m: {name: _summary(vals) for name, vals in metrics[m].items()} for m in methods}
    comparison = None
    k_max = max(ks)
    key = f"ndcg@{k_max}"
    if metrics["hybrid"].get(key) and metrics["content"].get(key):
        diffs = np.array(metrics["hybrid"][key]) - np.array(metrics["content"][key])
        wins, losses = int((diffs > 1e-9).sum()), int((diffs < -1e-9).sum())
        comparison = {
            "metric": key,
            "mean_difference_hybrid_minus_content": round(float(diffs.mean()), 4),
            "users_hybrid_better": wins,
            "users_content_better": losses,
            "users_tied": int(len(diffs) - wins - losses),
            "note": "Paired per-user comparison on the same held-out items. Synthetic data only.",
        }
    n_eval = len(split["test"])
    return {
        "generated_at": utc_now_iso(),
        "dataset": {
            "label": cohort.get("meta", {}).get("label", "synthetic cohort"),
            "synthetic": True,
            "users_total": len(cohort["users"]),
            "users_evaluated": n_eval,
            "users_excluded_too_few_positives": split["excluded_users"],
            "test_items": int(sum(len(v) for v in split["test"].values())),
            "train_interactions": len(split["train"]),
            "catalog_size": len(catalog),
        },
        "protocol": {
            "split": f"per-user random hold-out of {int(TEST_FRACTION * 100)}% of positive items (min 1), seed {seed}",
            "min_positives": MIN_POSITIVES,
            "ks": list(ks),
            "relevance": "binary: held-out positive interaction",
            "aggregation": "macro-average over evaluated learners; std and 95% normal interval reported",
            "leakage_control": "CF re-trained on training interactions only; training items removed from candidates",
            "ties": "broken by course id",
        },
        "methods": {
            "popularity": "Most-interacted courses in the training data (non-personalised baseline)",
            "content_cold_start": "TF-IDF + preference scoring from the onboarding profile only",
            "content": "TF-IDF + preference scoring with Rocchio feedback from training interactions",
            "collaborative": "Item-kNN collaborative filtering only",
            "hybrid": "Preference score blended with item-kNN (confidence-weighted)",
        },
        "results": results,
        "hybrid_fallbacks_to_content": hybrid_fallbacks,
        "comparison": comparison,
        "limitations": [
            "The interaction data is SYNTHETIC (simulated learners), not real student behaviour.",
            "The simulator used the same skill taxonomy as the content scorer, which favours content-based methods.",
            "Offline ranking metrics do not measure learning outcomes, satisfaction or employment results.",
            f"Small sample: {n_eval} evaluated learners and a {len(catalog)}-course catalog.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    from .services import AppServices
    from .config import Settings

    parser = argparse.ArgumentParser(description="Run the offline recommender evaluation.")
    parser.parse_args(argv)
    services = AppServices(Settings())
    report = services.run_evaluation()
    for method, vals in report["results"].items():
        print(f"{method:20s} " + "  ".join(f"{k}={v['mean']:.3f}" for k, v in vals.items() if k.endswith("@10")))
    print(f"[evaluation] {report['dataset']['users_evaluated']} learners evaluated -> {services.settings.evaluation_report.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
