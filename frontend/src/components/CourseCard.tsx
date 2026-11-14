import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, Columns3, Star } from "lucide-react";
import type { CourseSummary } from "../api/types";
import { useCourseActions, useUiPrefs } from "../hooks/AppContext";
import { durationLabel, LEVEL_LABEL, priceLabel } from "../lib/format";
import { CourseArt } from "./CourseArt";
import { ScoreDial } from "./ScoreDial";
import { Badge, IconButton } from "./ui/primitives";

export function CourseMeta({ course, compact = false }: { course: CourseSummary; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {course.content_type_label && <Badge tone="violet">{course.content_type_label}</Badge>}
      <Badge>{course.level ? LEVEL_LABEL[course.level] : "Level not listed"}</Badge>
      <Badge>{durationLabel(course)}</Badge>
      <Badge tone={course.price_status === "free" ? "mint" : "neutral"}>{priceLabel(course)}</Badge>
      {!compact && course.source === "sample" && <Badge tone="amber">Sample record</Badge>}
    </div>
  );
}

export function Rating({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-faint">No rating</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      <Star className="h-3.5 w-3.5 fill-amber text-amber" aria-hidden />
      <span className="num font-semibold text-ink">{value.toFixed(1)}</span>
      <span className="sr-only">out of 5</span>
    </span>
  );
}

export function CourseCard({
  course,
  wishlisted,
  onChanged,
}: {
  course: CourseSummary;
  wishlisted?: boolean;
  onChanged?: () => void;
}) {
  const actions = useCourseActions();
  const { compareIds } = useUiPrefs();
  const saved = wishlisted ?? course.user?.wishlisted ?? false;
  const inCompare = compareIds.includes(course.id);
  const state = course.user?.enrollment_state;

  return (
    <article className="group surface relative flex flex-col overflow-hidden transition-[border-color,transform] duration-base ease-out hover:-translate-y-0.5 hover:border-violet/50">
      <div className="relative">
        <CourseArt course={course} className="h-36 w-full" />
        {course.match_percent != null && (
          <div className="absolute -bottom-7 right-4 rounded-full shadow-lift">
            <ScoreDial value={course.match_percent} size={58} />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 pt-5">
        <div className="pr-16">
          <p className="truncate text-xs text-muted">{course.provider ?? "Provider not listed"}</p>
          <h3 className="mt-1 font-sans text-base font-bold leading-snug text-ink">
            <Link to={`/courses/${encodeURIComponent(course.id)}`} className="text-ink after:absolute after:inset-0 hover:no-underline focus-visible:outline-none">
              {course.title}
            </Link>
          </h3>
        </div>
        <CourseMeta course={course} compact />
        {course.skill_labels.length > 0 && (
          <p className="text-xs text-muted">
            <span className="text-faint">Skills </span>
            {course.skill_labels.slice(0, 3).join(", ")}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3">
            <Rating value={course.rating} />
            {state && <Badge tone={state === "completed" ? "mint" : "cyan"}>{state === "completed" ? "Completed" : "In My Learning"}</Badge>}
            {course.user?.feedback === "irrelevant" && <Badge tone="rose">Not relevant</Badge>}
          </div>
          <div className="relative z-10 flex gap-1.5">
            <IconButton
              label={inCompare ? "Remove from comparison" : "Add to comparison"}
              active={inCompare}
              onClick={() => actions.compare(course.id)}
            >
              <Columns3 className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={saved ? "Remove from wishlist" : "Save to wishlist"}
              active={saved}
              onClick={async () => {
                const res = saved ? await actions.unsave(course.id) : await actions.save(course.id);
                if (res !== null) onChanged?.();
              }}
            >
              {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </IconButton>
          </div>
        </div>
      </div>
    </article>
  );
}
