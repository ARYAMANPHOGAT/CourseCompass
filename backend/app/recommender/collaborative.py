"""Item-based collaborative filtering (item-kNN) over implicit interactions.

Interaction strengths (save / enroll / complete / relevant / rating, see
interactions.py) form a sparse user x item matrix R. Positive strengths are
log-scaled (log1p) to damp heavy users.

    sim(i, j) = cos(R[:, i], R[:, j]) * n_ij / (n_ij + lambda)

where n_ij is the number of users who interacted with both items and lambda is a
significance-weighting shrinkage constant. Only the top-k neighbours of each item are
kept. For a student with positive interactions w_j:

    cf(i) = sum_{j in student's items} sim(i, j) * w_j

Items with fewer than `min_item_support` interacting users have no reliable evidence
and return None (neutral) rather than 0.

IMPORTANT: the only interaction history available is the clearly labelled SYNTHETIC
demo cohort (data/demo/synthetic_interactions.json). This module never claims that
those records are real student behaviour.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
from scipy import sparse


@dataclass
class CFResult:
    available: bool
    reason: str
    scores: dict[str, float | None]
    contributions: dict[str, list[tuple[str, float]]]
    user_items: int


class ItemKNN:
    def __init__(
        self,
        course_ids: list[str],
        interactions: Iterable[tuple[str, str, float]],
        neighbors: int = 20,
        shrinkage: float = 5.0,
        min_item_support: int = 2,
    ):
        self.course_ids = list(course_ids)
        self.position = {cid: i for i, cid in enumerate(self.course_ids)}
        self.neighbors = neighbors
        self.shrinkage = shrinkage
        self.min_item_support = min_item_support

        users: dict[str, int] = {}
        rows: list[int] = []
        cols: list[int] = []
        vals: list[float] = []
        for user_id, course_id, strength in interactions:
            if course_id not in self.position or strength <= 0:
                continue
            u = users.setdefault(user_id, len(users))
            rows.append(u)
            cols.append(self.position[course_id])
            vals.append(float(np.log1p(strength)))
        self.n_users = len(users)
        n_items = len(self.course_ids)
        if self.n_users == 0:
            self.R = sparse.csr_matrix((0, n_items))
            self.similarity = np.zeros((n_items, n_items))
            self.support = np.zeros(n_items, dtype=int)
            return
        R = sparse.coo_matrix((vals, (rows, cols)), shape=(self.n_users, n_items)).tocsr()
        R.sum_duplicates()
        self.R = R
        binary = (R > 0).astype(np.float64)
        self.support = np.asarray(binary.sum(axis=0)).ravel().astype(int)
        co_counts = (binary.T @ binary).toarray()
        dot = (R.T @ R).toarray()
        norms = np.sqrt(np.diag(dot))
        denom = np.outer(norms, norms)
        with np.errstate(divide="ignore", invalid="ignore"):
            sim = np.where(denom > 0, dot / denom, 0.0)
        sim *= co_counts / (co_counts + self.shrinkage)
        np.fill_diagonal(sim, 0.0)
        if neighbors and neighbors < n_items:
            # keep only the top-k neighbours per item (row-wise)
            kth = np.argpartition(-sim, neighbors, axis=1)[:, neighbors:]
            np.put_along_axis(sim, kth, 0.0, axis=1)
        self.similarity = sim

    @property
    def is_trained(self) -> bool:
        return self.n_users > 0

    def has_evidence(self, course_id: str) -> bool:
        idx = self.position.get(course_id)
        return idx is not None and self.support[idx] >= self.min_item_support

    def score(self, user_items: dict[str, float], min_user_interactions: int = 2) -> CFResult:
        positives = {cid: w for cid, w in user_items.items() if w > 0 and cid in self.position}
        n = len(positives)
        if not self.is_trained:
            return CFResult(False, "No interaction data is loaded.", {}, {}, n)
        if n < min_user_interactions:
            return CFResult(
                False,
                f"Needs positive interactions (save, enrol, complete, 'relevant' or a good rating) with at least "
                f"{min_user_interactions} different courses; you have {n}.",
                {},
                {},
                n,
            )
        idx = np.array([self.position[c] for c in positives])
        weights = np.array([np.log1p(positives[c]) for c in positives])
        contrib_matrix = self.similarity[:, idx] * weights  # items x user_items
        raw = contrib_matrix.sum(axis=1)
        scores: dict[str, float | None] = {}
        contributions: dict[str, list[tuple[str, float]]] = {}
        user_ids = list(positives)
        for cid, i in self.position.items():
            if self.support[i] < self.min_item_support:
                scores[cid] = None
                continue
            scores[cid] = float(raw[i])
            row = contrib_matrix[i]
            top = np.argsort(-row)[:3]
            contributions[cid] = [(user_ids[j], float(row[j])) for j in top if row[j] > 0]
        if not any((v or 0) > 0 for v in scores.values()):
            return CFResult(False, "Your saved/enrolled courses have no co-interaction overlap in the cohort.", {}, {}, n)
        return CFResult(True, "Collaborative evidence available.", scores, contributions, n)
