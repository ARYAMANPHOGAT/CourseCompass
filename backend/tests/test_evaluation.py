"""Evaluation metrics and the hold-out protocol."""
from __future__ import annotations

import math

import pytest

from app.evaluation import ndcg_at_k, precision_at_k, recall_at_k, run_evaluation, split_cohort


def test_precision_recall_hand_computed():
    ranked = ["a", "b", "c", "d", "e"]
    relevant = {"b", "e", "z"}
    assert precision_at_k(ranked, relevant, 2) == pytest.approx(0.5)
    assert precision_at_k(ranked, relevant, 5) == pytest.approx(2 / 5)
    assert recall_at_k(ranked, relevant, 2) == pytest.approx(1 / 3)
    assert recall_at_k(ranked, relevant, 5) == pytest.approx(2 / 3)


def test_ndcg_hand_computed():
    ranked = ["a", "b", "c"]
    relevant = {"b", "c"}
    dcg = 1 / math.log2(3) + 1 / math.log2(4)
    idcg = 1 / math.log2(2) + 1 / math.log2(3)
    assert ndcg_at_k(ranked, relevant, 3) == pytest.approx(dcg / idcg)
    assert ndcg_at_k(["b", "c", "a"], relevant, 3) == pytest.approx(1.0)


def test_metric_edge_cases():
    assert recall_at_k(["a"], set(), 5) is None
    assert ndcg_at_k(["a"], set(), 5) is None
    assert precision_at_k(["a"], {"a"}, 5) == pytest.approx(0.2)  # K used even with fewer candidates
    assert precision_at_k([], {"a"}, 3) == 0.0
    with pytest.raises(ValueError):
        precision_at_k(["a"], {"a"}, 0)
    with pytest.raises(ValueError):
        ndcg_at_k(["a"], {"a"}, -1)


def test_split_has_no_leakage_and_is_seeded(base_services):
    valid = set(base_services.catalog.by_id)
    a = split_cohort(base_services.cohort, valid, seed=7)
    b = split_cohort(base_services.cohort, valid, seed=7)
    assert a["test"] == b["test"]
    train_pairs = {(u, c) for u, c, _ in a["train"]}
    for user, held in a["test"].items():
        assert held
        assert not any((user, c) in train_pairs for c in held)


def test_run_evaluation_computes_bounded_reproducible_metrics(base_services):
    r1 = run_evaluation(base_services.catalog, base_services.content, base_services.cohort, base_services.settings.recommender)
    r2 = run_evaluation(base_services.catalog, base_services.content, base_services.cohort, base_services.settings.recommender)
    assert r1["results"] == r2["results"]
    assert r1["dataset"]["synthetic"] is True
    assert r1["dataset"]["users_evaluated"] > 0
    for method in ("popularity", "content_cold_start", "content", "collaborative", "hybrid"):
        for name, stats in r1["results"][method].items():
            assert 0.0 <= stats["mean"] <= 1.0, (method, name)
    assert any("SYNTHETIC" in lim for lim in r1["limitations"])
