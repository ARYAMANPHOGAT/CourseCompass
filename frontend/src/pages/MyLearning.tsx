import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpenCheck, CalendarClock, CheckCircle2, Clock3, Minus, Pause, Play, Plus, RotateCcw, Timer, Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Enrollment, EnrollmentStatus } from "../api/types";
import { CourseArt } from "../components/CourseArt";
import { LogSessionDialog } from "../components/LearningDialogs";
import { PageHeader } from "../components/Layout";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Badge, Button, IconButton, LinkButton, ProgressBar } from "../components/ui/primitives";
import { BlockSkeleton, DemoNotice, EmptyState, ErrorState } from "../components/ui/states";
import { errorMessage, useAppData, useToast } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { formatDate, formatMinutes, STATUS_LABEL, todayIso } from "../lib/format";

const TABS: { value: EnrollmentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "not_started", label: "Not started" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

const STATUS_TONE: Record<EnrollmentStatus, "cyan" | "neutral" | "amber" | "mint"> = {
  in_progress: "cyan",
  not_started: "neutral",
  paused: "amber",
  completed: "mint",
};

function EditDialog({ e, open, onClose }: { e: Enrollment; open: boolean; onClose: () => void }) {
  const { notify } = useToast();
  const { bump } = useAppData();
  const [total, setTotal] = useState(String(e.total_lessons));
  const [target, setTarget] = useState(e.target_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = Number(total);
  const invalid = !Number.isInteger(t) || t < 1 || t > 500 || t < e.completed_lessons;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit course plan"
      description={e.course?.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={invalid}
            onClick={async () => {
              setBusy(true);
              try {
                await api.updateEnrollment(e.course_id, {
                  total_lessons: t,
                  ...(target ? { target_date: target } : { clear_target_date: true }),
                });
                notify("Course plan updated");
                bump();
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save plan
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Total lessons</span>
          <input className="field" type="number" min={Math.max(1, e.completed_lessons)} max={500} value={total} onChange={(ev) => setTotal(ev.target.value)} />
          {invalid && <span className="mt-1 block text-xs text-rose">Whole number between {Math.max(1, e.completed_lessons)} and 500 (at least the lessons already done).</span>}
        </label>
        <label className="block">
          <span className="label">Target finish date</span>
          <input className="field" type="date" min={todayIso()} value={target} onChange={(ev) => setTarget(ev.target.value)} />
          <span className="hint mt-1 block">Leave empty for no target.</span>
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
    </Dialog>
  );
}

function SessionsList({ courseId }: { courseId: string }) {
  const { bump, version } = useAppData();
  const { notify } = useToast();
  const sessions = useAsync(() => api.sessions(courseId), [courseId, version]);
  if (sessions.error) return <ErrorState message={sessions.error.message} onRetry={() => void sessions.reload()} />;
  if (!sessions.data) return <BlockSkeleton rows={1} />;
  if (!sessions.data.length) return <p className="text-sm text-muted">No study sessions logged yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {sessions.data.slice(0, 8).map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="num w-24 shrink-0 text-muted">{formatDate(s.date)}</span>
          <span className="num font-semibold text-ink">{formatMinutes(s.minutes)}</span>
          {s.lessons_completed > 0 && <span className="text-xs text-cyan">+{s.lessons_completed} lessons</span>}
          <span className="flex-1 truncate text-xs text-faint">{s.note}</span>
          {s.demo && <Badge tone="amber">Demo</Badge>}
          <IconButton
            label="Delete this session"
            onClick={async () => {
              try {
                await api.deleteSession(s.id);
                notify("Session deleted");
                bump();
              } catch (e) {
                notify(errorMessage(e), "error");
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function EnrollmentRow({ e }: { e: Enrollment }) {
  const { notify } = useToast();
  const { bump } = useAppData();
  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = e.course?.title ?? e.course_id;

  const patch = async (changes: Parameters<typeof api.updateEnrollment>[1], message: string) => {
    setBusy(true);
    try {
      await api.updateEnrollment(e.course_id, changes);
      notify(message);
      bump();
    } catch (err) {
      notify(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="surface overflow-hidden">
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5 lg:grid-cols-[auto_minmax(0,1fr)_260px]">
        {e.course && <CourseArt course={e.course} className="h-20 w-28 rounded-md" />}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge>
            {e.demo && <Badge tone="amber">Demo record</Badge>}
            {e.target_date && (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Target {formatDate(e.target_date)}
              </span>
            )}
          </div>
          <h2 className="mt-1.5 font-sans text-base font-bold">
            <Link to={`/courses/${encodeURIComponent(e.course_id)}`} className="text-ink">
              {title}
            </Link>
          </h2>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar value={e.progress.percent} label={`${title} progress`} tone={e.status === "completed" ? "mint" : "violet"} />
            <span className="num w-12 text-right text-sm font-semibold text-ink">{Math.round(e.progress.percent)}%</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="num">
              {e.completed_lessons} of {e.total_lessons} lessons
              {e.lessons_source === "estimated_from_syllabus_modules" ? " (estimated from syllabus)" : e.lessons_source === "default_estimate" ? " (default estimate)" : ""}
            </span>
            <span className="num inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden /> {formatMinutes(e.progress.minutes)} studied in {e.progress.sessions} sessions
            </span>
            {e.progress.last_studied && <span>Last studied {formatDate(e.progress.last_studied)}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          {e.status !== "completed" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Lessons</span>
              <IconButton
                label="One lesson less"
                disabled={busy || e.completed_lessons <= 0}
                onClick={() => void patch({ completed_lessons: e.completed_lessons - 1 }, "Progress updated")}
              >
                <Minus className="h-4 w-4" />
              </IconButton>
              <span className="num w-10 text-center text-sm font-semibold">{e.completed_lessons}</span>
              <IconButton
                label="One more lesson done"
                disabled={busy || e.completed_lessons >= e.total_lessons}
                onClick={() => void patch({ completed_lessons: e.completed_lessons + 1 }, e.completed_lessons + 1 === e.total_lessons ? "Course completed" : "Progress updated")}
              >
                <Plus className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" icon={<Timer className="h-3.5 w-3.5" />} onClick={() => setLogOpen(true)}>
              Log study time
            </Button>
            {e.state === "active" && (
              <Button size="sm" variant="secondary" disabled={busy} icon={<Pause className="h-3.5 w-3.5" />} onClick={() => void patch({ state: "paused" }, "Course paused")}>
                Pause
              </Button>
            )}
            {e.state === "paused" && (
              <Button size="sm" variant="secondary" disabled={busy} icon={<Play className="h-3.5 w-3.5" />} onClick={() => void patch({ state: "active" }, "Course resumed")}>
                Resume
              </Button>
            )}
            {e.state !== "completed" ? (
              <Button size="sm" variant="cyan" disabled={busy} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => void patch({ state: "completed" }, "Course completed")}>
                Mark complete
              </Button>
            ) : (
              <Button size="sm" variant="secondary" disabled={busy} icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void patch({ state: "active" }, "Course reopened")}>
                Reopen
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <button type="button" className="font-semibold text-violet-bright hover:underline" onClick={() => setEditOpen(true)}>
              Edit plan
            </button>
            <button type="button" className="font-semibold text-violet-bright hover:underline" aria-expanded={showSessions} onClick={() => setShowSessions((s) => !s)}>
              {showSessions ? "Hide sessions" : "Show sessions"}
            </button>
            <button type="button" className="font-semibold text-rose hover:underline" onClick={() => setRemoveOpen(true)}>
              Remove
            </button>
          </div>
        </div>
      </div>
      {showSessions && (
        <div className="border-t border-line p-4 sm:px-5">
          <SessionsList courseId={e.course_id} />
        </div>
      )}
      <LogSessionDialog enrollment={{ ...e, title }} open={logOpen} onClose={() => setLogOpen(false)} />
      <EditDialog e={e} open={editOpen} onClose={() => setEditOpen(false)} />
      <ConfirmDialog
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title="Remove from My Learning?"
        body={`"${title}" leaves My Learning. Its logged study sessions stay in your history and analytics.`}
        confirmLabel="Remove course"
        onConfirm={async () => {
          try {
            await api.unenroll(e.course_id);
            notify("Removed from My Learning");
            bump();
          } catch (err) {
            notify(errorMessage(err), "error");
          }
        }}
      />
    </li>
  );
}

export default function MyLearning() {
  const { version } = useAppData();
  const [tab, setTab] = useState<EnrollmentStatus | "all">("all");
  const learning = useAsync(() => api.learning(), [version]);
  const items = learning.data ?? [];
  const counts = Object.fromEntries(TABS.map((t) => [t.value, t.value === "all" ? items.length : items.filter((i) => i.status === t.value).length]));
  const shown = tab === "all" ? items : items.filter((i) => i.status === tab);
  const hasDemo = items.some((i) => i.demo);

  return (
    <div>
      <PageHeader
        title="My Learning"
        description="Track lessons and study time for the courses you have started. Everything is saved locally as you go."
        actions={<LinkButton to="/analytics" variant="secondary">View analytics</LinkButton>}
      />
      {hasDemo && (
        <div className="mb-4">
          <DemoNotice>Some records were created by "Seed demo activity" and are labelled Demo. Remove them in Insights & settings.</DemoNotice>
        </div>
      )}
      <div role="tablist" aria-label="Filter by status" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-fast ${
              tab === t.value ? "border-violet text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label} <span className="num ml-1 text-xs text-faint">{counts[t.value]}</span>
          </button>
        ))}
      </div>
      {learning.error ? (
        <ErrorState message={learning.error.message} onRetry={() => void learning.reload()} />
      ) : !learning.data ? (
        <BlockSkeleton rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="h-5 w-5" />}
          title="Nothing in My Learning yet"
          body="Add a course from your recommendations or the catalog to start tracking lessons and study time."
          action={
            <>
              <LinkButton to="/for-you" variant="primary">See recommendations</LinkButton>
              <LinkButton to="/discover">Browse catalog</LinkButton>
            </>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState title={`No ${TABS.find((t) => t.value === tab)?.label.toLowerCase()} courses`} body="Switch tabs to see your other courses." />
      ) : (
        <ul className="space-y-4">
          {shown.map((e) => (
            <EnrollmentRow key={e.course_id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
