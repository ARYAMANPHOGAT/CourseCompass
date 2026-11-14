import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ErrorBar, Tooltip, XAxis, YAxis } from "recharts";
import { Database, FlaskConical, ImageOff, RefreshCw, Sparkles, Trash2, Wrench } from "lucide-react";
import { api, API_BASE_URL } from "../api/client";
import type { EvaluationResult, SystemInfo } from "../api/types";
import { PageHeader } from "../components/Layout";
import { COMPONENT_COLOR } from "../components/ScoreBreakdown";
import { ConfirmDialog } from "../components/ui/Dialog";
import { Badge, Button, Toggle } from "../components/ui/primitives";
import { BlockSkeleton, DemoNotice, ErrorState } from "../components/ui/states";
import { errorMessage, useAppData, useToast, useUiPrefs } from "../hooks/AppContext";
import { useAsync } from "../hooks/useAsync";
import { CHART } from "../lib/chart";
import { ChartFrame } from "../components/ChartFrame";
import { formatDate } from "../lib/format";

const TABS = [
  { id: "method", label: "How it works" },
  { id: "evaluation", label: "Evaluation" },
  { id: "dataset", label: "Dataset" },
  { id: "settings", label: "Settings" },
  { id: "help", label: "Troubleshooting" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const WEIGHT_LABEL: Record<string, string> = {
  content: "Content relevance (TF-IDF cosine)",
  goal: "Goal & topic alignment",
  skill_fit: "New-skill fit",
  difficulty: "Difficulty fit",
  duration: "Duration fit",
  budget: "Budget fit",
  quality: "Learner rating",
};

const METHOD_LABEL: Record<string, string> = {
  popularity: "Popularity baseline",
  content_cold_start: "Content, profile only (cold start)",
  content: "Content + feedback",
  collaborative: "Collaborative only",
  hybrid: "Hybrid",
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="surface p-5 sm:p-6">
      <h2 className="section-title">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-abyss px-4 py-3 font-sans text-sm text-ink">{children}</pre>;
}

function MethodTab({ info }: { info: SystemInfo }) {
  const cfg = info.recommender_config;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Block title="1. Content-based filtering">
        <p>
          Each course becomes a document: title (counted twice), category, detected skills, description and syllabus. scikit-learn's TF-IDF turns
          documents into weighted term vectors (unigrams and bigrams, English stop words removed, sublinear term frequency). Cosine similarity
          between your profile vector and every course vector measures textual relevance. Course vectors and the full course-to-course similarity
          matrix are computed once at startup and cached.
        </p>
        <p>
          Your profile vector comes from your career goal, the goal's skills you don't have yet, your topics and your free-text objectives. Feedback
          shifts it (Rocchio): profile = {cfg.rocchio.alpha} x query + {cfg.rocchio.beta_positive} x mean(saved, enrolled, relevant) - {cfg.rocchio.gamma_negative} x
          mean(not relevant).
        </p>
      </Block>
      <Block title="2. Weighted preference score">
        <Formula>{"preference = sum(weight_k x score_k) / sum(weight_k)\nover components k that have data"}</Formula>
        <ul className="space-y-1.5">
          {Object.entries(cfg.preference_weights).map(([k, w]) => (
            <li key={k} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COMPONENT_COLOR[k] }} aria-hidden />
              <span className="flex-1">{WEIGHT_LABEL[k] ?? k}</span>
              <span className="num font-semibold text-ink">{w.toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <p>
          Every component is between 0 and 1. A component without data (level not listed, no budget limit set) is dropped from both sums, so missing
          metadata never counts against a course. Content relevance is divided by the best cosine in the catalog for your profile.
        </p>
      </Block>
      <Block title="3. Collaborative filtering (item-kNN)">
        <p>
          Interactions form a user x course matrix: save {cfg.interaction_weights.save}, enrol {cfg.interaction_weights.enroll}, complete +
          {cfg.interaction_weights.complete}, relevant {cfg.interaction_weights.relevant}, previously studied {cfg.interaction_weights.previously_studied},
          not relevant {cfg.interaction_weights.irrelevant}, rating (stars - 3) x {cfg.interaction_weights.rating_per_star_from_3}.
        </p>
        <Formula>{`sim(i, j) = cosine(i, j) x n_ij / (n_ij + ${cfg.collaborative.shrinkage})   top ${cfg.collaborative.neighbors} neighbours\ncf(i) = sum over your courses j of sim(i, j) x your strength_j`}</Formula>
        <p>
          The course CSV has no learner history, so this matrix is trained on a <span className="font-semibold text-ink">synthetic demo cohort</span> of{" "}
          {String(info.synthetic_cohort.n_users ?? "")} simulated learners. It demonstrates the algorithm; it is not real student behaviour.
        </p>
      </Block>
      <Block title="4. Hybrid score and cold start">
        <Formula>{`final = (1 - lam) x preference + lam x cf_normalised\nlam = ${cfg.hybrid.collaborative_weight_max} x min(1, your interactions / ${cfg.hybrid.full_confidence_interactions})`}</Formula>
        <p>
          Collaborative filtering switches on after {cfg.hybrid.min_user_interactions} positive interactions. Until then, and in content-only mode, the
          score is the preference score alone. New students therefore get useful results from onboarding answers only (cold start). A course with no
          cohort evidence keeps lam = 0.
        </p>
        <p>
          Completed, previously studied and not-relevant courses are excluded; enrolled courses are excluded from For You. The match score is a
          preference-match score, not a probability of success.
        </p>
      </Block>
    </div>
  );
}

function EvaluationTab() {
  const { notify } = useToast();
  const ev = useAsync<EvaluationResult>(() => api.evaluation(), []);
  const [running, setRunning] = useState(false);
  if (ev.error) return <ErrorState message={ev.error.message} onRetry={() => void ev.reload()} />;
  if (!ev.data) return <BlockSkeleton rows={4} />;
  const e = ev.data;
  const metrics = ["precision@5", "recall@5", "ndcg@5", "precision@10", "recall@10", "ndcg@10"];
  const chartData = Object.entries(e.results).map(([m, r]) => ({ method: METHOD_LABEL[m] ?? m, ndcg: r["ndcg@10"]?.mean ?? 0, ci: r["ndcg@10"]?.ci95 ?? 0 }));
  return (
    <div className="space-y-6">
      <DemoNotice>
        Computed on the SYNTHETIC cohort ({e.dataset.users_evaluated} simulated learners, {e.dataset.test_items} held-out items). These numbers show the
        pipeline works; they are not evidence of real-world quality or learning outcomes.
      </DemoNotice>
      <section className="surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Offline ranking metrics</h2>
            <p className="text-xs text-muted">Generated {formatDate(e.generated_at)}; mean over learners, plus or minus 95% interval.</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={running}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={async () => {
              setRunning(true);
              try {
                ev.setData(await api.runEvaluation());
                notify("Evaluation re-run");
              } catch (err) {
                notify(errorMessage(err), "error");
              } finally {
                setRunning(false);
              }
            }}
          >
            Re-run evaluation
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Precision, recall and NDCG at 5 and 10 by method</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-semibold">Method</th>
                {metrics.map((m) => (
                  <th key={m} scope="col" className="py-2 pr-4 font-semibold">
                    {m.replace("precision", "Precision").replace("recall", "Recall").replace("ndcg", "NDCG")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(e.results).map(([m, r]) => (
                <tr key={m} className="border-t border-line">
                  <th scope="row" className="py-2 pr-4 text-left font-semibold text-ink">
                    {METHOD_LABEL[m] ?? m}
                  </th>
                  {metrics.map((k) => (
                    <td key={k} className="num py-2 pr-4 text-ink">
                      {r[k]?.mean.toFixed(3)} <span className="text-xs text-faint">+/-{r[k]?.ci95.toFixed(3)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5" aria-label="NDCG at 10 by method">
          <h2 className="section-title">NDCG@10 by method</h2>
          <ChartFrame height={256}>
{({ width, height }) => (
              <BarChart width={width} height={height} data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={CHART.grid} horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tick={CHART.tick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="method" width={150} tick={{ ...CHART.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip {...CHART.tooltip} formatter={(v) => [Number(v).toFixed(3), "NDCG@10"]} />
                <Bar dataKey="ndcg" fill={CHART.series} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <ErrorBar dataKey="ci" width={4} stroke={CHART.axis} direction="x" />
                </Bar>
              </BarChart>
)}
</ChartFrame>
        </section>
        <Block title="Protocol">
          <ul className="list-disc space-y-1 pl-5">
            {Object.entries(e.protocol).map(([k, v]) => (
              <li key={k}>
                <span className="font-semibold text-ink">{k.replace(/_/g, " ")}:</span> {Array.isArray(v) ? v.join(", ") : String(v)}
              </li>
            ))}
            <li>
              <span className="font-semibold text-ink">learners excluded (too few positives):</span> {e.dataset.users_excluded_too_few_positives}
            </li>
            <li>
              <span className="font-semibold text-ink">hybrid fell back to content for:</span> {e.hybrid_fallbacks_to_content} learners
            </li>
          </ul>
          {e.comparison && (
            <p>
              Hybrid minus content on {e.comparison.metric}: <span className="num font-semibold text-ink">{e.comparison.mean_difference_hybrid_minus_content.toFixed(3)}</span>{" "}
              (hybrid better for {e.comparison.users_hybrid_better}, content better for {e.comparison.users_content_better}, tied {e.comparison.users_tied}). {e.comparison.note}
            </p>
          )}
        </Block>
      </div>
      <Block title="Definitions and limitations">
        <p>
          Precision@K: share of the top K that are held-out courses. Recall@K: share of held-out courses found in the top K. NDCG@K: rewards placing
          held-out courses near the top, normalised by the best possible ranking.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {e.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="text-xs text-faint">Command-line equivalent: python -m app.evaluation (from the backend folder).</p>
      </Block>
    </div>
  );
}

function DatasetTab({ info }: { info: SystemInfo }) {
  const meta = info.catalog.meta;
  const pre = info.preprocessing;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Block title="Provenance and licensing">
        <p>{meta.provenance_note ?? "No provenance note available."}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-faint">Catalog source</dt>
          <dd className="text-ink">{info.catalog.source_kind === "sample" ? "Bundled SAMPLE catalog (fictional records)" : String(meta.source ?? "")}</dd>
          <dt className="text-faint">Records</dt>
          <dd className="num text-ink">{info.catalog.record_count}</dd>
          <dt className="text-faint">Processed</dt>
          <dd className="text-ink">{formatDate(meta.generated_at as string | undefined)}</dd>
          <dt className="text-faint">Source SHA-256</dt>
          <dd className="break-all text-xs text-ink">{String(meta.source_sha256 ?? "n/a")}</dd>
        </dl>
        {info.catalog.load_notes.map((n) => (
          <p key={n} className="text-amber">{n}</p>
        ))}
      </Block>
      <Block title="Preprocessing summary">
        {pre ? (
          <>
            <p>
              <span className="num font-semibold text-ink">{pre.input_rows}</span> raw rows became <span className="num font-semibold text-ink">{pre.output_records}</span> courses.{" "}
              {pre.duplicate_rows_removed_exact} exact duplicate rows were collapsed by canonical URL and {pre.excluded_count} rows were excluded.
            </p>
            <ul className="space-y-1">
              {(pre.excluded_rows ?? []).map((r) => (
                <li key={`${r.row}-${r.reason}`} className="text-xs">
                  Row {r.row}: {r.reason.replace(/_/g, " ")} <span className="break-all text-faint">({r.value})</span>
                </li>
              ))}
            </ul>
            <p className="text-xs">Placeholders such as "-" became missing values. Skills were detected for {pre.courses_with_detected_skills} courses from their own text.</p>
          </>
        ) : (
          <p>No preprocessing report found. Run python -m app.preprocessing from the backend folder.</p>
        )}
      </Block>
      {pre?.missing_after_cleaning && (
        <Block title="Missing values after cleaning">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(pre.missing_after_cleaning).map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <th scope="row" className="py-1.5 text-left font-normal text-muted">
                    {k.replace(/_/g, " ")}
                  </th>
                  <td className="num py-1.5 text-right text-ink">
                    {v} / {info.catalog.record_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs">The source has no prerequisites or review counts for any course, so the app never shows or infers them.</p>
        </Block>
      )}
      <Block title="Catalog mix">
        {(["content_types", "levels", "durations", "price_statuses"] as const).map((k) => (
          <div key={k}>
            <p className="text-xs font-semibold text-ink">{k.replace(/_/g, " ")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {info.catalog.facets[k].map((f) => (
                <Badge key={f.value}>
                  {f.label} <span className="num text-faint">{f.count}</span>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </Block>
      <Block title="Synthetic demo cohort">
        <p>{String(info.synthetic_cohort.label ?? "")}</p>
        <p>
          <span className="num font-semibold text-ink">{String(info.synthetic_cohort.n_users ?? "")}</span> simulated learners,{" "}
          <span className="num font-semibold text-ink">{String(info.synthetic_cohort.n_interactions ?? "")}</span> interactions, seed {String(info.synthetic_cohort.seed ?? "")}.
          Regenerate with python -m app.synthetic.
        </p>
        <p className="text-xs">{String(info.synthetic_cohort.description ?? "")}</p>
      </Block>
    </div>
  );
}

function SettingsTab({ info, onChanged }: { info: SystemInfo; onChanged: () => void }) {
  const { notify } = useToast();
  const { bump, reload } = useAppData();
  const { remoteImages, setRemoteImages } = useUiPrefs();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"demo" | "reset" | null>(null);
  const demoCount = Object.values(info.storage.demo_records).reduce((a, b) => a + b, 0);

  const seed = async () => {
    setBusy("seed");
    try {
      const r = await api.seedDemo();
      if (r.seeded) notify("Demo activity added and labelled as demo");
      else notify(r.reason ?? "Could not seed demo data", "info");
      bump();
      onChanged();
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Block title="Display">
        <Toggle
          checked={remoteImages}
          onChange={setRemoteImages}
          label="Load course images from the internet"
          description="Turn off when offline. Courses then use locally generated artwork; nothing else changes."
        />
        <p className="flex items-center gap-2 text-xs">
          <ImageOff className="h-3.5 w-3.5" aria-hidden /> Broken image links fall back to local artwork automatically.
        </p>
      </Block>
      <Block title="Demo mode">
        <p>
          Adds a few enrolments, study sessions over the last five weeks, saves and feedback, all labelled demo, so analytics have something to show in a
          presentation. Your own records are never changed.
        </p>
        <p className="num text-xs">Demo records stored now: {demoCount}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="cyan" icon={<Sparkles className="h-4 w-4" />} loading={busy === "seed"} onClick={() => void seed()}>
            Seed demo activity
          </Button>
          <Button variant="secondary" icon={<Trash2 className="h-4 w-4" />} disabled={demoCount === 0} onClick={() => setConfirm("demo")}>
            Remove demo data
          </Button>
        </div>
      </Block>
      <Block title="Reset everything">
        <p>
          Deletes your profile, wishlist, feedback, enrolments, study sessions, goals and roadmap progress. A backup copy is written to
          backend/data/user/backups first.
        </p>
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm("reset")}>
          Reset all local data
        </Button>
      </Block>
      <Block title="Storage">
        <p>
          {info.storage.backend}. API: <span className="break-all text-ink">{API_BASE_URL}</span>
        </p>
        {info.storage.recovered_files.length > 0 && (
          <p className="text-amber">Recovered unreadable files this session (originals kept as *.corrupt-*.json): {info.storage.recovered_files.join(", ")}</p>
        )}
      </Block>
      <ConfirmDialog
        open={confirm === "demo"}
        onClose={() => setConfirm(null)}
        title="Remove demo data?"
        body="Only records labelled demo are removed. Anything you created yourself stays."
        confirmLabel="Remove demo data"
        onConfirm={async () => {
          try {
            await api.clearDemo();
            notify("Demo data removed");
            bump();
            onChanged();
          } catch (e) {
            notify(errorMessage(e), "error");
          }
        }}
      />
      <ConfirmDialog
        open={confirm === "reset"}
        onClose={() => setConfirm(null)}
        title="Reset all local data?"
        body="Everything you have saved is cleared. A backup is kept in backend/data/user/backups."
        confirmLabel="Reset all data"
        typeToConfirm="RESET"
        onConfirm={async () => {
          try {
            await api.resetAll();
            notify("All local data reset");
            await reload();
            bump();
            onChanged();
          } catch (e) {
            notify(errorMessage(e), "error");
          }
        }}
      />
    </div>
  );
}

function HelpTab() {
  const items = [
    ["The app says it can't reach the backend", "Keep the backend window opened by run.bat running. Check http://127.0.0.1:8000/api/health in a browser. If port 8000 is busy, close the other program or set COURSECOMPASS_API_PORT before run.bat and update frontend/.env."],
    ["setup.bat says Python or Node is missing", "Install Python 3.12-3.14 (tick 'Add python.exe to PATH') and Node.js 22 LTS or newer, open a new terminal, then run setup.bat again."],
    ["Course images are blank", "Remote images come from Coursera's 2022 asset links and may be unavailable. Local artwork is used automatically; you can switch remote images off in Settings."],
    ["Recommendations look generic", "Set a career goal, topics and objectives in your preferences. Save, enrol or mark courses relevant to switch on the collaborative signal."],
    ["I want a clean demo", "Settings > Remove demo data, or Reset all local data (a backup is kept)."],
    ["I changed the CSV", "Run python -m app.preprocessing then python -m app.synthetic in the backend folder (with .venv activated), and restart run.bat."],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map(([q, a]) => (
        <section key={q} className="surface p-5">
          <h2 className="text-sm font-bold text-ink">{q}</h2>
          <p className="mt-2 text-sm text-muted">{a}</p>
        </section>
      ))}
    </div>
  );
}

export default function Insights() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "method") as TabId;
  const info = useAsync(() => api.systemInfo(), []);
  const icons: Record<TabId, ReactNode> = {
    method: <FlaskConical className="h-4 w-4" />,
    evaluation: <FlaskConical className="h-4 w-4" />,
    dataset: <Database className="h-4 w-4" />,
    settings: <Wrench className="h-4 w-4" />,
    help: <Wrench className="h-4 w-4" />,
  };
  return (
    <div>
      <PageHeader title="Insights & settings" description="How recommendations are calculated, how they were evaluated, where the data comes from, and local settings." />
      <div role="tablist" aria-label="Insights sections" className="mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors duration-fast ${
              tab === t.id ? "border-violet text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <span aria-hidden className="hidden sm:inline">{icons[t.id]}</span>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "evaluation" ? (
        <EvaluationTab />
      ) : tab === "help" ? (
        <HelpTab />
      ) : info.error ? (
        <ErrorState message={info.error.message} onRetry={() => void info.reload()} />
      ) : !info.data ? (
        <BlockSkeleton rows={4} />
      ) : tab === "method" ? (
        <MethodTab info={info.data} />
      ) : tab === "dataset" ? (
        <DatasetTab info={info.data} />
      ) : (
        <SettingsTab info={info.data} onChanged={() => void info.reload()} />
      )}
    </div>
  );
}
