import { useState } from "react";
import {
  BookOpen,
  Brain,
  Briefcase,
  ChartColumn,
  Cloud,
  Code2,
  Compass,
  FlaskConical,
  Globe,
  Languages,
  Megaphone,
  Network,
  Orbit,
  Palette,
  PenTool,
  ShieldCheck,
  Sigma,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CourseSummary } from "../api/types";
import { useUiPrefs } from "../hooks/AppContext";
import { hashString } from "../lib/format";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  "Data Analysis": ChartColumn,
  "Probability and Statistics": ChartColumn,
  "Cloud Computing": Cloud,
  Networking: Network,
  "Computer Security and Networks": ShieldCheck,
  Security: ShieldCheck,
  "Design and Product": PenTool,
  "Software Development": Code2,
  "Mobile and Web Development": Globe,
  Algorithms: Code2,
  "Physics and Astronomy": Orbit,
  "Math and Logic": Sigma,
  "Machine Learning": Brain,
  "Business Essentials": Briefcase,
  "Business Strategy": Briefcase,
  Economics: Briefcase,
  "Leadership and Management": Users,
  "Personal Development": Users,
  "Support and Operations": Wrench,
  "Research Methods": FlaskConical,
  Chemistry: FlaskConical,
  "Mechanical Engineering": Wrench,
  "Environmental Science and Sustainability": Globe,
  History: BookOpen,
  "Music and Art": Palette,
  Marketing: Megaphone,
  "Learning English": Languages,
};

export function categoryIcon(category: string | null | undefined): LucideIcon {
  return (category && CATEGORY_ICON[category]) || Compass;
}

/** Deterministic local artwork used when a remote image is missing, fails, or is disabled. */
export function FallbackArt({ course, className = "" }: { course: Pick<CourseSummary, "id" | "category" | "title">; className?: string }) {
  const h = hashString(course.id);
  const Icon = categoryIcon(course.category);
  const rot = h % 360;
  const cx = 20 + (h % 60);
  const cy = 20 + ((h >> 8) % 60);
  const mix = (h >> 4) % 3;
  const accent = mix === 0 ? "var(--cc-violet)" : mix === 1 ? "var(--cc-cyan)" : "var(--cc-violet-bright)";
  const rings = 3 + (h % 3);
  return (
    <div className={`relative overflow-hidden bg-abyss ${className}`} aria-hidden>
      <svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={`rg-${course.id}`} cx={`${cx}%`} cy={`${cy}%`} r="80%">
            <stop offset="0%" stopColor={`rgb(${accent})`} stopOpacity="0.55" />
            <stop offset="55%" stopColor="rgb(var(--cc-violet-deep))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="rgb(var(--cc-midnight))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="100" height="60" fill={`url(#rg-${course.id})`} />
        <g transform={`rotate(${rot} ${cx} ${cy * 0.6})`} fill="none" stroke="rgb(var(--cc-ink))" strokeOpacity="0.12">
          {Array.from({ length: rings }).map((_, i) => (
            <circle key={i} cx={cx} cy={cy * 0.6} r={8 + i * 9} strokeDasharray={i % 2 ? "1 2.5" : undefined} />
          ))}
          <line x1={cx - 45} y1={cy * 0.6} x2={cx + 45} y2={cy * 0.6} />
          <line x1={cx} y1={cy * 0.6 - 45} x2={cx} y2={cy * 0.6 + 45} />
        </g>
      </svg>
      <div className="absolute bottom-3 left-3 flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-midnight/60 backdrop-blur">
        <Icon className="h-[18px] w-[18px] text-cyan" />
      </div>
    </div>
  );
}

export function CourseArt({ course, className = "" }: { course: Pick<CourseSummary, "id" | "category" | "title" | "image_url">; className?: string }) {
  const { remoteImages } = useUiPrefs();
  const [failed, setFailed] = useState(false);
  if (!remoteImages || !course.image_url || failed) return <FallbackArt course={course} className={className} />;
  return (
    <div className={`relative overflow-hidden bg-abyss ${className}`}>
      <FallbackArt course={course} className="absolute inset-0" />
      <img
        src={course.image_url}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="relative h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal/70 via-transparent to-transparent" />
    </div>
  );
}
