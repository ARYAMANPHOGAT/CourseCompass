import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import type { Budget, DifficultyPref, DurationPref, Level, ProfileUpdate } from "../api/types";
import { PageHeader } from "../components/Layout";
import { ConfirmDialog } from "../components/ui/Dialog";
import { Button, Chip, Segmented } from "../components/ui/primitives";
import { BlockSkeleton } from "../components/ui/states";
import { errorMessage, useAppData, useToast } from "../hooks/AppContext";
import { DURATION_HINT } from "../lib/format";

const STEPS = [
  { id: "goal", title: "Your goal", hint: "Career direction and what you want to learn" },
  { id: "skills", title: "Skills and topics", hint: "What you know and what interests you" },
  { id: "prefs", title: "Learning preferences", hint: "Difficulty, time, budget and language" },
] as const;

export default function Profile() {
  const { profile, taxonomy, setProfile, bump } = useAppData();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileUpdate | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (profile && !form) {
      const { id: _id, updated_at: _u, ...rest } = profile;
      void _id;
      void _u;
      setForm({ ...rest });
    }
  }, [profile, form]);

  const skillsByGroup = useMemo(() => {
    const groups: Record<string, { label: string; skills: { id: string; label: string }[] }> = {};
    for (const s of taxonomy?.skills ?? []) {
      groups[s.group] ??= { label: s.group_label, skills: [] };
      groups[s.group].skills.push({ id: s.id, label: s.label });
    }
    return Object.entries(groups);
  }, [taxonomy]);

  if (!form || !taxonomy) return <BlockSkeleton rows={5} />;

  const update = <K extends keyof ProfileUpdate>(key: K, value: ProfileUpdate[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));
  const toggleIn = (key: "topics" | "existing_skills" | "languages", value: string) =>
    setForm((f) => {
      if (!f) return f;
      const list = f[key];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });

  const nameInvalid = !form.display_name.trim();
  const hoursInvalid = !(form.weekly_hours >= 0 && form.weekly_hours <= 80);

  const save = async () => {
    if (nameInvalid || hoursInvalid) {
      setError("Fix the highlighted fields before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.saveProfile({ ...form, display_name: form.display_name.trim(), onboarded: true });
      setProfile(saved);
      bump();
      notify("Preferences saved. Recommendations updated.");
      navigate("/for-you");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={profile?.onboarded ? "Your preferences" : "Set your direction"}
        description="Everything here feeds the recommender directly. You can change it any time; saved progress is never affected."
        actions={
          profile?.onboarded ? (
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>
              Reset preferences
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col" aria-label="Steps">
          {STEPS.map((s, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <li key={s.id} className="min-w-[180px] lg:min-w-0">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={active ? "step" : undefined}
                  className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors duration-fast ${
                    active ? "border-violet bg-violet/10" : "border-line bg-charcoal hover:border-line-strong"
                  }`}
                >
                  <span
                    className={`num flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                      active ? "border-violet bg-violet text-white" : done ? "border-cyan text-cyan" : "border-line text-muted"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{s.title}</span>
                    <span className="block text-xs text-muted">{s.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <form
          className="surface p-5 sm:p-7"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {step === 0 && (
            <div className="space-y-7">
              <label className="block max-w-sm">
                <span className="label">Display name</span>
                <input className="field" maxLength={60} value={form.display_name} onChange={(e) => update("display_name", e.target.value)} aria-invalid={nameInvalid} />
                {nameInvalid && <span className="mt-1 block text-xs text-rose">Enter a name.</span>}
              </label>
              <fieldset>
                <legend className="label">Career goal</legend>
                <p className="hint mb-3">Pick the direction closest to where you want to go. It shapes topic and skill matching.</p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Career goal">
                  {taxonomy.career_goals.map((g) => {
                    const active = form.career_goal === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => update("career_goal", active ? null : g.id)}
                        className={`rounded-md border p-3 text-left transition-colors duration-fast ${
                          active ? "border-violet bg-violet/10 shadow-glow-violet" : "border-line bg-abyss hover:border-line-strong"
                        }`}
                      >
                        <span className="block text-sm font-bold text-ink">{g.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted">{g.description}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="block">
                <span className="label">What do you want to be able to do?</span>
                <textarea
                  className="field min-h-[96px]"
                  maxLength={600}
                  value={form.objectives}
                  onChange={(e) => update("objectives", e.target.value)}
                  placeholder="For example: build dashboards in Tableau and write SQL for business questions"
                />
                <span className="hint mt-1 block">Used as free text by the content-based model. {600 - form.objectives.length} characters left.</span>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-7">
              <div>
                <span className="label">Your current skill level</span>
                <Segmented<Level>
                  label="Skill level"
                  value={form.skill_level}
                  onChange={(v) => update("skill_level", v)}
                  options={[
                    { value: "beginner", label: "Beginner" },
                    { value: "intermediate", label: "Intermediate" },
                    { value: "advanced", label: "Advanced" },
                  ]}
                />
                <p className="hint mt-2">Courses listed above this level get a caution note.</p>
              </div>
              <fieldset>
                <legend className="label">Skills you already have</legend>
                <p className="hint mb-3">Courses that teach skills new to you score higher on new-skill fit.</p>
                <div className="space-y-4">
                  {skillsByGroup.map(([gid, g]) => (
                    <div key={gid}>
                      <p className="mb-2 text-xs font-semibold text-muted">{g.label}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.skills.map((s) => (
                          <Chip key={s.id} selected={form.existing_skills.includes(s.id)} onClick={() => toggleIn("existing_skills", s.id)}>
                            {s.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Topics you want to explore</legend>
                <p className="hint mb-3">Course categories from the dataset. Courses in these topics score higher on goal alignment.</p>
                <div className="flex flex-wrap gap-1.5">
                  {taxonomy.categories.map((c) => (
                    <Chip key={c} selected={form.topics.includes(c)} onClick={() => toggleIn("topics", c)}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-7">
              <div>
                <span className="label">Preferred difficulty</span>
                <Segmented<DifficultyPref>
                  label="Preferred difficulty"
                  value={form.preferred_difficulty}
                  onChange={(v) => update("preferred_difficulty", v)}
                  options={[
                    { value: "any", label: "No preference" },
                    { value: "beginner", label: "Beginner" },
                    { value: "intermediate", label: "Intermediate" },
                    { value: "advanced", label: "Advanced" },
                  ]}
                />
              </div>
              <div className="max-w-md">
                <label className="label" htmlFor="hours">
                  Weekly study time: <span className="num text-violet-bright">{form.weekly_hours} hours</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="hours"
                    type="range"
                    min={0}
                    max={40}
                    step={0.5}
                    value={Math.min(40, form.weekly_hours)}
                    onChange={(e) => update("weekly_hours", Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    aria-label="Weekly hours"
                    className="field w-20"
                    type="number"
                    min={0}
                    max={80}
                    step={0.5}
                    value={form.weekly_hours}
                    onChange={(e) => update("weekly_hours", Number(e.target.value))}
                  />
                </div>
                {hoursInvalid && <span className="mt-1 block text-xs text-rose">Use 0 to 80 hours.</span>}
                <p className="hint mt-1">Used to estimate how many weeks an hour-based course will take.</p>
              </div>
              <div>
                <span className="label">Budget</span>
                <Segmented<Budget>
                  label="Budget"
                  value={form.budget}
                  onChange={(v) => update("budget", v)}
                  options={[
                    { value: "any", label: "Any price" },
                    { value: "free_only", label: "Free only" },
                  ]}
                />
                <p className="hint mt-2">Free-only scores courses the dataset lists as free highest; unlisted prices get partial credit.</p>
              </div>
              <div>
                <span className="label">Preferred course length</span>
                <Segmented<DurationPref>
                  label="Preferred course length"
                  value={form.preferred_duration}
                  onChange={(v) => update("preferred_duration", v)}
                  options={[
                    { value: "any", label: "No preference" },
                    ...(["short", "medium", "long", "extended"] as const).map((d) => ({
                      value: d,
                      label: d[0].toUpperCase() + d.slice(1),
                      hint: DURATION_HINT[d],
                    })),
                  ]}
                />
                {form.preferred_duration !== "any" && <p className="hint mt-2">{DURATION_HINT[form.preferred_duration]}</p>}
              </div>
              <fieldset>
                <legend className="label">Languages</legend>
                <p className="hint mb-3">Courses known to be in other languages are left out of recommendations. Leave all unselected to allow any.</p>
                <div className="flex flex-wrap gap-1.5">
                  {taxonomy.languages.map((l) => (
                    <Chip key={l} selected={form.languages.includes(l)} onClick={() => toggleIn("languages", l)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-6 text-sm text-rose">
              {error}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            <div className="flex gap-2">
              {step < STEPS.length - 1 && (
                <Button variant={profile?.onboarded ? "secondary" : "primary"} onClick={() => setStep((s) => s + 1)}>
                  Next: {STEPS[step + 1].title.toLowerCase()}
                </Button>
              )}
              {(step === STEPS.length - 1 || profile?.onboarded) && (
                <Button type="submit" variant="primary" loading={saving}>
                  Save preferences
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset preferences?"
        body="Your career goal, skills, topics and learning preferences return to defaults. Wishlist, enrolments and study history are kept."
        confirmLabel="Reset preferences"
        onConfirm={async () => {
          try {
            const p = await api.resetProfile();
            setProfile(p);
            const { id: _id, updated_at: _u, ...rest } = p;
            void _id;
            void _u;
            setForm({ ...rest });
            setStep(0);
            bump();
            notify("Preferences reset");
          } catch (e) {
            notify(errorMessage(e), "error");
          }
        }}
      />
    </div>
  );
}
