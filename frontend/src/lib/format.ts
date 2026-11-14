import type { CourseSummary, EnrollmentStatus } from "../api/types";

export const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  any: "Any level",
};

export const DURATION_LABEL: Record<string, string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
  extended: "Extended",
  any: "Any length",
};

export const DURATION_HINT: Record<string, string> = {
  short: "under 10 hours",
  medium: "10-40 hours",
  long: "40+ hours or 1-3 months",
  extended: "more than 3 months",
};

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
};

export const METHOD_LABEL: Record<string, string> = {
  hybrid: "Hybrid (preferences + collaborative)",
  content: "Content + preferences",
  content_fallback: "Content + preferences (collaborative unavailable)",
};

export const EXCLUSION_LABEL: Record<string, string> = {
  completed: "completed",
  previously_studied: "previously studied",
  marked_irrelevant: "marked not relevant",
  enrolled: "already in My Learning",
  language: "in other languages",
};

export function priceLabel(c: Pick<CourseSummary, "price_status">): string {
  switch (c.price_status) {
    case "free":
      return "Free";
    case "paid":
      return "Paid";
    case "not_listed":
      return "Price not listed";
    default:
      return "Price unknown";
  }
}

export function durationLabel(c: Pick<CourseSummary, "duration_hours" | "duration_months" | "duration_bucket">): string {
  if (c.duration_hours != null) return `${formatNumber(c.duration_hours)} h`;
  if (c.duration_months != null) return `${formatNumber(c.duration_months)} mo`;
  return "Length not listed";
}

export function formatNumber(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return formatDate(iso);
}

export function todayIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function pct(value: number | null | undefined): string {
  if (value == null) return "n/a";
  return `${Math.round(value * 100)}%`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
