import { useEffect, useState } from "react";
import type { CourseSummary, Enrollment } from "../api/types";
import { api } from "../api/client";
import { errorMessage, useAppData, useCourseActions, useToast } from "../hooks/AppContext";
import { todayIso } from "../lib/format";
import { Dialog } from "./ui/Dialog";
import { Button } from "./ui/primitives";

export function EnrollDialog({
  course,
  open,
  onClose,
  onDone,
}: {
  course: Pick<CourseSummary, "id" | "title" | "module_count">;
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const actions = useCourseActions();
  const [lessons, setLessons] = useState<string>("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setLessons(course.module_count ? String(course.module_count) : "");
      setTarget("");
    }
  }, [open, course.module_count]);
  const lessonsNum = lessons ? Number(lessons) : null;
  const invalid = lessonsNum !== null && (!Number.isInteger(lessonsNum) || lessonsNum < 1 || lessonsNum > 500);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add to My Learning"
      description={course.title}
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
              const res = await actions.enroll(course.id, lessonsNum, target || null);
              setBusy(false);
              if (res) {
                onDone?.();
                onClose();
              }
            }}
          >
            Add to My Learning
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Lessons to track</span>
          <input className="field" type="number" min={1} max={500} value={lessons} onChange={(e) => setLessons(e.target.value)} placeholder="10" />
          <span className="hint mt-1 block">
            {course.module_count
              ? `Estimated from ${course.module_count} syllabus modules. Edit to match the course.`
              : "The source data has no syllabus here; 10 is used if left empty."}
          </span>
          {invalid && <span className="mt-1 block text-xs text-rose">Enter a whole number from 1 to 500.</span>}
        </label>
        <label className="block">
          <span className="label">Target finish date (optional)</span>
          <input className="field" type="date" min={todayIso()} value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
      </div>
    </Dialog>
  );
}

export function LogSessionDialog({
  enrollment,
  open,
  onClose,
  onDone,
}: {
  enrollment: Pick<Enrollment, "course_id" | "completed_lessons" | "total_lessons" | "state"> & { title: string };
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { notify } = useToast();
  const { bump } = useAppData();
  const [minutes, setMinutes] = useState("45");
  const [date, setDate] = useState(todayIso());
  const [lessons, setLessons] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setMinutes("45");
      setDate(todayIso());
      setLessons("0");
      setNote("");
      setError(null);
    }
  }, [open]);
  const m = Number(minutes);
  const l = Number(lessons);
  const remaining = Math.max(0, enrollment.total_lessons - enrollment.completed_lessons);
  const minutesInvalid = !Number.isInteger(m) || m < 1 || m > 1440;
  const lessonsInvalid = !Number.isInteger(l) || l < 0 || l > 100;
  const dateInvalid = !date || date > todayIso();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Log study time"
      description={enrollment.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={minutesInvalid || lessonsInvalid || dateInvalid}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.logSession(enrollment.course_id, { minutes: m, date, lessons_completed: l, note: note || undefined });
                notify(`Logged ${m} minutes`);
                bump();
                onDone?.();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Log session
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Minutes</span>
          <input className="field" type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          {minutesInvalid && <span className="mt-1 block text-xs text-rose">1 to 1440 minutes.</span>}
        </label>
        <label className="block">
          <span className="label">Date</span>
          <input className="field" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          {dateInvalid && <span className="mt-1 block text-xs text-rose">Pick today or an earlier date.</span>}
        </label>
        <label className="block">
          <span className="label">Lessons finished</span>
          <input className="field" type="number" min={0} max={100} value={lessons} onChange={(e) => setLessons(e.target.value)} />
          <span className="hint mt-1 block">{remaining} remaining</span>
        </label>
        <label className="block sm:col-span-3">
          <span className="label">Note (optional)</span>
          <input className="field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you cover?" />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
    </Dialog>
  );
}
