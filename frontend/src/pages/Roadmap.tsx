import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, CheckCircle2, Circle, Lock, Route as RouteIcon } from "lucide-react";
import { api } from "../api/client";
import type { RoadmapStage } from "../api/types";
import { CourseArt } from "../components/CourseArt";
import { PageHeader } from "../components/Layout";
import { Badge, Button, LinkButton, ProgressBar } from "../components/ui/primitives";
import { BlockSkeleton, EmptyState, ErrorState } from "../components/ui/states";
import { errorMessage, useAppData, useToast } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { LEVEL_LABEL } from "../lib/format";

function StageCard({ stage, careerId, onChanged }: { stage: RoadmapStage; careerId: string; onChanged: () => void }) {
  const { notify } = useToast();
  const { bump } = useAppData();
  const [busy, setBusy] = useState(false);
  const statusTone = stage.status === "completed" ? "mint" : stage.status === "current" ? "cyan" : "neutral";
  const toggle = async () => {
    setBusy(true);
    try {
      await api.setMilestone(careerId, stage.id, !stage.manually_completed);
      notify(stage.manually_completed ? "Milestone reopened" : "Milestone completed");
      bump();
      onChanged();
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="relative pl-14">
      <span
        className={`num absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border-2 font-display text-sm font-semibold ${
          stage.status === "completed"
            ? "border-mint bg-mint/15 text-mint"
            : stage.status === "current"
              ? "border-cyan bg-cyan/10 text-cyan shadow-glow-cyan"
              : "border-line bg-charcoal text-faint"
        }`}
        aria-hidden
      >
        {stage.status === "completed" ? <Check className="h-4 w-4" /> : stage.order}
      </span>
      <div className={`surface p-5 ${stage.status === "current" ? "border-cyan/40" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-medium">{stage.title}</h2>
              <Badge tone={statusTone}>{stage.status === "completed" ? "Completed" : stage.status === "current" ? "Current stage" : "Upcoming"}</Badge>
              {stage.completion_source === "course_completed" && !stage.manually_completed && <span className="text-xs text-faint">Completed via a finished course</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{stage.description}</p>
            {stage.depends_on && stage.status === "upcoming" && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-faint">
                <Lock className="h-3 w-3" aria-hidden /> Builds on the previous stage
              </p>
            )}
          </div>
          <Button size="sm" variant={stage.manually_completed ? "secondary" : "cyan"} loading={busy} onClick={() => void toggle()}>
            {stage.manually_completed ? "Mark not done" : "Mark milestone done"}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {stage.skills.map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${s.known ? "border-mint/40 text-mint" : "border-line text-muted"}`}>
              {s.known ? <CheckCircle2 className="h-3 w-3" aria-label="known" /> : <Circle className="h-3 w-3" aria-label="to learn" />}
              {s.label}
            </span>
          ))}
        </div>
        {stage.courses.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{stage.note}</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {stage.courses.map((c) => (
              <li key={c.course.id}>
                <Link
                  to={`/courses/${encodeURIComponent(c.course.id)}`}
                  className="flex h-full flex-col overflow-hidden rounded-md border border-line bg-abyss no-underline transition-colors duration-fast hover:border-violet/50 hover:no-underline"
                >
                  <CourseArt course={c.course} className="h-16 w-full" />
                  <div className="flex flex-1 flex-col p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-ink">{c.course.title}</p>
                    <p className="mt-1 text-xs text-muted">Covers {c.covers.join(", ")}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                      <Badge>{c.course.level ? LEVEL_LABEL[c.course.level] : "Level not listed"}</Badge>
                      {c.user_status && (
                        <Badge tone={c.user_status === "completed" ? "mint" : "cyan"}>{c.user_status === "completed" ? "Completed" : c.user_status === "paused" ? "Paused" : "Enrolled"}</Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function Roadmap() {
  const { profile, taxonomy, version } = useAppData();
  const [career, setCareer] = useState<string | null>(null);
  useEffect(() => {
    if (!career && profile?.career_goal) setCareer(profile.career_goal);
  }, [profile, career]);
  const road = useAsync(() => (career ? api.roadmap(career) : Promise.resolve(null)), [career, version]);

  return (
    <div>
      <PageHeader
        title="Learning roadmap"
        description="A staged path of skills and catalog courses toward a career goal. Mark milestones as you go; finishing a suggested course completes its stage automatically."
        actions={
          taxonomy && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Goal</span>
              <select className="field w-auto" value={career ?? ""} onChange={(e) => setCareer(e.target.value || null)} aria-label="Career goal for roadmap">
                <option value="">Choose a goal</option>
                {taxonomy.career_goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      {!career ? (
        <EmptyState
          icon={<RouteIcon className="h-5 w-5" />}
          title="Pick a career goal"
          body="Choose a goal above, or set one in your preferences so the roadmap opens on it automatically."
          action={<LinkButton to="/profile" variant="primary">Set preferences</LinkButton>}
        />
      ) : road.error ? (
        <ErrorState message={road.error.message} onRetry={() => void road.reload()} />
      ) : !road.data ? (
        <BlockSkeleton rows={4} />
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <ol className="relative space-y-6 before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-line">
            {road.data.stages.map((s) => (
              <StageCard key={s.id} stage={s} careerId={road.data!.career_goal.id} onChanged={() => void road.reload()} />
            ))}
          </ol>
          <aside className="space-y-6">
            <section className="surface p-5">
              <h2 className="section-title">{road.data.career_goal.label}</h2>
              <p className="mt-1 text-sm text-muted">{road.data.career_goal.description}</p>
              <p className="num mt-4 text-sm text-ink">
                {road.data.progress.completed_stages} of {road.data.progress.total_stages} stages complete
              </p>
              <ProgressBar className="mt-2" value={road.data.progress.percent} label="Roadmap progress" />
            </section>
            {road.data.next_course && (
              <section className="surface border-cyan/40 p-5">
                <h2 className="section-title">Next step</h2>
                <p className="mt-2 text-sm font-semibold text-ink">{road.data.next_course.course.title}</p>
                <p className="mt-1 text-xs text-muted">{road.data.next_course.reason}</p>
                <LinkButton to={road.data.next_course.action === "continue" ? "/learning" : `/courses/${encodeURIComponent(road.data.next_course.course.id)}`} variant="primary" size="sm" className="mt-4">
                  {road.data.next_course.action === "continue" ? "Continue in My Learning" : "View course"}
                </LinkButton>
              </section>
            )}
            <section className="text-xs text-faint">
              <p>{road.data.disclaimer}</p>
              <p className="mt-2">{road.data.method}</p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
