import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Award, BookOpenCheck, CheckCircle2, Circle, Clock3, Flame, Pencil, Table2, Target } from "lucide-react";
import { api } from "../api/client";
import type { Analytics as AnalyticsData } from "../api/types";
import { PageHeader } from "../components/Layout";
import { Dialog } from "../components/ui/Dialog";
import { Badge, Button, LinkButton, ProgressBar, StatTile } from "../components/ui/primitives";
import { BlockSkeleton, DemoNotice, EmptyState, ErrorState } from "../components/ui/states";
import { errorMessage, useAppData, useToast } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { CHART } from "../lib/chart";
import { ChartFrame } from "../components/ChartFrame";
import { formatDate, formatMinutes, relativeTime, STATUS_LABEL } from "../lib/format";

function ChartCard({
  title,
  description,
  children,
  table,
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  table: { columns: string[]; rows: (string | number)[][] };
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`surface p-5 ${className}`} aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <Button size="sm" variant="ghost" aria-pressed={showTable} icon={<Table2 className="h-3.5 w-3.5" />} onClick={() => setShowTable((s) => !s)}>
          {showTable ? "Chart" : "Table"}
        </Button>
      </div>
      {showTable ? (
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 text-left text-xs font-semibold text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {r.map((v, j) => (
                    <td key={j} className="num px-3 py-1.5 text-ink">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function GoalDialog({ data, open, onClose }: { data: AnalyticsData; open: boolean; onClose: () => void }) {
  const { notify } = useToast();
  const { bump } = useAppData();
  const [hours, setHours] = useState(String(data.weekly_goal.target_hours || 5));
  const [sessions, setSessions] = useState(String(data.weekly_goal.target_sessions || 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = Number(hours);
  const s = Number(sessions);
  const invalid = !(h >= 0.5 && h <= 80) || !Number.isInteger(s) || s < 1 || s > 21;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Weekly study goal"
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
                await api.saveGoals({ weekly_hours_target: h, weekly_sessions_target: s });
                notify("Weekly goal updated");
                bump();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save goal
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Hours per week</span>
          <input className="field" type="number" min={0.5} max={80} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Sessions per week</span>
          <input className="field" type="number" min={1} max={21} value={sessions} onChange={(e) => setSessions(e.target.value)} />
        </label>
      </div>
      {invalid && <p className="mt-2 text-xs text-rose">Hours 0.5 to 80; sessions a whole number from 1 to 21.</p>}
      {error && <p className="mt-2 text-sm text-rose">{error}</p>}
    </Dialog>
  );
}

export default function Analytics() {
  const { version } = useAppData();
  const res = useAsync(() => api.analytics(), [version]);
  const [goalOpen, setGoalOpen] = useState(false);

  if (res.error) return <ErrorState message={res.error.message} onRetry={() => void res.reload()} />;
  if (!res.data) return <BlockSkeleton rows={6} />;
  const a = res.data;
  const t = a.totals;
  const empty = t.enrolled === 0 && t.sessions === 0;
  const goalPct = a.weekly_goal.percent ?? 0;

  return (
    <div>
      <PageHeader
        title="Learning analytics"
        description="Calculated from the study sessions, lessons and goals you have saved. Nothing here is estimated or pre-filled."
        actions={
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setGoalOpen(true)}>
            Edit weekly goal
          </Button>
        }
      />
      {a.demo.includes_demo_data && (
        <div className="mb-6">
          <DemoNotice>
            Includes {a.demo.demo_records} demo records created by "Seed demo activity". Remove them in <Link to="/insights">Insights & settings</Link> to see only your
            own data.
          </DemoNotice>
        </div>
      )}
      {empty && (
        <div className="mb-8">
          <EmptyState
            icon={<BookOpenCheck className="h-5 w-5" />}
            title="No study activity yet"
            body="Add a course to My Learning and log a study session; charts fill in from what you record. For a presentation you can seed labelled demo activity in Insights & settings."
            action={
              <>
                <LinkButton to="/learning" variant="primary">Go to My Learning</LinkButton>
                <LinkButton to="/insights?tab=settings">Seed demo activity</LinkButton>
              </>
            }
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Enrolled" icon={<BookOpenCheck className="h-4 w-4 text-violet-bright" />} value={t.enrolled} sub={`${t.in_progress} in progress, ${t.paused} paused, ${t.not_started} not started`} />
        <StatTile label="Completed" icon={<CheckCircle2 className="h-4 w-4 text-mint" />} value={t.completed} sub={`${t.lessons_completed} of ${t.lessons_total} lessons done`} />
        <StatTile label="Time studied" icon={<Clock3 className="h-4 w-4 text-cyan" />} value={formatMinutes(t.total_minutes)} sub={`${t.sessions} sessions logged`} />
        <StatTile label="Current streak" icon={<Flame className="h-4 w-4 text-amber" />} value={`${t.current_streak} ${t.current_streak === 1 ? "day" : "days"}`} sub={`Longest: ${t.longest_streak} days`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="surface flex flex-col justify-between p-5" aria-label="This week's goal">
          <div>
            <h2 className="section-title flex items-center gap-2">
              <Target className="h-4 w-4 text-cyan" aria-hidden /> This week
            </h2>
            <p className="mt-1 text-xs text-muted">Week starting {formatDate(a.weekly_goal.week_start)}</p>
          </div>
          <div className="my-6">
            <p className="num font-display text-5xl font-semibold text-ink">{a.weekly_goal.done_hours.toFixed(1)}</p>
            <p className="mt-1 text-sm text-muted">of {a.weekly_goal.target_hours} hours goal</p>
            <ProgressBar className="mt-4" value={goalPct} label="Weekly hours goal progress" />
            <p className="mt-3 text-sm text-muted">
              {a.weekly_goal.done_sessions} of {a.weekly_goal.target_sessions} sessions. Goal met in {a.weekly_goal.weeks_goal_met_last_12} of the last 12 weeks.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setGoalOpen(true)}>
            Change goal
          </Button>
        </section>

        <ChartCard
          title="Weekly study hours"
          description="Last 12 weeks. The dashed line is your weekly goal."
          table={{ columns: ["Week of", "Hours", "Sessions", "Goal met"], rows: a.weekly_activity.map((w) => [w.label, w.hours, w.sessions, w.goal_met ? "Yes" : "No"]) }}
        >
          <ChartFrame height={256}>
{({ width, height }) => (
              <BarChart width={width} height={height} data={a.weekly_activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={CHART.tick} axisLine={false} tickLine={false} allowDecimals />
                <Tooltip {...CHART.tooltip} formatter={(v) => [`${v} h`, "Studied"]} />
                {a.weekly_goal.target_hours > 0 && (
                  <ReferenceLine y={a.weekly_goal.target_hours} stroke={CHART.reference} strokeDasharray="5 5" label={{ value: "goal", fill: CHART.reference, fontSize: 11, position: "insideTopRight" }} />
                )}
                <Bar dataKey="hours" fill={CHART.series} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
)}
</ChartFrame>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Daily study time" description="Last 14 days, in minutes." table={{ columns: ["Day", "Minutes"], rows: a.daily_activity.map((d) => [d.label, d.minutes]) }}>
          <ChartFrame height={224}>
{({ width, height }) => (
              <BarChart width={width} height={height} data={a.daily_activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={CHART.tick} axisLine={false} tickLine={false} />
                <Tooltip {...CHART.tooltip} formatter={(v) => [`${v} min`, "Studied"]} />
                <Bar dataKey="minutes" fill={CHART.series} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
)}
</ChartFrame>
        </ChartCard>
        <ChartCard
          title="Lessons completed over time"
          description="Total lessons marked done across your courses, last 30 days."
          table={{ columns: ["Date", "Lessons completed"], rows: a.progress_over_time.map((d) => [d.label, d.completed_lessons]) }}
        >
          <ChartFrame height={224}>
{({ width, height }) => (
              <LineChart width={width} height={height} data={a.progress_over_time} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} interval={6} />
                <YAxis tick={CHART.tick} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...CHART.tooltip} cursor={{ stroke: CHART.axis, strokeDasharray: "3 3" }} formatter={(v) => [v, "Lessons done"]} />
                <Line type="monotone" dataKey="completed_lessons" stroke={CHART.series} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "rgb(17 17 28)", strokeWidth: 2 }} />
              </LineChart>
)}
</ChartFrame>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-1"
          title="Skill exposure"
          description="From course progress weighted by detected skills. Not a competency assessment."
          table={{ columns: ["Skill area", "Exposure (0-100)"], rows: a.skill_radar.map((r) => [r.label, r.value]) }}
        >
          <ChartFrame height={256}>
{({ width, height }) => (
              <RadarChart width={width} height={height} data={a.skill_radar.map((r) => ({ ...r, short: r.label.split(" & ")[0] }))} outerRadius="66%">
                <PolarGrid stroke={CHART.grid} />
                <PolarAngleAxis dataKey="short" tick={{ ...CHART.tick, fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip {...CHART.tooltip} formatter={(v) => [v, "Exposure"]} />
                <Radar dataKey="value" stroke={CHART.series} strokeWidth={2} fill={CHART.series} fillOpacity={0.25} />
              </RadarChart>
)}
</ChartFrame>
          {a.top_skills.length > 0 && <p className="mt-2 text-xs text-muted">Most exposure: {a.top_skills.slice(0, 4).map((s) => s.label).join(", ")}</p>}
        </ChartCard>
        <ChartCard
          title="Courses by status"
          description="Every course in My Learning."
          table={{ columns: ["Status", "Courses"], rows: a.completion_breakdown.map((c) => [STATUS_LABEL[c.status], c.count]) }}
        >
          <ChartFrame height={256}>
{({ width, height }) => (
              <BarChart width={width} height={height} data={a.completion_breakdown.map((c) => ({ ...c, label: STATUS_LABEL[c.status] }))} layout="vertical" margin={{ top: 4, right: 16, left: 12, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" tick={CHART.tick} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} width={84} />
                <Tooltip {...CHART.tooltip} formatter={(v) => [v, "Courses"]} />
                <Bar dataKey="count" fill={CHART.series} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
)}
</ChartFrame>
        </ChartCard>
        <ChartCard title="Monthly study hours" description="Last 6 months." table={{ columns: ["Month", "Hours", "Sessions"], rows: a.monthly_activity.map((m) => [m.label, m.hours, m.sessions]) }}>
          <ChartFrame height={256}>
{({ width, height }) => (
              <BarChart width={width} height={height} data={a.monthly_activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={CHART.tick} axisLine={false} tickLine={false} />
                <YAxis tick={CHART.tick} axisLine={false} tickLine={false} />
                <Tooltip {...CHART.tooltip} formatter={(v) => [`${v} h`, "Studied"]} />
                <Bar dataKey="hours" fill={CHART.series} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
)}
</ChartFrame>
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="surface p-5" aria-labelledby="ms">
          <h2 id="ms" className="section-title flex items-center gap-2">
            <Award className="h-4 w-4 text-violet-bright" aria-hidden /> Milestones
          </h2>
          <ul className="mt-4 space-y-3">
            {a.milestones.map((m) => (
              <li key={m.id} className="flex items-start gap-3">
                {m.achieved ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-mint" aria-label="Achieved" /> : <Circle className="mt-0.5 h-4 w-4 text-faint" aria-label="Not yet" />}
                <div className="flex-1">
                  <p className={`text-sm ${m.achieved ? "text-ink" : "text-muted"}`}>{m.label}</p>
                  {!m.achieved && m.progress != null && <ProgressBar className="mt-1.5 h-1.5" value={m.progress * 100} label={`${m.label} progress`} />}
                  {m.achieved && m.date && <p className="text-xs text-faint">{formatDate(m.date)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="surface p-5" aria-labelledby="targets">
          <h2 id="targets" className="section-title">Target dates</h2>
          {a.course_targets.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No target dates set. Add one when enrolling or with "Edit plan" in My Learning.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {a.course_targets.map((ct) => (
                <li key={ct.course_id}>
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/courses/${encodeURIComponent(ct.course_id)}`} className="line-clamp-2 text-sm font-semibold text-ink">
                      {ct.title}
                    </Link>
                    {ct.on_track ? (
                      <Badge tone="mint">
                        <CheckCircle2 className="h-3 w-3" aria-hidden /> On track
                      </Badge>
                    ) : (
                      <Badge tone="amber">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> Behind
                      </Badge>
                    )}
                  </div>
                  <ProgressBar className="mt-2" value={ct.progress_percent} label={`${ct.title} progress`} />
                  <p className="num mt-1 text-xs text-muted">
                    {Math.round(ct.progress_percent)}% done, {Math.round(ct.expected_percent)}% expected by today. {ct.days_left >= 0 ? `${ct.days_left} days left` : `${-ct.days_left} days overdue`}.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface p-5" aria-labelledby="recent">
          <h2 id="recent" className="section-title">Recent activity</h2>
          {a.recent_activity.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Your saves, enrolments and study sessions will appear here.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {a.recent_activity.slice(0, 8).map((r) => (
                <li key={r.id} className="text-sm">
                  <p className="text-ink">
                    {r.text} {r.course_title && <span className="font-semibold">{r.course_title}</span>}
                    {r.type === "session_logged" && typeof r.detail.minutes === "number" && <span className="text-muted"> ({formatMinutes(r.detail.minutes as number)})</span>}
                  </p>
                  <p className="text-xs text-faint">
                    {relativeTime(r.at)}
                    {r.demo ? " - demo" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <GoalDialog key={`${a.weekly_goal.target_hours}-${a.weekly_goal.target_sessions}`} data={a} open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  );
}
