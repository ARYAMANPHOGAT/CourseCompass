// Types mirror the FastAPI response schemas (see http://127.0.0.1:8000/docs).

export type Level = "beginner" | "intermediate" | "advanced";
export type DifficultyPref = Level | "any";
export type DurationBucket = "short" | "medium" | "long" | "extended";
export type DurationPref = DurationBucket | "any";
export type Budget = "any" | "free_only";
export type EnrollmentState = "active" | "paused" | "completed";
export type EnrollmentStatus = "not_started" | "in_progress" | "paused" | "completed";
export type FeedbackKind = "relevant" | "irrelevant" | "previously_studied";
export type RecMode = "hybrid" | "content";

export interface CourseSummary {
  id: string;
  title: string;
  url: string | null;
  provider: string | null;
  content_type: string | null;
  content_type_label: string | null;
  category: string | null;
  level: Level | null;
  duration_text: string | null;
  duration_bucket: DurationBucket | null;
  duration_hours: number | null;
  duration_months: number | null;
  price_status: "free" | "not_listed" | "paid" | "unknown" | null;
  is_free: boolean | null;
  rating: number | null;
  review_count: number | null;
  language: string | null;
  languages: string[];
  skills: string[];
  skill_labels: string[];
  image_url: string | null;
  source: "dataset" | "sample" | null;
  certificate: boolean | null;
  module_count: number | null;
  description_snippet: string | null;
  match_percent?: number | null;
  relevance?: number | null;
  user?: { wishlisted: boolean; enrollment_state: EnrollmentState | null; feedback: FeedbackKind | null };
}

export interface CourseFull extends CourseSummary {
  description: string | null;
  modules: string[];
  prerequisites: string | null;
  content_type_source: string | null;
  skills_source: string | null;
  scraped_at: string | null;
}

export interface Facet {
  value: string;
  label: string;
  count: number;
}

export interface CourseSearchResponse {
  items: CourseSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  sort: string;
  facets: Record<"categories" | "content_types" | "levels" | "durations" | "price_statuses" | "languages", Facet[]>;
  query: string | null;
  personalized: boolean;
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number | null;
  weight: number;
  effective_weight: number;
  contribution: number;
  final_contribution: number;
  available: boolean;
  detail: string;
  data: Record<string, unknown>;
}

export interface ExplanationReason {
  key: string;
  label: string;
  text: string;
  impact: "positive" | "neutral" | "negative";
  score: number | null;
  final_contribution: number;
}

export interface RecommendationExplanation {
  summary: string;
  reasons: ExplanationReason[];
  unavailable_components: { key: string; label: string; text: string }[];
  matched_topics: string[];
  matched_career_skills: string[];
  new_skills: string[];
  known_skills: string[];
  matched_terms: string[];
  career_goal: string | null;
  cautions: string[];
  prerequisite_note: string;
  score_note: string;
}

export interface RecommendationResult {
  rank: number | null;
  course: CourseSummary;
  score: number;
  match_percent: number;
  preference_score: number | null;
  collaborative_score: number | null;
  method: string;
  hybrid_weights: { preference: number; collaborative: number };
  components: ScoreComponent[];
  explanation: RecommendationExplanation;
  excluded_reason: string | null;
}

export interface CfStatus {
  available: boolean;
  reason: string;
  user_interactions: number;
  min_required: number;
  confidence: number;
  weight?: number;
  data_label: string;
}

export interface RecommendationResponse {
  mode_requested: RecMode;
  method_used: "hybrid" | "content" | "content_fallback";
  cf_status: CfStatus;
  weights: { preference: Record<string, number>; collaborative_max: number };
  profile_complete: boolean;
  total_candidates: number;
  excluded: Record<string, number>;
  results: RecommendationResult[];
}

export interface ExplainResponse extends RecommendationResult {
  comparison: {
    top_course: CourseSummary;
    top_score: number;
    score_gap: number;
    largest_gaps: { key: string; label: string; this: number; top: number; delta: number }[];
    text: string;
  } | null;
  total_ranked: number;
  method_used: string;
  cf_status: CfStatus;
}

export interface CourseDetailResponse {
  course: CourseFull;
  personalization: RecommendationResult;
  profile_complete: boolean;
  user: {
    wishlisted: boolean;
    enrollment_state: EnrollmentState | null;
    feedback: Feedback | null;
  };
  link: { url: string | null; validated: boolean; note: string };
}

export interface SimilarItem {
  course: CourseSummary;
  similarity: number;
  content_similarity: number;
  reasons: string[];
}

export interface CompareResponse {
  items: { course: CourseSummary & { modules: string[] }; personalization: RecommendationResult; unique_skills: string[] }[];
  shared_skills: string[];
  content_similarity: number[][];
}

export interface StudentProfile {
  id: string;
  display_name: string;
  career_goal: string | null;
  skill_level: Level;
  topics: string[];
  existing_skills: string[];
  objectives: string;
  preferred_difficulty: DifficultyPref;
  weekly_hours: number;
  budget: Budget;
  preferred_duration: DurationPref;
  languages: string[];
  onboarded: boolean;
  updated_at: string | null;
}

export type ProfileUpdate = Omit<StudentProfile, "id" | "updated_at">;

export interface CareerGoal {
  id: string;
  label: string;
  description: string;
  skills: string[];
  categories: string[];
}

export interface SkillDef {
  id: string;
  label: string;
  group: string;
  group_label: string;
}

export interface Taxonomy {
  career_goals: CareerGoal[];
  skills: SkillDef[];
  skill_groups: { id: string; label: string }[];
  categories: string[];
  languages: string[];
  levels: Level[];
  durations: { id: DurationBucket; label: string }[];
  content_types: { id: string; label: string }[];
  catalog_source: "dataset" | "sample";
}

export interface WishlistEntry {
  course_id: string;
  added_at: string;
  note: string | null;
  demo: boolean;
  course: CourseSummary | null;
}

export interface Feedback {
  course_id: string;
  kind: FeedbackKind | null;
  rating: number | null;
  updated_at: string | null;
  demo: boolean;
}

export interface Enrollment {
  course_id: string;
  enrolled_at: string;
  state: EnrollmentState;
  status: EnrollmentStatus;
  completed_lessons: number;
  total_lessons: number;
  lessons_source: string | null;
  target_date: string | null;
  completed_at: string | null;
  paused_at: string | null;
  updated_at: string | null;
  demo: boolean;
  progress: {
    completed_lessons: number;
    total_lessons: number;
    percent: number;
    minutes: number;
    sessions: number;
    last_studied: string | null;
  };
  course: CourseSummary | null;
}

export interface StudySession {
  id: string;
  course_id: string;
  date: string;
  minutes: number;
  lessons_completed: number;
  note: string | null;
  created_at: string | null;
  demo: boolean;
  course_title: string | null;
}

export interface LearningGoal {
  weekly_hours_target: number;
  weekly_sessions_target: number;
  updated_at: string | null;
}

export interface Analytics {
  generated_for: string;
  totals: {
    enrolled: number;
    completed: number;
    in_progress: number;
    paused: number;
    not_started: number;
    total_minutes: number;
    total_hours: number;
    sessions: number;
    lessons_completed: number;
    lessons_total: number;
    current_streak: number;
    longest_streak: number;
    wishlist: number;
  };
  weekly_goal: {
    target_hours: number;
    target_sessions: number;
    done_hours: number;
    done_sessions: number;
    percent: number | null;
    week_start: string;
    weeks_goal_met_last_12: number;
  };
  weekly_activity: { week_start: string; label: string; minutes: number; hours: number; sessions: number; goal_met: boolean }[];
  monthly_activity: { month: string; label: string; minutes: number; hours: number; sessions: number }[];
  daily_activity: { date: string; label: string; minutes: number; hours: number }[];
  completion_breakdown: { status: EnrollmentStatus; count: number }[];
  progress_over_time: { date: string; label: string; completed_lessons: number }[];
  skill_radar: { group: string; label: string; value: number }[];
  top_skills: { skill: string; label: string; value: number }[];
  milestones: { id: string; label: string; achieved: boolean; date?: string | null; progress?: number }[];
  course_targets: {
    course_id: string;
    title: string;
    target_date: string;
    days_left: number;
    progress_percent: number;
    expected_percent: number;
    on_track: boolean;
  }[];
  courses: { course_id: string; title: string; status: EnrollmentStatus; progress_percent: number; minutes: number }[];
  recent_activity: {
    id: string;
    type: string;
    at: string;
    text: string;
    course_id: string | null;
    course_title: string | null;
    detail: Record<string, unknown>;
    demo: boolean;
  }[];
  demo: { includes_demo_data: boolean; demo_records: number };
  notes: string[];
}

export interface RoadmapStage {
  id: string;
  order: number;
  title: string;
  description: string;
  skills: { id: string; label: string; known: boolean }[];
  courses: { course: CourseSummary; roadmap_score: number; covers: string[]; user_status: EnrollmentState | null }[];
  completed: boolean;
  completion_source: "manual" | "course_completed" | null;
  manually_completed: boolean;
  depends_on: string | null;
  note: string | null;
  status: "completed" | "current" | "upcoming";
}

export interface Roadmap {
  career_goal: { id: string; label: string; description: string };
  stages: RoadmapStage[];
  progress: { completed_stages: number; total_stages: number; percent: number };
  next_course: { course: CourseSummary; action: "start" | "continue"; stage: string; reason: string } | null;
  disclaimer: string;
  method: string;
}

export interface MetricSummary {
  mean: number;
  std: number;
  ci95: number;
  n: number;
}

export interface EvaluationResult {
  generated_at: string;
  dataset: {
    label: string;
    synthetic: boolean;
    users_total: number;
    users_evaluated: number;
    users_excluded_too_few_positives: number;
    test_items: number;
    train_interactions: number;
    catalog_size: number;
  };
  protocol: Record<string, string | number | number[]>;
  methods: Record<string, string>;
  results: Record<string, Record<string, MetricSummary>>;
  hybrid_fallbacks_to_content: number;
  comparison: {
    metric: string;
    mean_difference_hybrid_minus_content: number;
    users_hybrid_better: number;
    users_content_better: number;
    users_tied: number;
    note: string;
  } | null;
  limitations: string[];
}

export interface SystemInfo {
  catalog: {
    source_kind: "dataset" | "sample";
    record_count: number;
    meta: Record<string, unknown> & { provenance_note?: string; source?: string; source_sha256?: string; generated_at?: string };
    load_notes: string[];
    facets: CourseSearchResponse["facets"];
  };
  preprocessing: (Record<string, unknown> & {
    input_rows?: number;
    output_records?: number;
    excluded_count?: number;
    excluded_rows?: { row: number; reason: string; value: string | null }[];
    duplicate_rows_removed_exact?: number;
    duplicate_rows_merged_differing?: number;
    missing_after_cleaning?: Record<string, number>;
    courses_with_detected_skills?: number;
  }) | null;
  synthetic_cohort: Record<string, unknown> & { n_users?: number; n_interactions?: number; label?: string; status?: string; seed?: number };
  recommender_config: {
    preference_weights: Record<string, number>;
    hybrid: { collaborative_weight_max: number; full_confidence_interactions: number; min_user_interactions: number };
    collaborative: { neighbors: number; shrinkage: number; min_item_support: number };
    rocchio: { alpha: number; beta_positive: number; gamma_negative: number };
    interaction_weights: Record<string, number>;
  };
  storage: { backend: string; recovered_files: string[]; demo_records: Record<string, number> };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { field: string | null; message: string }[] };
}
