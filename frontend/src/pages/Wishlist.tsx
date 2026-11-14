import { Bookmark } from "lucide-react";
import { api } from "../api/client";
import { CourseCard } from "../components/CourseCard";
import { PageHeader } from "../components/Layout";
import { LinkButton } from "../components/ui/primitives";
import { CardSkeletonGrid, EmptyState, ErrorState } from "../components/ui/states";
import { useAppData } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { formatDate } from "../lib/format";

export default function Wishlist() {
  const { version } = useAppData();
  const list = useAsync(() => api.wishlist(), [version]);
  const items = (list.data ?? []).filter((w) => w.course);
  return (
    <div>
      <PageHeader
        title="Wishlist"
        description="Courses you saved for later. Saving also counts as positive feedback, so similar courses rank higher in For You."
        actions={<LinkButton to="/compare" variant="secondary">Compare saved courses</LinkButton>}
      />
      {list.error ? (
        <ErrorState message={list.error.message} onRetry={() => void list.reload()} />
      ) : !list.data ? (
        <CardSkeletonGrid count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bookmark className="h-5 w-5" />}
          title="No saved courses"
          body="Use the bookmark button on any course to keep it here."
          action={<LinkButton to="/discover" variant="primary">Browse courses</LinkButton>}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((w) => (
            <div key={w.course_id} className="flex flex-col gap-1.5">
              <CourseCard course={w.course!} wishlisted onChanged={() => void list.reload()} />
              <p className="px-1 text-xs text-faint">
                Saved {formatDate(w.added_at)}
                {w.demo ? " (demo)" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
