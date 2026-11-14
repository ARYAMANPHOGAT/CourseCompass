"""Interaction schema shared by the live student and the synthetic demo cohort.

Event          Default strength   Meaning
-------------  -----------------  ------------------------------------------------
save           +1.0               course added to wishlist
enroll         +2.0               course added to My Learning
complete       +3.0               course marked completed (added on top of enroll)
relevant       +2.0               explicit "relevant" feedback
previously_studied +2.0           student says they already studied the course
irrelevant     -2.0               explicit "not relevant" feedback
rating r       (r - 3) x 1.0      optional 1-5 star rating (5 -> +2, 1 -> -2)

The per-course strength is the sum of its events, clipped to [-3, 5]. Positive
strengths feed collaborative filtering and Rocchio feedback; negative strengths push
the content profile away from a course. Weights live in config (interaction_weights).
"""
from __future__ import annotations

from typing import Any

STRENGTH_MIN = -3.0
STRENGTH_MAX = 5.0


def user_interaction_strengths(
    wishlist: list[dict[str, Any]],
    enrollments: dict[str, dict[str, Any]],
    feedback: dict[str, dict[str, Any]],
    weights: dict[str, float],
) -> dict[str, float]:
    strengths: dict[str, float] = {}

    def add(course_id: str, value: float) -> None:
        strengths[course_id] = strengths.get(course_id, 0.0) + value

    for item in wishlist:
        add(item["course_id"], weights["save"])
    for course_id, enr in enrollments.items():
        add(course_id, weights["enroll"])
        if enr.get("state") == "completed":
            add(course_id, weights["complete"])
    for course_id, fb in feedback.items():
        kind = fb.get("kind")
        if kind in ("relevant", "irrelevant", "previously_studied"):
            add(course_id, weights[kind])
        rating = fb.get("rating")
        if isinstance(rating, (int, float)) and 1 <= rating <= 5:
            add(course_id, (rating - 3) * weights["rating_per_star_from_3"])
    return {k: max(STRENGTH_MIN, min(STRENGTH_MAX, v)) for k, v in strengths.items() if v != 0}
