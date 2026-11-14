import type { CourseSummary, Enrollment, RecommendationResponse, RecommendationResult, StudentProfile, Taxonomy } from "../api/types";

export const taxonomy: Taxonomy = {
  career_goals: [{ id: "data-analyst", label: "Data Analyst", description: "Analyse data", skills: ["sql"], categories: ["Data Analysis"] }],
  skills: [
    { id: "sql", label: "SQL & Databases", group: "data", group_label: "Data & AI" },
    { id: "excel", label: "Excel & Spreadsheets", group: "data", group_label: "Data & AI" },
  ],
  skill_groups: [{ id: "data", label: "Data & AI" }],
  categories: ["Data Analysis"],
  languages: ["English"],
  levels: ["beginner", "intermediate", "advanced"],
  durations: [{ id: "medium", label: "Medium" }],
  content_types: [{ id: "course", label: "Course" }],
  catalog_source: "dataset",
};

export const profile: StudentProfile = {
  id: "demo-student",
  display_name: "Test Student",
  career_goal: "data-analyst",
  skill_level: "beginner",
  topics: ["Data Analysis"],
  existing_skills: [],
  objectives: "",
  preferred_difficulty: "beginner",
  weekly_hours: 5,
  budget: "any",
  preferred_duration: "any",
  languages: ["English"],
  onboarded: true,
  updated_at: null,
};

export function course(id: string, title: string, extra: Partial<CourseSummary> = {}): CourseSummary {
  return {
    id,
    title,
    url: `https://www.coursera.org/learn/${id}`,
    provider: "Test University",
    content_type: "course",
    content_type_label: "Course",
    category: "Data Analysis",
    level: "beginner",
    duration_text: "Approx. 12 hours to complete",
    duration_bucket: "medium",
    duration_hours: 12,
    duration_months: null,
    price_status: "free",
    is_free: true,
    rating: 4.7,
    review_count: null,
    language: "English",
    languages: ["English"],
    skills: ["sql"],
    skill_labels: ["SQL & Databases"],
    image_url: null,
    source: "dataset",
    certificate: true,
    module_count: 4,
    description_snippet: "Learn SQL.",
    match_percent: 82,
    user: { wishlisted: false, enrollment_state: null, feedback: null },
    ...extra,
  };
}

export function recommendation(c: CourseSummary, rank: number, score = 0.82): RecommendationResult {
  return {
    rank,
    course: c,
    score,
    match_percent: Math.round(score * 100),
    preference_score: score,
    collaborative_score: null,
    method: "content_fallback",
    hybrid_weights: { preference: 1, collaborative: 0 },
    components: [
      { key: "content", label: "Content relevance", score: 0.9, weight: 0.3, effective_weight: 0.4, contribution: 0.36, final_contribution: 0.36, available: true, detail: "Text similarity 0.30", data: {} },
      { key: "goal", label: "Goal & topic alignment", score: 1, weight: 0.25, effective_weight: 0.46, contribution: 0.46, final_contribution: 0.46, available: true, detail: "Covers 1 Data Analyst skill: SQL & Databases", data: {} },
      { key: "duration", label: "Duration fit", score: null, weight: 0.1, effective_weight: 0, contribution: 0, final_contribution: 0, available: false, detail: "No preferred duration set", data: {} },
    ],
    explanation: {
      summary: "Recommended because its description closely matches your goals.",
      reasons: [],
      unavailable_components: [],
      matched_topics: ["Data Analysis"],
      matched_career_skills: ["SQL & Databases"],
      new_skills: ["SQL & Databases"],
      known_skills: [],
      matched_terms: ["sql"],
      career_goal: "Data Analyst",
      cautions: [],
      prerequisite_note: "Prerequisites are not listed in the source data, so prerequisite gaps cannot be checked.",
      score_note: "Match score is a preference-match score, not a probability.",
    },
    excluded_reason: null,
  };
}

export function recResponse(results: RecommendationResult[]): RecommendationResponse {
  return {
    mode_requested: "hybrid",
    method_used: "content_fallback",
    cf_status: { available: false, reason: "Needs at least 2 positive interactions; you have 0.", user_interactions: 0, min_required: 2, confidence: 0, data_label: "synthetic demo cohort" },
    weights: { preference: { content: 0.3 }, collaborative_max: 0.3 },
    profile_complete: true,
    total_candidates: results.length,
    excluded: {},
    results,
  };
}

export function enrollment(c: CourseSummary, extra: Partial<Enrollment> = {}): Enrollment {
  return {
    course_id: c.id,
    enrolled_at: "2026-10-01T10:00:00+00:00",
    state: "active",
    status: "in_progress",
    completed_lessons: 2,
    total_lessons: 4,
    lessons_source: "user",
    target_date: null,
    completed_at: null,
    paused_at: null,
    updated_at: null,
    demo: false,
    progress: { completed_lessons: 2, total_lessons: 4, percent: 50, minutes: 90, sessions: 2, last_studied: "2026-10-20" },
    course: c,
    ...extra,
  };
}
