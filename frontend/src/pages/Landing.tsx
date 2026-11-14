import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenCheck, Route, Search, Sparkles } from "lucide-react";
import { api } from "../api/client";
import type { RecommendationResponse, SystemInfo, Taxonomy } from "../api/types";
import { BrandMark } from "../components/Layout";
import { COMPONENT_COLOR } from "../components/ScoreBreakdown";
import { ScoreDial } from "../components/ScoreDial";
import { LinkButton, Skeleton } from "../components/ui/primitives";
import { ErrorState } from "../components/ui/states";
import { useAppData } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { hashString } from "../lib/format";

const PREVIEW_GOALS = ["data-analyst", "ux-designer", "cloud-engineer", "cybersecurity-analyst", "software-developer", "science-researcher"];
const R = 190;
const C = 260;
const OUTER_SCORE = 0.4; // the outer ring represents a 40-point match

function polar(angleDeg: number, radius: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return { x: C + Math.cos(a) * radius, y: C + Math.sin(a) * radius };
}

function CompassPreview({ data, taxonomy, goalLabel }: { data: RecommendationResponse; taxonomy: Taxonomy; goalLabel: string }) {
  const groups = taxonomy.skill_groups;
  const sector = 360 / groups.length;
  const groupOfSkill = useMemo(() => Object.fromEntries(taxonomy.skills.map((s) => [s.id, s.group])), [taxonomy]);
  const points = data.results.map((r, i) => {
    const group = groupOfSkill[r.course.skills[0]] ?? groups[hashString(r.course.id) % groups.length].id;
    const gi = Math.max(0, groups.findIndex((g) => g.id === group));
    const jitter = 0.2 + ((hashString(r.course.id) % 1000) / 1000) * 0.6;
    const angle = gi * sector + jitter * sector;
    const radius = Math.max(0.1, Math.min(1, (1 - r.score) / (1 - OUTER_SCORE))) * R;
    return { r, i, angle, radius, ...polar(angle, radius) };
  });
  const top = points[0];
  return (
    <svg viewBox="0 0 520 520" className="h-auto w-full" role="img" aria-label={`Match map for a ${goalLabel} profile: ${data.results.length} courses plotted by skill area and match score.`}>
      <defs>
        <radialGradient id="dialGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgb(var(--cc-violet))" stopOpacity="0.35" />
          <stop offset="60%" stopColor="rgb(var(--cc-violet-deep))" stopOpacity="0.08" />
          <stop offset="100%" stopColor="rgb(var(--cc-midnight))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={250} fill="url(#dialGlow)" />
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="rgb(var(--cc-line))" strokeDasharray={f === 1 ? undefined : "2 6"} />
      ))}
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <text key={`l${f}`} x={C - 5} y={C - R * f + 13} textAnchor="end" fill="rgb(var(--cc-faint))" fontSize="11">
          {Math.round((1 - f * (1 - OUTER_SCORE)) * 100)}
        </text>
      ))}
      {groups.map((g, i) => {
        const a = i * sector;
        const p1 = polar(a, R * 0.12);
        const p2 = polar(a, R + 8);
        const label = polar(a + sector / 2, R + 34);
        return (
          <g key={g.id}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgb(var(--cc-line))" />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill="rgb(var(--cc-muted))" fontSize="13" fontWeight={600}>
              {g.label.split(" & ")[0]}
            </text>
          </g>
        );
      })}
      {Array.from({ length: 72 }).map((_, i) => {
        const p1 = polar(i * 5, 246);
        const p2 = polar(i * 5, i % 9 === 0 ? 236 : 241);
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgb(var(--cc-line-strong))" strokeWidth={i % 9 === 0 ? 1.5 : 1} />;
      })}
      {top && (
        <motion.line
          key={`needle-${top.r.course.id}`}
          x1={C}
          y1={C}
          initial={{ x2: C, y2: C - 30 }}
          animate={{ x2: top.x, y2: top.y }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          stroke="rgb(var(--cc-cyan))"
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      <circle cx={C} cy={C} r={7} fill="rgb(var(--cc-midnight))" stroke="rgb(var(--cc-cyan))" strokeWidth={2} />
      <AnimatePresence>
        {points.map((p) => (
          <motion.g
            key={p.r.course.id}
            initial={{ opacity: 0, x: C - p.x, y: C - p.y }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.04 * p.i, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <title>{`#${p.i + 1} ${p.r.course.title}: match ${p.r.match_percent}`}</title>
            <circle cx={p.x} cy={p.y} r={p.i === 0 ? 11 : p.i < 3 ? 8 : 5.5} fill={p.i < 3 ? "rgb(var(--cc-cyan))" : "rgb(var(--cc-violet))"} fillOpacity={p.i < 3 ? 0.95 : 0.75} />
            {p.i < 3 && (
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight={800} fill="rgb(var(--cc-midnight))">
                {p.i + 1}
              </text>
            )}
          </motion.g>
        ))}
      </AnimatePresence>
    </svg>
  );
}

function LivePreview() {
  const { taxonomy } = useAppData();
  const [goal, setGoal] = useState(PREVIEW_GOALS[0]);
  const preview = useAsync(() => api.preview(goal, 12), [goal]);
  const goalLabel = taxonomy?.career_goals.find((g) => g.id === goal)?.label ?? goal;
  const goals = PREVIEW_GOALS.filter((g) => taxonomy?.career_goals.some((c) => c.id === g));

  return (
    <div className="relative">
      <div role="radiogroup" aria-label="Preview career goal" className="mb-4 flex flex-wrap gap-2">
        {goals.map((g) => {
          const label = taxonomy?.career_goals.find((c) => c.id === g)?.label ?? g;
          const active = g === goal;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setGoal(g)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-fast ${
                active ? "border-cyan bg-cyan/10 text-cyan" : "border-line text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:grid-cols-1">
        <div className="mx-auto w-full max-w-[460px]">
          {preview.error ? (
            <ErrorState message={`${preview.error.message}`} onRetry={() => void preview.reload()} />
          ) : preview.data && taxonomy ? (
            <CompassPreview data={preview.data} taxonomy={taxonomy} goalLabel={goalLabel} />
          ) : (
            <Skeleton className="aspect-square w-full rounded-full" />
          )}
        </div>
        <div className="glass rounded-lg p-4">
          <p className="mb-3 text-sm text-muted">
            Top matches for a <span className="font-semibold text-ink">{goalLabel}</span> profile, straight from the recommender. Closer to the centre means a higher match score.
          </p>
          <ol className="grid gap-3">
            {(preview.data?.results ?? []).slice(0, 3).map((r) => (
              <li key={r.course.id} className="flex items-start gap-3">
                <ScoreDial value={r.match_percent} size={52} />
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-bold leading-snug text-ink">
                    <span className="text-cyan">{r.rank}. </span>
                    {r.course.title}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted">
                    {r.explanation.matched_career_skills.length ? `Covers ${r.explanation.matched_career_skills.slice(0, 2).join(", ")}` : r.explanation.summary}
                  </p>
                </div>
              </li>
            ))}
            {!preview.data &&
              !preview.error &&
              [0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3">
                  <Skeleton className="h-[52px] w-[52px] rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-4/5" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </li>
              ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FormulaStrip({ info }: { info: SystemInfo | null }) {
  const weights = info?.recommender_config.preference_weights;
  const labels: Record<string, string> = {
    content: "Content relevance",
    goal: "Goal & topic",
    skill_fit: "New skills",
    difficulty: "Difficulty",
    duration: "Duration",
    budget: "Budget",
    quality: "Rating",
  };
  if (!weights) return <Skeleton className="h-16 w-full" />;
  const entries = Object.entries(weights);
  return (
    <div>
      <div className="flex h-4 w-full overflow-hidden rounded-full">
        {entries.map(([k, w]) => (
          <div key={k} style={{ width: `${w * 100}%`, background: COMPONENT_COLOR[k] }} title={`${labels[k] ?? k} ${Math.round(w * 100)}%`} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {entries.map(([k, w]) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPONENT_COLOR[k] }} aria-hidden />
            <span className="text-muted">{labels[k] ?? k}</span>
            <span className="num ml-auto font-semibold text-ink">{Math.round(w * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DESTINATIONS = [
  { to: "/discover", icon: Search, title: "Discover", body: "Search every listing by title, topic or skill and filter by level, length, price, rating and language." },
  { to: "/for-you", icon: Sparkles, title: "For You", body: "A ranked shortlist with a match score, the components behind it, and the reasons in plain words." },
  { to: "/learning", icon: BookOpenCheck, title: "My Learning", body: "Track lessons and study sessions; analytics, streaks and weekly goals update from what you log." },
  { to: "/roadmap", icon: Route, title: "Roadmap", body: "A staged path of skills and courses toward your career goal, with milestones you can tick off." },
];

export default function Landing() {
  const { profile, error } = useAppData();
  const info = useAsync(() => api.systemInfo(), []);
  const count = info.data?.catalog.record_count;
  const onboarded = profile?.onboarded;

  return (
    <div className="relative min-h-screen overflow-hidden bg-midnight">
      <div className="grain pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="pointer-events-none absolute -right-40 top-10 h-[680px] w-[680px] rounded-full bg-violet/20 blur-[140px]" aria-hidden />
      <div className="pointer-events-none absolute -left-32 top-[520px] h-[360px] w-[360px] rounded-full bg-cyan/10 blur-[120px]" aria-hidden />

      <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-[var(--cc-gutter)] py-6">
        <Link to="/" className="flex items-center gap-2.5 no-underline hover:no-underline">
          <BrandMark size={34} />
          <span className="font-display text-base font-semibold text-ink">CourseCompass</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-2">
          <Link to="/discover" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-muted no-underline hover:text-ink hover:no-underline sm:block">
            Catalog
          </Link>
          <Link to="/insights" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-muted no-underline hover:text-ink hover:no-underline sm:block">
            How it works
          </Link>
          <LinkButton to="/for-you" size="sm" variant="secondary">
            Open the app
          </LinkButton>
        </nav>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-[1240px] gap-12 px-[var(--cc-gutter)] pb-20 pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-10">
          <div className="flex flex-col justify-center">
            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
              className="text-balance font-display text-4xl font-bold leading-[1.02] sm:text-5xl xl:text-[3.7rem]"
            >
              Courses ranked for your goal, with the working shown.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
              className="mt-6 max-w-[56ch] text-pretty text-lg text-muted"
            >
              CourseCompass scores {count ?? "every"} Coursera listings against your career goal, skill level, weekly hours and budget, then shows which
              signals moved each course up or down. Your progress, streaks and roadmap stay on your own machine.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <LinkButton to={onboarded ? "/for-you" : "/profile"} variant="primary" size="lg">
                {onboarded ? "See your matches" : "Set your direction"}
              </LinkButton>
              <LinkButton to="/discover" variant="secondary" size="lg">
                Browse the catalog
              </LinkButton>
            </motion.div>
            {error && <p className="mt-6 text-sm text-rose">{error} Run run.bat to start the backend.</p>}
          </div>
          <div>
            <LivePreview />
          </div>
        </section>

        <section className="border-y border-line bg-abyss/70">
          <div className="mx-auto grid max-w-[1240px] gap-10 px-[var(--cc-gutter)] py-16 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="font-display text-2xl font-semibold sm:text-3xl">How a match is made</h2>
              <p className="mt-4 max-w-prose text-muted">
                Each course gets a score from seven signals. Signals with no data, such as a level the source never listed, are left out of the
                average instead of counting against the course. Once you save, enrol in or rate courses, a collaborative signal from a clearly
                labelled synthetic learner cohort can be blended in.
              </p>
              <Link to="/insights" className="mt-4 inline-block text-sm font-semibold">
                Read the full method and evaluation
              </Link>
            </div>
            <div className="surface p-6">
              <p className="mb-4 text-sm font-semibold text-ink">Default weights, loaded from the backend configuration</p>
              <FormulaStrip info={info.data} />
              <p className="mt-5 text-xs text-faint">
                A match score is a preference-match score, not a probability that you will finish or enjoy a course.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-[var(--cc-gutter)] py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Inside the app</h2>
          <ul className="mt-8 divide-y divide-line border-y border-line">
            {DESTINATIONS.map(({ to, icon: Icon, title, body }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="group grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-1 py-6 no-underline hover:no-underline sm:grid-cols-[auto_minmax(0,14rem)_1fr]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-charcoal text-cyan transition-colors duration-fast group-hover:border-violet group-hover:text-violet-bright">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-display text-lg font-medium text-ink">{title}</span>
                  <span className="col-span-2 text-sm text-muted sm:col-span-1">{body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-[1240px] px-[var(--cc-gutter)] pb-20">
          <div className="grid gap-6 rounded-xl border border-line bg-charcoal/60 p-6 sm:p-8 md:grid-cols-3">
            <div>
              <h3 className="font-display text-base font-medium">Where the courses come from</h3>
              <p className="mt-2 text-sm text-muted">
                A July 2022 snapshot of public Coursera catalog pages, cleaned and de-duplicated locally. Links, ratings and descriptions are shown as
                captured; nothing is invented.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-medium">What is simulated</h3>
              <p className="mt-2 text-sm text-muted">
                The dataset has no learner history, so collaborative filtering and offline metrics use a synthetic cohort that is labelled as such
                everywhere it appears.
              </p>
            </div>
            <div>
              <h3 className="font-display text-base font-medium">Where your data lives</h3>
              <p className="mt-2 text-sm text-muted">
                Preferences, wishlist and study logs are JSON files in the project folder. There is no account and nothing leaves your computer.
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="relative z-10 border-t border-line py-8 text-center text-xs text-faint">
        CourseCompass AI, a recommender-systems mini-project. Course content belongs to Coursera and its partners.
      </footer>
    </div>
  );
}
