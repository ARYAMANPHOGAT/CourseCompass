"""Content-based filtering with scikit-learn TF-IDF and cosine similarity.

Each course becomes a document built from its title (weighted x2), category, detected
skill labels, description and syllabus. The TF-IDF matrix and the full course-course
cosine-similarity matrix are computed once when the catalog loads and cached in memory.

TfidfVectorizer L2-normalises every row, so a dot product between two rows *is* their
cosine similarity.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer

_SPACE = re.compile(r"\s+")


def build_document(course: dict[str, Any]) -> str:
    parts = [
        course.get("title") or "",
        course.get("title") or "",
        course.get("category") or "",
        " ".join(course.get("skill_labels") or []),
        course.get("description") or "",
        (course.get("syllabus_text") or "")[:4000],
    ]
    return _SPACE.sub(" ", " ".join(parts)).strip().lower()


class ContentIndex:
    """Precomputed TF-IDF vectors and cosine-similarity matrix for the catalog."""

    def __init__(self, courses: list[dict[str, Any]]):
        self.course_ids = [c["id"] for c in courses]
        self.position = {cid: i for i, cid in enumerate(self.course_ids)}
        documents = [build_document(c) for c in courses]
        if not any(documents):
            documents = [c["id"] for c in courses]
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            sublinear_tf=True,
            strip_accents="unicode",
            min_df=1,
            max_df=0.85 if len(courses) > 20 else 1.0,
            token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9+#\-]{1,}\b",
        )
        self.matrix: sparse.csr_matrix = self.vectorizer.fit_transform(documents).tocsr()
        self.features = np.array(self.vectorizer.get_feature_names_out())
        sim = (self.matrix @ self.matrix.T).toarray()
        self.similarity: np.ndarray = np.clip(sim, 0.0, 1.0)

    # ---------------------------------------------------------------- vectors
    def text_vector(self, text: str) -> np.ndarray | None:
        text = (text or "").strip().lower()
        if not text:
            return None
        vec = self.vectorizer.transform([text]).toarray()[0]
        return vec if np.any(vec) else None

    def course_vector(self, course_id: str) -> np.ndarray:
        return self.matrix[self.position[course_id]].toarray()[0]

    def profile_vector(
        self,
        query_text: str,
        positive_ids: Iterable[str] = (),
        negative_ids: Iterable[str] = (),
        alpha: float = 1.0,
        beta: float = 0.6,
        gamma: float = 0.4,
    ) -> np.ndarray | None:
        """Rocchio relevance feedback: alpha*query + beta*mean(positives) - gamma*mean(negatives)."""
        dim = self.matrix.shape[1]
        vec = np.zeros(dim)
        used = False
        q = self.text_vector(query_text)
        if q is not None:
            vec += alpha * q
            used = True
        pos = [self.position[i] for i in positive_ids if i in self.position]
        if pos:
            vec += beta * np.asarray(self.matrix[pos].mean(axis=0)).ravel()
            used = True
        neg = [self.position[i] for i in negative_ids if i in self.position]
        if neg and used:
            vec -= gamma * np.asarray(self.matrix[neg].mean(axis=0)).ravel()
        if not used:
            return None
        vec = np.clip(vec, 0.0, None)
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else None

    def scores(self, profile: np.ndarray | None) -> np.ndarray:
        """Cosine similarity of the (unit) profile vector with every course."""
        if profile is None:
            return np.zeros(len(self.course_ids))
        return np.clip(self.matrix @ profile, 0.0, 1.0)

    def matched_terms(self, profile: np.ndarray | None, course_id: str, n: int = 5) -> list[str]:
        """Terms contributing most to the profile-course similarity (for explanations)."""
        if profile is None or course_id not in self.position:
            return []
        row = self.matrix[self.position[course_id]]
        contrib = row.multiply(profile).tocoo()
        if contrib.nnz == 0:
            return []
        order = np.argsort(-contrib.data)
        terms: list[str] = []
        for idx in order:
            term = str(self.features[contrib.col[idx]])
            if any(term in t or t in term for t in terms):
                continue
            terms.append(term)
            if len(terms) >= n:
                break
        return terms

    def similar(self, course_id: str) -> np.ndarray:
        return self.similarity[self.position[course_id]]

    def search_scores(self, query: str) -> np.ndarray:
        q = self.text_vector(query)
        if q is None:
            return np.zeros(len(self.course_ids))
        return np.clip(self.matrix @ q, 0.0, 1.0)
