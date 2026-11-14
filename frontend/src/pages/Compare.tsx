import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Columns3, Plus, Search, X } from "lucide-react";
import { api } from "../api/client";
import type { CompareResponse, RecMode } from "../api/types";
import { CourseArt } from "../components/CourseArt";
import { PageHeader } from "../components/Layout";
import { COMPONENT_COLOR, ContributionBar } from "../components/ScoreBreakdown";
import { ScoreDial } from "../components/ScoreDial";
import { Button, LinkButton, Segmented } from "../components/ui/primitives";
import { BlockSkeleton, EmptyState, ErrorState } from "../components/ui/states";
import { MAX_COMPARE, useAppData, useUiPrefs } from "../hooks/AppContext";
import { useAsync, useDebounced } from "../hooks/useAsync";
import { durationLabel, LEVEL_LABEL, priceLabel } from "../lib/format";

function AddCourse({ exclude, onAdd }: { exclude: string[]; onAdd: (id: string) => void }) {
  const [q, setQ] = useState("");
  const d = useDebounced(q, 250);
  const res = useAsync(() => (d.length > 1 ? api.courses({ q: d, page_size: 6 }) : Promise.resolve(null)), [d]);
  return (
    <div className="surface flex h-full flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-ink">Add a course</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
        <input className="field pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or skill" aria-label="Search a course to add" />
      </div>
      <ul className="space-y-1">
        {(res.data?.items ?? [])
          .filter((c) => !exclude.includes(c.id))
          .map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink hover:bg-slate" onClick={() => { onAdd(c.id); setQ(""); }}>
                <Plus className="h-3.5 w-3.5 text-cyan" aria-hidden />
                <span className="line-clamp-1">{c.title}</span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: ReactNode[] }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="w-40 py-3 pr-4 text-left text-xs font-semibold text-muted">
        {label}
      </th>
      {cells.map((c, i) => (
        <td key={i} className="py-3 pr-4 text-sm text-ink">
          {c}
        </td>
      ))}
    </tr>
  );
}

function CompareTable({ data }: { data: CompareResponse }) {
  const items = data.items;
  const best = Math.max(...items.map((i) => i.personalization.score));
  const componentKeys = Array.from(new Set(items.flatMap((i) => i.personalization.components.map((c) => c.key))));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <caption className="sr-only">Side-by-side comparison of selected courses</caption>
        <tbody>
          <Row
            label="Match score"
            cells={items.map((i) => (
              <div className="flex items-center gap-3">
                <ScoreDial value={i.personalization.match_percent} size={60} />
                {i.personalization.score === best && <span className="text-xs font-semibold text-cyan">Best fit for you</span>}
              </div>
            ))}
          />
          <Row label="Why" cells={items.map((i) => <span className="text-muted">{i.personalization.explanation.summary}</span>)} />
          <Row label="Score makeup" cells={items.map((i) => <ContributionBar components={i.personalization.components} />)} />
          {componentKeys.map((key) => {
            const label = items[0].personalization.components.find((c) => c.key === key)?.label ?? key;
            return (
              <Row
                key={key}
                label={label}
                cells={items.map((i) => {
                  const c = i.personalization.components.find((x) => x.key === key);
                  if (!c || !c.available) return <span className="text-faint">Not scored</span>;
                  return (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: COMPONENT_COLOR[key] }} aria-hidden />
                        <span className="num font-semibold">{Math.round((c.score ?? 0) * 100)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{c.detail}</p>
                    </div>
                  );
                })}
              />
            );
          })}
          <Row label="Provider" cells={items.map((i) => i.course.provider ?? "Not listed")} />
          <Row label="Type" cells={items.map((i) => i.course.content_type_label ?? "-")} />
          <Row label="Level" cells={items.map((i) => (i.course.level ? LEVEL_LABEL[i.course.level] : "Not listed"))} />
          <Row label="Length" cells={items.map((i) => durationLabel(i.course))} />
          <Row label="Price" cells={items.map((i) => priceLabel(i.course))} />
          <Row label="Rating" cells={items.map((i) => (i.course.rating != null ? `${i.course.rating.toFixed(1)} / 5` : "No rating"))} />
          <Row label="Language" cells={items.map((i) => i.course.language ?? "Not listed")} />
          <Row label="Skills only here" cells={items.map((i) => (i.unique_skills.length ? i.unique_skills.join(", ") : "None"))} />
          <Row label="Modules" cells={items.map((i) => (i.course.modules.length ? `${i.course.modules.length} listed` : "Not captured"))} />
        </tbody>
      </table>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Skills all of them cover</h3>
          <p className="mt-1 text-sm text-muted">{data.shared_skills.length ? data.shared_skills.join(", ") : "No skill appears in every selected course."}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Content similarity (TF-IDF cosine)</h3>
          <table className="mt-2 text-sm">
            <tbody>
              {data.content_similarity.map((row, a) => (
                <tr key={a}>
                  <th scope="row" className="pr-3 text-left text-xs font-normal text-muted">
                    {String.fromCharCode(65 + a)}
                  </th>
                  {row.map((v, b) => (
                    <td key={b} className="num px-2 py-1 text-center" style={{ background: `rgb(var(--cc-violet) / ${a === b ? 0.08 : v * 1.2})` }}>
                      {v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-2xs text-faint">{items.map((i, idx) => `${String.fromCharCode(65 + idx)} = ${i.course.title}`).join("; ")}</p>
        </div>
      </div>
    </div>
  );
}

export default function Compare() {
  const { compareIds, removeCompare, clearCompare, toggleCompare } = useUiPrefs();
  const { version } = useAppData();
  const [mode, setMode] = useState<RecMode>("hybrid");
  const key = compareIds.join(",");
  const data = useAsync(() => (compareIds.length >= 2 ? api.compare(compareIds, mode) : Promise.resolve(null)), [key, mode, version]);
  const single = useAsync(() => (compareIds.length === 1 ? api.course(compareIds[0]) : Promise.resolve(null)), [key]);

  return (
    <div>
      <PageHeader
        title="Compare courses"
        description={`Line up to ${MAX_COMPARE} courses on topics, skills, difficulty, length, price, rating and how well each fits you.`}
        actions={
          compareIds.length > 0 ? (
            <>
              <Segmented<RecMode> label="Scoring mode" size="sm" value={mode} onChange={setMode} options={[{ value: "hybrid", label: "Hybrid" }, { value: "content", label: "Content only" }]} />
              <Button variant="ghost" onClick={clearCompare}>
                Clear all
              </Button>
            </>
          ) : undefined
        }
      />
      {compareIds.length === 0 ? (
        <EmptyState
          icon={<Columns3 className="h-5 w-5" />}
          title="No courses selected"
          body="Use the compare button on any course card, or search below to add one."
          action={<LinkButton to="/discover" variant="primary">Browse courses</LinkButton>}
        />
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {compareIds.map((cid, idx) => {
          const course = data.data?.items.find((i) => i.course.id === cid)?.course ?? (single.data?.course.id === cid ? single.data.course : null);
          return (
            <div key={cid} className="surface relative overflow-hidden">
              {course && <CourseArt course={course} className="h-24 w-full" />}
              <div className="p-4">
                <p className="text-xs text-faint">Course {String.fromCharCode(65 + idx)}</p>
                <p className="mt-1 line-clamp-2 text-sm font-bold text-ink">
                  {course ? <Link to={`/courses/${encodeURIComponent(cid)}`} className="text-ink">{course.title}</Link> : cid}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${course?.title ?? cid} from comparison`}
                onClick={() => removeCompare(cid)}
                className="absolute right-2 top-2 rounded-full border border-line bg-midnight/80 p-1.5 text-muted hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {compareIds.length < MAX_COMPARE && <AddCourse exclude={compareIds} onAdd={(id) => toggleCompare(id)} />}
      </div>

      <div className="mt-8">
        {compareIds.length === 1 && <p className="text-sm text-muted">Add at least one more course to see the comparison.</p>}
        {compareIds.length >= 2 &&
          (data.error ? (
            <ErrorState message={data.error.message} onRetry={() => void data.reload()} />
          ) : data.data ? (
            <div className="surface p-5">
              <CompareTable data={data.data} />
            </div>
          ) : (
            <BlockSkeleton rows={4} />
          ))}
      </div>
    </div>
  );
}
