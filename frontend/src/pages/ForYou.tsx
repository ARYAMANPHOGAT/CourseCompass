import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Columns3,
  Compass,
  GitCompareArrows,
  Plus,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { api } from "../api/client";
import type { ExplainResponse, RecMode, RecommendationResponse, RecommendationResult } from "../api/types";
import { CourseArt } from "../components/CourseArt";
import { CourseMeta, Rating } from "../components/CourseCard";
import { EnrollDialog } from "../components/LearningDialogs";
import { PageHeader } from "../components/Layout";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { ScoreDial } from "../components/ScoreDial";
import { SimilarCourses } from "../components/SimilarCourses";
import { Badge, Button, IconButton, LinkButton, Segmented } from "../components/ui/primitives";
import { BlockSkeleton, EmptyState, ErrorState } from "../components/ui/states";
import { errorMessage, useAppData, useCourseActions, useUiPrefs } from "../hooks/AppContext";
import { useAsync, useDebounced } from "../hooks/useAsync";
import { EXCLUSION_LABEL, METHOD_LABEL } from "../lib/format";

function RecCard({ rec, saved, onChanged, personal }: { rec: RecommendationResult; saved: boolean; onChanged: () => void; personal: boolean }) {
  const actions = useCourseActions();
  const { compareIds } = useUiPrefs();
  const [open, setOpen] = useState<"why" | "similar" | null>(null);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const c = rec.course;
  const ex = rec.explanation;
  const inCompare = compareIds.includes(c.id);

  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="surface overflow-hidden">
      <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
        <div className="flex items-start gap-3">
          <span className="num w-7 pt-1 text-right font-display text-lg font-semibold text-faint" aria-label={`Rank ${rec.rank}`}>
            {rec.rank}
          </span>
          <CourseArt course={c} className="h-20 w-28 rounded-md sm:h-24 sm:w-36" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted">{c.provider ?? "Provider not listed"}</p>
          <h2 className="mt-0.5 font-sans text-lg font-bold leading-snug">
            <Link to={`/courses/${encodeURIComponent(c.id)}`} className="text-ink">
              {c.title}
            </Link>
          </h2>
          <p className="mt-2 text-sm text-ink/90">{ex.summary}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {ex.matched_career_skills.length > 0 && (
              <span className="text-muted">
                <span className="text-cyan">Goal skills </span>
                {ex.matched_career_skills.join(", ")}
              </span>
            )}
            {ex.new_skills.length > 0 && (
              <span className="text-muted">
                <span className="text-violet-bright">New for you </span>
                {ex.new_skills.join(", ")}
              </span>
            )}
          </div>
          {ex.cautions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {ex.cautions.map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-xs text-amber">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CourseMeta course={c} compact />
            <Rating value={c.rating} />
          </div>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <ScoreDial value={personal ? rec.match_percent : null} size={84} />
          {rec.collaborative_score != null && rec.hybrid_weights.collaborative > 0 && (
            <Badge tone="cyan">collab {Math.round(rec.collaborative_score * 100)}</Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-abyss/50 px-4 py-3 sm:px-5">
        <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEnrollOpen(true)}>
          Add to My Learning
        </Button>
        <IconButton
          label={saved ? "Remove from wishlist" : "Save to wishlist"}
          active={saved}
          onClick={async () => {
            const r = saved ? await actions.unsave(c.id) : await actions.save(c.id);
            if (r !== null) onChanged();
          }}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </IconButton>
        <IconButton label="Relevant to me" onClick={async () => (await actions.feedback(c.id, "relevant")) && onChanged()}>
          <ThumbsUp className="h-4 w-4" />
        </IconButton>
        <IconButton label="Not relevant to me" onClick={async () => (await actions.feedback(c.id, "irrelevant")) && onChanged()}>
          <ThumbsDown className="h-4 w-4" />
        </IconButton>
        <IconButton label={inCompare ? "Remove from comparison" : "Add to comparison"} active={inCompare} onClick={() => actions.compare(c.id)}>
          <Columns3 className="h-4 w-4" />
        </IconButton>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" aria-expanded={open === "why"} onClick={() => setOpen(open === "why" ? null : "why")}>
            Score breakdown
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === "why" ? "rotate-180" : ""}`} />
          </Button>
          <Button size="sm" variant="ghost" aria-expanded={open === "similar"} onClick={() => setOpen(open === "similar" ? null : "similar")}>
            Similar
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === "similar" ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-line">
            <div className="p-4 sm:p-5">
              {open === "why" ? (
                <>
                  <ScoreBreakdown result={rec} />
                  <p className="mt-3 text-xs text-faint">{ex.prerequisite_note}</p>
                </>
              ) : (
                <SimilarCourses courseId={c.id} limit={3} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <EnrollDialog course={c} open={enrollOpen} onClose={() => setEnrollOpen(false)} onDone={onChanged} />
    </motion.li>
  );
}

function WhyNotPanel({ mode }: { mode: RecMode }) {
  const [q, setQ] = useState("");
  const debounced = useDebounced(q, 250);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const search = useAsync(() => (debounced.length > 1 ? api.courses({ q: debounced, page_size: 5 }) : Promise.resolve(null)), [debounced]);

  useEffect(() => {
    if (!picked) return;
    setError(null);
    api.explain(picked, mode).then(setResult).catch((e) => setError(errorMessage(e)));
  }, [picked, mode]);

  return (
    <section className="surface p-5" aria-labelledby="whynot">
      <h2 id="whynot" className="flex items-center gap-2 font-display text-base font-medium">
        <GitCompareArrows className="h-4 w-4 text-cyan" aria-hidden />
        Why isn't a course higher?
      </h2>
      <p className="mt-1 text-sm text-muted">Pick any course to see its rank and which components put it behind your number one.</p>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input className="field pl-9" placeholder="Search a course title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search a course to explain" />
      </div>
      {search.data && search.data.items.length > 0 && !picked && (
        <ul className="mt-2 divide-y divide-line rounded-md border border-line">
          {search.data.items.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-slate" onClick={() => setPicked(c.id)}>
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
      {picked && result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{result.course.title}</p>
              <p className="text-sm text-muted">
                {result.excluded_reason
                  ? `Not in your list: ${EXCLUSION_LABEL[result.excluded_reason] ?? result.excluded_reason}.`
                  : result.comparison?.text ?? `Ranked #${result.rank} of ${result.total_ranked}.`}
              </p>
            </div>
            <ScoreDial value={result.match_percent} size={56} />
          </div>
          {result.comparison && result.comparison.largest_gaps.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {result.comparison.largest_gaps.map((g) => (
                <li key={g.key} className="flex justify-between gap-3 rounded-sm bg-abyss px-3 py-1.5">
                  <span className="text-muted">{g.label}</span>
                  <span className="num text-ink">
                    {(g.this * 100).toFixed(1)} vs {(g.top * 100).toFixed(1)} for #1
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="ghost" onClick={() => { setPicked(null); setResult(null); setQ(""); }}>
            Explain another course
          </Button>
        </div>
      )}
    </section>
  );
}

export default function ForYou() {
  const { profile, version, careerLabel } = useAppData();
  const [mode, setMode] = useState<RecMode>("hybrid");
  const [limit, setLimit] = useState(10);
  const recs = useAsync<RecommendationResponse>(() => api.recommendations(mode, limit), [mode, limit, version]);
  const wishlist = useAsync(() => api.wishlist(), [version]);
  const savedIds = new Set((wishlist.data ?? []).map((w) => w.course_id));
  const data = recs.data;
  const excluded = Object.entries(data?.excluded ?? {}).filter(([, n]) => n > 0);

  return (
    <div>
      <PageHeader
        title="For you"
        description={
          profile?.onboarded
            ? `Ranked for a ${careerLabel(profile.career_goal)} path. Every score below is built from the components you can open.`
            : "Set your preferences to turn this into a personal ranking."
        }
        actions={
          <>
            <Segmented<RecMode>
              label="Recommendation mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "hybrid", label: "Hybrid", hint: "Preferences plus collaborative signal when available" },
                { value: "content", label: "Content only", hint: "TF-IDF content plus preference scoring" },
              ]}
            />
            <LinkButton to="/profile" variant="secondary">
              Edit preferences
            </LinkButton>
          </>
        }
      />

      {!profile?.onboarded && (
        <div className="mb-6">
          <EmptyState
            icon={<Compass className="h-5 w-5" />}
            title="Tell CourseCompass where you're heading"
            body="Without a goal the list below is ordered by rating and general fit only. It takes about a minute."
            action={<LinkButton to="/profile" variant="primary">Set your direction</LinkButton>}
          />
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {data && (
            <div className="mb-5 rounded-md border border-line bg-charcoal px-4 py-3 text-sm">
              <p className="font-semibold text-ink">{METHOD_LABEL[data.method_used]}</p>
              <p className="mt-0.5 text-muted">
                {data.cf_status.available
                  ? `Collaborative signal weight ${Math.round((data.cf_status.weight ?? 0) * 100)}% (confidence ${Math.round(
                      data.cf_status.confidence * 100,
                    )}% from ${data.cf_status.user_interactions} courses you interacted with), learned from the ${data.cf_status.data_label}.`
                  : mode === "hybrid"
                    ? `Collaborative filtering is off for now: ${data.cf_status.reason}`
                    : "Collaborative filtering is switched off in content-only mode."}
              </p>
              {excluded.length > 0 && (
                <p className="mt-1 text-xs text-faint">
                  Hidden: {excluded.map(([k, n]) => `${n} ${EXCLUSION_LABEL[k] ?? k}`).join(", ")}.
                </p>
              )}
            </div>
          )}
          {recs.error ? (
            <ErrorState message={recs.error.message} onRetry={() => void recs.reload()} />
          ) : !data ? (
            <BlockSkeleton rows={5} />
          ) : data.results.length === 0 ? (
            <EmptyState
              title="Nothing left to recommend"
              body="Every course is completed, enrolled, hidden by language or marked not relevant. Widen your languages or clear some feedback."
              action={<LinkButton to="/profile">Edit preferences</LinkButton>}
            />
          ) : (
            <>
              <ol className={`space-y-4 ${recs.loading ? "opacity-60" : ""}`}>
                <AnimatePresence initial={false}>
                  {data.results.map((r) => (
                    <RecCard key={r.course.id} rec={r} personal={data.profile_complete || data.cf_status.user_interactions > 0} saved={savedIds.has(r.course.id)} onChanged={() => void wishlist.reload()} />
                  ))}
                </AnimatePresence>
              </ol>
              {data.results.length < data.total_candidates && (
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" loading={recs.loading} onClick={() => setLimit((l) => Math.min(50, l + 10))} disabled={limit >= 50}>
                    Show more ({data.total_candidates - data.results.length} more ranked)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        <aside className="space-y-6">
          <WhyNotPanel mode={mode} />
          <div className="surface p-5 text-sm text-muted">
            <h2 className="section-title text-ink">Reading the score</h2>
            <p className="mt-2">
              The dial shows a preference-match score out of 100. It is not a probability that you will finish or like the course, and not a
              model accuracy.
            </p>
            <p className="mt-2">
              Thumbs up and saves pull similar courses up (relevance feedback). Thumbs down removes a course from this list.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
