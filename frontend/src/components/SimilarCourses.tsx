import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAsync } from "../hooks/useAsync";
import { CourseArt } from "./CourseArt";
import { Skeleton } from "./ui/primitives";
import { ErrorState } from "./ui/states";

export function SimilarCourses({ courseId, limit = 6, layout = "grid" }: { courseId: string; limit?: number; layout?: "grid" | "row" }) {
  const sim = useAsync(() => api.similar(courseId, limit), [courseId, limit]);
  if (sim.error) return <ErrorState message={sim.error.message} onRetry={() => void sim.reload()} />;
  if (!sim.data)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: Math.min(limit, 3) }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  if (!sim.data.items.length) return <p className="text-sm text-muted">No similar courses found.</p>;
  return (
    <div>
      <ul className={layout === "grid" ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex gap-3 overflow-x-auto pb-2"}>
        {sim.data.items.map((s) => (
          <li key={s.course.id} className={layout === "row" ? "w-72 shrink-0" : ""}>
            <Link
              to={`/courses/${encodeURIComponent(s.course.id)}`}
              className="flex h-full gap-3 rounded-md border border-line bg-abyss p-3 no-underline transition-colors duration-fast hover:border-violet/50 hover:no-underline"
            >
              <CourseArt course={s.course} className="h-16 w-16 shrink-0 rounded-sm" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-ink">{s.course.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{s.reasons.slice(0, 2).join("; ")}</p>
                <p className="num mt-1 text-2xs text-faint">similarity {(s.similarity * 100).toFixed(0)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-2xs text-faint">Similarity: {sim.data.method}</p>
    </div>
  );
}
