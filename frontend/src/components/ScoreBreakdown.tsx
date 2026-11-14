import type { RecommendationResult, ScoreComponent } from "../api/types";

/**
 * Categorical palette for score components, in fixed slot order. Validated with the
 * dataviz palette checker on the charcoal surface (#11111C): lightness band, chroma,
 * adjacent-pair CVD separation (worst dE 8.4) and normal-vision floor all pass.
 * Identity is never colour-alone: every segment is also labelled in the list below it.
 */
export const COMPONENT_COLOR: Record<string, string> = {
  content: "#8C5CFF",
  goal: "#D95926",
  skill_fit: "#199E70",
  difficulty: "#C98500",
  duration: "#D55181",
  budget: "#008300",
  quality: "#3987E5",
  collaborative: "#E66767",
};

/** Stacked bar: each segment is a component's contribution to the final score. */
export function ContributionBar({ components, height = 10 }: { components: ScoreComponent[]; height?: number }) {
  const parts = components.filter((c) => c.available && c.final_contribution > 0);
  const total = parts.reduce((s, c) => s + c.final_contribution, 0);
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-full bg-graphite" style={{ height }} aria-hidden>
        {parts.map((c) => (
          <div
            key={c.key}
            style={{ width: `${c.final_contribution * 100}%`, background: COMPONENT_COLOR[c.key], borderRight: "2px solid rgb(var(--cc-charcoal))" }}
            title={`${c.label}: +${Math.round(c.final_contribution * 100)}`}
          />
        ))}
      </div>
      <p className="sr-only">
        Score made of {parts.map((c) => `${c.label} ${Math.round(c.final_contribution * 100)} points`).join(", ")}; total {Math.round(total * 100)}.
      </p>
    </div>
  );
}

export function ScoreBreakdown({ result, showUnavailable = true }: { result: RecommendationResult; showUnavailable?: boolean }) {
  const available = result.components.filter((c) => c.available).sort((a, b) => b.final_contribution - a.final_contribution);
  const unavailable = result.components.filter((c) => !c.available);
  const lam = result.hybrid_weights.collaborative;
  return (
    <div className="space-y-4">
      <ContributionBar components={result.components} />
      <div className="text-xs text-muted">
        {lam > 0 ? (
          <>
            Final score = {Math.round((1 - lam) * 100)}% preference score ({Math.round((result.preference_score ?? 0) * 100)}) +{" "}
            {Math.round(lam * 100)}% collaborative signal ({Math.round((result.collaborative_score ?? 0) * 100)}).
          </>
        ) : (
          <>Final score = weighted average of the available preference components below.</>
        )}
      </div>
      <ul className="divide-y divide-line/70 rounded-md border border-line">
        {available.map((c) => (
          <li key={c.key} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-3 py-2.5">
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: COMPONENT_COLOR[c.key] }} aria-hidden />
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-ink">{c.label}</span>
                <span className="num text-xs text-faint">
                  score {Math.round((c.score ?? 0) * 100)} x weight {Math.round(c.effective_weight * 100)}%
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{c.detail}</p>
            </div>
            <span className="num text-sm font-semibold text-ink" title="Points added to the final score">
              +{(c.final_contribution * 100).toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
      {showUnavailable && unavailable.length > 0 && (
        <div className="text-xs text-faint">
          <span className="font-semibold text-muted">Not scored (left out of the average, not counted against the course): </span>
          {unavailable.map((c) => `${c.label} - ${c.detail.toLowerCase()}`).join("; ")}.
        </div>
      )}
    </div>
  );
}
