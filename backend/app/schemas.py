"""Pydantic models for request validation and typed API responses."""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .taxonomy import CAREER_BY_ID, SKILL_BY_ID

Level = Literal["beginner", "intermediate", "advanced"]
DifficultyPref = Literal["beginner", "intermediate", "advanced", "any"]
DurationPref = Literal["short", "medium", "long", "extended", "any"]
Budget = Literal["any", "free_only"]
EnrollmentState = Literal["active", "paused", "completed"]
FeedbackKind = Literal["relevant", "irrelevant", "previously_studied"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# ---------------------------------------------------------------- core entities
class CourseSummary(BaseModel):
    id: str
    title: str
    url: Optional[str] = None
    provider: Optional[str] = None
    content_type: Optional[str] = None
    content_type_label: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    duration_text: Optional[str] = None
    duration_bucket: Optional[str] = None
    duration_hours: Optional[float] = None
    duration_months: Optional[float] = None
    price_status: Optional[str] = None
    is_free: Optional[bool] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    language: Optional[str] = None
    languages: list[str] = []
    skills: list[str] = []
    skill_labels: list[str] = []
    image_url: Optional[str] = None
    source: Optional[str] = None
    certificate: Optional[bool] = None
    module_count: Optional[int] = None
    description_snippet: Optional[str] = None
    match_percent: Optional[int] = None
    relevance: Optional[float] = None


class Course(CourseSummary):
    description: Optional[str] = None
    modules: list[str] = []
    prerequisites: Optional[str] = None
    content_type_source: Optional[str] = None
    skills_source: Optional[str] = None
    scraped_at: Optional[str] = None


class StudentProfile(BaseModel):
    id: str = "demo-student"
    display_name: str = "Demo Student"
    career_goal: Optional[str] = None
    skill_level: Level = "beginner"
    topics: list[str] = []
    existing_skills: list[str] = []
    objectives: str = ""
    preferred_difficulty: DifficultyPref = "any"
    weekly_hours: float = 5.0
    budget: Budget = "any"
    preferred_duration: DurationPref = "any"
    languages: list[str] = ["English"]
    onboarded: bool = False
    updated_at: Optional[str] = None


class ProfileUpdate(StrictModel):
    display_name: str = Field("Demo Student", min_length=1, max_length=60)
    career_goal: Optional[str] = None
    skill_level: Level = "beginner"
    topics: list[str] = Field(default_factory=list, max_length=12)
    existing_skills: list[str] = Field(default_factory=list, max_length=40)
    objectives: str = Field("", max_length=600)
    preferred_difficulty: DifficultyPref = "any"
    weekly_hours: float = Field(5.0, ge=0, le=80)
    budget: Budget = "any"
    preferred_duration: DurationPref = "any"
    languages: list[str] = Field(default_factory=lambda: ["English"], max_length=10)
    onboarded: bool = True

    @field_validator("career_goal")
    @classmethod
    def _career(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        if v not in CAREER_BY_ID:
            raise ValueError(f"unknown career goal '{v}'")
        return v

    @field_validator("existing_skills")
    @classmethod
    def _skills(cls, v: list[str]) -> list[str]:
        unknown = [s for s in v if s not in SKILL_BY_ID]
        if unknown:
            raise ValueError(f"unknown skills: {', '.join(unknown)}")
        return sorted(set(v))


class ConfirmBody(StrictModel):
    confirm: bool = Field(..., description="Must be true to perform a destructive action")


class WishlistAdd(StrictModel):
    course_id: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = Field(None, max_length=300)


class WishlistEntry(BaseModel):
    course_id: str
    added_at: str
    note: Optional[str] = None
    demo: bool = False
    course: Optional[CourseSummary] = None


class FeedbackIn(StrictModel):
    course_id: str = Field(..., min_length=1, max_length=200)
    kind: Optional[FeedbackKind] = None
    rating: Optional[int] = Field(None, ge=1, le=5)

    @model_validator(mode="after")
    def _one(self) -> "FeedbackIn":
        if self.kind is None and self.rating is None:
            raise ValueError("provide a feedback kind and/or a rating")
        return self


class Feedback(BaseModel):
    course_id: str
    kind: Optional[str] = None
    rating: Optional[int] = None
    updated_at: Optional[str] = None
    demo: bool = False


class EnrollIn(StrictModel):
    course_id: str = Field(..., min_length=1, max_length=200)
    total_lessons: Optional[int] = Field(None, ge=1, le=500)
    target_date: Optional[dt.date] = None


class EnrollmentUpdate(StrictModel):
    state: Optional[EnrollmentState] = None
    completed_lessons: Optional[int] = Field(None, ge=0, le=500)
    total_lessons: Optional[int] = Field(None, ge=1, le=500)
    target_date: Optional[dt.date] = None
    clear_target_date: bool = False


class CourseProgress(BaseModel):
    completed_lessons: int
    total_lessons: int
    percent: float
    minutes: int
    sessions: int
    last_studied: Optional[str] = None


class Enrollment(BaseModel):
    course_id: str
    enrolled_at: str
    state: EnrollmentState
    status: str
    completed_lessons: int
    total_lessons: int
    lessons_source: Optional[str] = None
    target_date: Optional[str] = None
    completed_at: Optional[str] = None
    paused_at: Optional[str] = None
    updated_at: Optional[str] = None
    demo: bool = False
    progress: CourseProgress
    course: Optional[CourseSummary] = None


class SessionIn(StrictModel):
    minutes: int = Field(..., ge=1, le=1440, description="Study time in minutes (1-1440)")
    date: Optional[dt.date] = None
    lessons_completed: int = Field(0, ge=0, le=100)
    note: Optional[str] = Field(None, max_length=300)

    @field_validator("date")
    @classmethod
    def _not_future(cls, v: Optional[dt.date]) -> Optional[dt.date]:
        # one day of tolerance: the browser's local date can be ahead of the server's clock
        if v is not None and v > dt.date.today() + dt.timedelta(days=1):
            raise ValueError("study session date cannot be in the future")
        return v


class StudySession(BaseModel):
    id: str
    course_id: str
    date: str
    minutes: int
    lessons_completed: int = 0
    note: Optional[str] = None
    created_at: Optional[str] = None
    demo: bool = False
    course_title: Optional[str] = None


class LearningGoal(BaseModel):
    weekly_hours_target: float
    weekly_sessions_target: int
    updated_at: Optional[str] = None


class GoalUpdate(StrictModel):
    weekly_hours_target: float = Field(..., ge=0.5, le=80)
    weekly_sessions_target: int = Field(3, ge=1, le=21)


class MilestoneUpdate(StrictModel):
    completed: bool


class RoadmapMilestone(BaseModel):
    completed: bool
    updated_at: Optional[str] = None


class CompareIn(StrictModel):
    course_ids: list[str] = Field(..., min_length=2, max_length=3)
    mode: Literal["hybrid", "content"] = "hybrid"


class ScoreComponent(BaseModel):
    key: str
    label: str
    score: Optional[float] = None
    weight: float
    effective_weight: float
    contribution: float
    final_contribution: float
    available: bool
    detail: str
    data: dict[str, Any] = {}


class RecommendationExplanation(BaseModel):
    summary: str
    reasons: list[dict[str, Any]]
    unavailable_components: list[dict[str, Any]] = []
    matched_topics: list[str] = []
    matched_career_skills: list[str] = []
    new_skills: list[str] = []
    known_skills: list[str] = []
    matched_terms: list[str] = []
    career_goal: Optional[str] = None
    cautions: list[str] = []
    prerequisite_note: str
    score_note: str


class RecommendationResult(BaseModel):
    rank: Optional[int] = None
    course: CourseSummary
    score: float
    match_percent: int
    preference_score: Optional[float] = None
    collaborative_score: Optional[float] = None
    method: str
    hybrid_weights: dict[str, float]
    components: list[ScoreComponent]
    explanation: RecommendationExplanation
    excluded_reason: Optional[str] = None


class RecommendationResponse(BaseModel):
    mode_requested: str
    method_used: str
    cf_status: dict[str, Any]
    weights: dict[str, Any]
    profile_complete: bool
    total_candidates: int
    excluded: dict[str, int]
    results: list[RecommendationResult]


class EvaluationResult(BaseModel):
    generated_at: str
    dataset: dict[str, Any]
    protocol: dict[str, Any]
    methods: dict[str, str]
    results: dict[str, dict[str, dict[str, Any]]]
    hybrid_fallbacks_to_content: int
    comparison: Optional[dict[str, Any]] = None
    limitations: list[str]
