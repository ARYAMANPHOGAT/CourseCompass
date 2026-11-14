import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { api, type CourseQuery } from "../api/client";
import type { Facet } from "../api/types";
import { CourseCard } from "../components/CourseCard";
import { PageHeader } from "../components/Layout";
import { Button, Chip, LinkButton } from "../components/ui/primitives";
import { CardSkeletonGrid, EmptyState, ErrorState } from "../components/ui/states";
import { useAppData } from "../hooks/AppContext";
import { useAsync, useDebounced } from "../hooks/useAsync";
import { DURATION_HINT, DURATION_LABEL, LEVEL_LABEL } from "../lib/format";

const MULTI = ["category", "type", "level", "duration", "language", "skill"] as const;
type MultiKey = (typeof MULTI)[number];

const SORTS = [
  { value: "relevance", label: "Best match for search" },
  { value: "match", label: "Your match score" },
  { value: "rating", label: "Highest rated" },
  { value: "duration", label: "Shortest first" },
  { value: "title", label: "Title A-Z" },
];

function FacetGroup({
  title,
  options,
  counts,
  selected,
  onToggle,
  labels,
}: {
  title: string;
  options: Facet[];
  counts: Record<string, number>;
  selected: string[];
  onToggle: (v: string) => void;
  labels?: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? options : options.slice(0, 8);
  return (
    <fieldset className="border-t border-line pt-4">
      <legend className="float-left mb-2 w-full text-sm font-semibold text-ink">{title}</legend>
      <div className="clear-left space-y-1">
        {shown.map((o) => {
          const id = `f-${title}-${o.value}`.replace(/\W+/g, "-");
          const n = counts[o.value] ?? 0;
          return (
            <label key={o.value} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1 text-sm hover:bg-slate">
              <input
                id={id}
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--cc-violet))]"
                checked={selected.includes(o.value)}
                onChange={() => onToggle(o.value)}
              />
              <span className={`flex-1 ${n === 0 && !selected.includes(o.value) ? "text-faint" : "text-muted"}`}>{labels?.[o.value] ?? o.label}</span>
              <span className="num text-xs text-faint">{n}</span>
            </label>
          );
        })}
      </div>
      {options.length > 8 && (
        <button type="button" className="mt-1 text-xs font-semibold text-violet-bright hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show fewer" : `Show all ${options.length}`}
        </button>
      )}
    </fieldset>
  );
}

export default function Discover() {
  const [params, setParams] = useSearchParams();
  const { taxonomy, profile, version } = useAppData();
  const [showFilters, setShowFilters] = useState(false);
  const [text, setText] = useState(params.get("q") ?? "");
  const debounced = useDebounced(text, 300);

  const multi = (k: MultiKey) => params.getAll(k);
  const freeOnly = params.get("free") === "1";
  const minRating = params.get("rating");
  const page = Number(params.get("page") ?? "1") || 1;
  // Without an explicit choice the backend picks: relevance for a search, otherwise match score
  // (when preferences exist) or rating. This avoids a second request once the profile loads.
  const sortParam = params.get("sort") ?? undefined;

  const query: CourseQuery = {
    q: debounced || undefined,
    category: multi("category"),
    content_type: multi("type"),
    level: multi("level"),
    duration: multi("duration"),
    language: multi("language"),
    skill: multi("skill"),
    free_only: freeOnly || undefined,
    min_rating: minRating ? Number(minRating) : undefined,
    sort: sortParam,
    page,
    page_size: 12,
  };
  const key = JSON.stringify(query);
  const results = useAsync(() => api.courses(query), [key, version]);
  const all = useAsync(() => api.courses({ page_size: 1 }), []);

  const setParam = (mutate: (p: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(params);
    mutate(next);
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
  };
  const toggle = (k: MultiKey, v: string) =>
    setParam((p) => {
      const cur = p.getAll(k);
      p.delete(k);
      (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).forEach((x) => p.append(k, x));
    });

  // keep the URL's q parameter in sync with the debounced search box
  useEffect(() => {
    if ((params.get("q") ?? "") !== debounced) setParam((p) => (debounced ? p.set("q", debounced) : p.delete("q")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const counts = useMemo(() => {
    const f = results.data?.facets;
    const toMap = (arr?: Facet[]) => Object.fromEntries((arr ?? []).map((x) => [x.value, x.count]));
    return {
      category: toMap(f?.categories),
      type: toMap(f?.content_types),
      level: toMap(f?.levels),
      duration: toMap(f?.durations),
      language: toMap(f?.languages),
    };
  }, [results.data]);
  const base = all.data?.facets;

  const active: { k: MultiKey | "free" | "rating"; v: string; label: string }[] = [
    ...MULTI.flatMap((k) =>
      multi(k).map((v) => ({
        k,
        v,
        label: k === "level" ? LEVEL_LABEL[v] ?? v : k === "duration" ? DURATION_LABEL[v] ?? v : k === "skill" ? taxonomy?.skills.find((s) => s.id === v)?.label ?? v : k === "type" ? taxonomy?.content_types.find((t) => t.id === v)?.label ?? v : v,
      })),
    ),
    ...(freeOnly ? [{ k: "free" as const, v: "1", label: "Free only" }] : []),
    ...(minRating ? [{ k: "rating" as const, v: minRating, label: `Rated ${minRating}+` }] : []),
  ];

  const resetAll = () => {
    setText("");
    setParams(new URLSearchParams(), { replace: true });
  };

  const filterPanel = base && (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Filters</span>
        {active.length > 0 && (
          <button type="button" onClick={resetAll} className="text-xs font-semibold text-violet-bright hover:underline">
            Reset all
          </button>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--cc-violet))]" checked={freeOnly} onChange={() => setParam((p) => (freeOnly ? p.delete("free") : p.set("free", "1")))} />
        Free to enrol only
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">Minimum rating</span>
        <select className="field" value={minRating ?? ""} onChange={(e) => setParam((p) => (e.target.value ? p.set("rating", e.target.value) : p.delete("rating")))}>
          <option value="">Any rating</option>
          <option value="4.5">4.5 and up</option>
          <option value="4.7">4.7 and up</option>
          <option value="4.8">4.8 and up</option>
        </select>
      </label>
      <FacetGroup title="Content type" options={base.content_types} counts={counts.type} selected={multi("type")} onToggle={(v) => toggle("type", v)} />
      <FacetGroup title="Level" options={base.levels} counts={counts.level} selected={multi("level")} onToggle={(v) => toggle("level", v)} labels={LEVEL_LABEL} />
      <FacetGroup
        title="Length"
        options={base.durations}
        counts={counts.duration}
        selected={multi("duration")}
        onToggle={(v) => toggle("duration", v)}
        labels={Object.fromEntries(Object.entries(DURATION_LABEL).map(([k, l]) => [k, `${l} (${DURATION_HINT[k] ?? ""})`]))}
      />
      <FacetGroup title="Category" options={base.categories} counts={counts.category} selected={multi("category")} onToggle={(v) => toggle("category", v)} />
      <FacetGroup title="Language" options={base.languages} counts={counts.language} selected={multi("language")} onToggle={(v) => toggle("language", v)} />
      {taxonomy && (
        <fieldset className="border-t border-line pt-4">
          <legend className="float-left mb-2 w-full text-sm font-semibold text-ink">Skill</legend>
          <select className="field" value="" onChange={(e) => e.target.value && toggle("skill", e.target.value)} aria-label="Add a skill filter">
            <option value="">Add a skill filter</option>
            {taxonomy.skills.filter((s) => !multi("skill").includes(s.id)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </fieldset>
      )}
    </div>
  );

  const data = results.data;
  return (
    <div>
      <PageHeader
        title="Discover courses"
        description={`Search ${all.data?.total ?? ""} cleaned Coursera listings by title, description, topic or skill.`}
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            className="field h-11 pl-9 text-base"
            placeholder="Try SQL, UX research, Kubernetes, black holes"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Search courses"
          />
        </div>
        <div className="flex gap-2">
          <select className="field h-11 w-auto" value={sortParam ?? results.data?.sort ?? "relevance"} onChange={(e) => setParam((p) => p.set("sort", e.target.value))} aria-label="Sort by">
            {SORTS.filter((s) => (s.value === "match" ? profile?.onboarded : true)).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button className="h-11 lg:hidden" variant="secondary" icon={<Filter className="h-4 w-4" />} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            Filters
          </Button>
        </div>
      </div>

      {active.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {active.map((a) => (
            <Chip
              key={`${a.k}-${a.v}`}
              selected
              onClick={() =>
                a.k === "free" ? setParam((p) => p.delete("free")) : a.k === "rating" ? setParam((p) => p.delete("rating")) : toggle(a.k, a.v)
              }
            >
              {a.label}
              <X className="h-3 w-3" aria-label="remove filter" />
            </Chip>
          ))}
          <button type="button" onClick={resetAll} className="text-xs font-semibold text-muted hover:text-ink">
            Clear filters
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className={`${showFilters ? "block" : "hidden"} lg:block`} aria-label="Filters">
          {filterPanel}
        </aside>
        <section aria-live="polite" aria-busy={results.loading}>
          {data && !results.loading && (
            <p className="mb-4 text-sm text-muted">
              {data.total} {data.total === 1 ? "course" : "courses"}
              {data.query ? ` for "${data.query}"` : ""}
              {data.personalized ? ", with your match scores" : ""}
            </p>
          )}
          {results.error ? (
            <ErrorState message={results.error.message} onRetry={() => void results.reload()} />
          ) : results.loading && !data ? (
            <CardSkeletonGrid />
          ) : data && data.total === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No courses match these filters"
              body="Remove a filter or try a broader word such as 'data', 'cloud' or 'design'."
              action={<Button onClick={resetAll}>Clear search and filters</Button>}
            />
          ) : (
            data && (
              <div className={results.loading ? "opacity-60 transition-opacity" : ""}>
                {!data.personalized && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-charcoal px-4 py-3 text-sm text-muted">
                    <span>Set your preferences to see a match score on every course.</span>
                    <LinkButton to="/profile" size="sm" variant="cyan">
                      Set preferences
                    </LinkButton>
                  </div>
                )}
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {data.items.map((c) => (
                    <CourseCard key={c.id} course={c} onChanged={() => void results.reload()} />
                  ))}
                </div>
                {data.pages > 1 && (
                  <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={data.page <= 1}
                      icon={<ChevronLeft className="h-4 w-4" />}
                      onClick={() => setParam((p) => p.set("page", String(data.page - 1)), false)}
                    >
                      Previous
                    </Button>
                    <span className="num text-sm text-muted">
                      Page {data.page} of {data.pages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={data.page >= data.pages}
                      onClick={() => setParam((p) => p.set("page", String(data.page + 1)), false)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </nav>
                )}
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
