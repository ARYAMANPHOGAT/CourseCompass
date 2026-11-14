import type {
  Analytics,
  CompareResponse,
  CourseDetailResponse,
  CourseSearchResponse,
  Enrollment,
  EnrollmentState,
  EvaluationResult,
  ExplainResponse,
  Feedback,
  FeedbackKind,
  LearningGoal,
  ProfileUpdate,
  RecMode,
  RecommendationResponse,
  Roadmap,
  SimilarItem,
  StudentProfile,
  StudySession,
  SystemInfo,
  Taxonomy,
  WishlistEntry,
} from "./types";

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000/api";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Query = Record<string, string | number | boolean | string[] | null | undefined>;

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ""}`;
}

async function request<T>(method: string, path: string, options: { query?: Query; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "Can't reach the CourseCompass backend. Make sure run.bat is running, then retry.");
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const err = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(response.status, err?.code ?? "http_error", err?.message ?? `Request failed (${response.status}).`);
  }
  return payload as T;
}

export interface CourseQuery {
  q?: string;
  category?: string[];
  content_type?: string[];
  level?: string[];
  duration?: string[];
  language?: string[];
  skill?: string[];
  free_only?: boolean;
  min_rating?: number | null;
  sort?: string;
  page?: number;
  page_size?: number;
}

export const api = {
  health: () => request<{ status: string; version: string; catalog_records: number; catalog_source: string }>("GET", "/health"),
  taxonomy: () => request<Taxonomy>("GET", "/meta/taxonomy"),
  systemInfo: () => request<SystemInfo>("GET", "/system/info"),

  courses: (query: CourseQuery) => request<CourseSearchResponse>("GET", "/courses", { query: query as Query }),
  course: (id: string, mode: RecMode = "hybrid") =>
    request<CourseDetailResponse>("GET", `/courses/${encodeURIComponent(id)}`, { query: { mode } }),
  similar: (id: string, limit = 6) =>
    request<{ course_id: string; items: SimilarItem[]; method: string }>("GET", `/courses/${encodeURIComponent(id)}/similar`, {
      query: { limit },
    }),
  compare: (courseIds: string[], mode: RecMode = "hybrid") =>
    request<CompareResponse>("POST", "/courses/compare", { body: { course_ids: courseIds, mode } }),

  recommendations: (mode: RecMode, limit = 12, offset = 0) =>
    request<RecommendationResponse>("GET", "/recommendations", { query: { mode, limit, offset } }),
  preview: (careerGoal: string, limit = 3) =>
    request<RecommendationResponse>("GET", "/recommendations/preview", { query: { career_goal: careerGoal, limit } }),
  explain: (id: string, mode: RecMode = "hybrid") =>
    request<ExplainResponse>("GET", `/recommendations/explain/${encodeURIComponent(id)}`, { query: { mode } }),

  profile: () => request<StudentProfile>("GET", "/profile"),
  saveProfile: (body: ProfileUpdate) => request<StudentProfile>("PUT", "/profile", { body }),
  resetProfile: () => request<StudentProfile>("POST", "/profile/reset", { body: { confirm: true } }),

  wishlist: () => request<WishlistEntry[]>("GET", "/wishlist"),
  addWishlist: (courseId: string) => request<WishlistEntry>("POST", "/wishlist", { body: { course_id: courseId } }),
  removeWishlist: (courseId: string) => request<void>("DELETE", `/wishlist/${encodeURIComponent(courseId)}`),

  feedback: () => request<Feedback[]>("GET", "/feedback"),
  sendFeedback: (courseId: string, kind: FeedbackKind | null, rating?: number | null) =>
    request<Feedback>("POST", "/feedback", { body: { course_id: courseId, kind, rating: rating ?? null } }),
  clearFeedback: (courseId: string) => request<void>("DELETE", `/feedback/${encodeURIComponent(courseId)}`),

  learning: () => request<Enrollment[]>("GET", "/learning"),
  enroll: (courseId: string, totalLessons?: number | null, targetDate?: string | null) =>
    request<Enrollment>("POST", "/learning", {
      body: { course_id: courseId, total_lessons: totalLessons || null, target_date: targetDate || null },
    }),
  updateEnrollment: (
    courseId: string,
    changes: Partial<{ state: EnrollmentState; completed_lessons: number; total_lessons: number; target_date: string; clear_target_date: boolean }>,
  ) => request<Enrollment>("PATCH", `/learning/${encodeURIComponent(courseId)}`, { body: changes }),
  unenroll: (courseId: string) =>
    request<void>("DELETE", `/learning/${encodeURIComponent(courseId)}`, { query: { confirm: true } }),
  logSession: (courseId: string, body: { minutes: number; date?: string; lessons_completed?: number; note?: string }) =>
    request<StudySession>("POST", `/learning/${encodeURIComponent(courseId)}/sessions`, { body }),
  sessions: (courseId?: string) => request<StudySession[]>("GET", "/sessions", { query: { course_id: courseId } }),
  deleteSession: (id: string) => request<void>("DELETE", `/sessions/${encodeURIComponent(id)}`),

  goals: () => request<LearningGoal>("GET", "/goals"),
  saveGoals: (body: { weekly_hours_target: number; weekly_sessions_target: number }) =>
    request<LearningGoal>("PUT", "/goals", { body }),

  analytics: () => request<Analytics>("GET", "/analytics"),
  roadmap: (careerGoal?: string) => request<Roadmap>("GET", "/roadmap", { query: { career_goal: careerGoal } }),
  setMilestone: (careerId: string, stageId: string, completed: boolean) =>
    request<{ completed: boolean }>("PATCH", `/roadmap/${encodeURIComponent(careerId)}/milestones/${encodeURIComponent(stageId)}`, {
      body: { completed },
    }),

  evaluation: () => request<EvaluationResult>("GET", "/evaluation"),
  runEvaluation: () => request<EvaluationResult>("POST", "/evaluation/run"),

  seedDemo: () =>
    request<{ seeded: boolean; reason?: string; created?: Record<string, number> }>("POST", "/system/demo/seed"),
  clearDemo: () => request<{ removed: Record<string, number> }>("POST", "/system/demo/clear", { body: { confirm: true } }),
  resetAll: () => request<{ reset: boolean; backup_folder: string }>("POST", "/system/reset", { body: { confirm: true } }),
};

export type Api = typeof api;
