import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { FeedbackKind, StudentProfile, Taxonomy } from "../api/types";

/* ----------------------------------------------------------------- toasts */
export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toasts: Toast[];
  notify: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, kind, message }]);
      window.setTimeout(() => dismiss(id), kind === "error" ? 6500 : 3800);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/* ----------------------------------------------------------------- app data */
interface AppData {
  taxonomy: Taxonomy | null;
  profile: StudentProfile | null;
  loading: boolean;
  error: string | null;
  /** Increments after any mutation so pages can refetch derived data. */
  version: number;
  bump: () => void;
  reload: () => Promise<void>;
  setProfile: (p: StudentProfile) => void;
  careerLabel: (id: string | null | undefined) => string;
  skillLabel: (id: string) => string;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, p] = await Promise.all([api.taxonomy(), api.profile()]);
      setTaxonomy(t);
      setProfile(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const careerLabel = useCallback(
    (id: string | null | undefined) => taxonomy?.career_goals.find((c) => c.id === id)?.label ?? "No goal set",
    [taxonomy],
  );
  const skillLabel = useCallback((id: string) => taxonomy?.skills.find((s) => s.id === id)?.label ?? id, [taxonomy]);

  const value = useMemo(
    () => ({ taxonomy, profile, loading, error, version, bump, reload, setProfile, careerLabel, skillLabel }),
    [taxonomy, profile, loading, error, version, bump, reload, careerLabel, skillLabel],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used inside AppDataProvider");
  return ctx;
}

/* ----------------------------------------------------------------- local UI preferences */
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep in-memory value */
  }
}

interface UiPrefs {
  remoteImages: boolean;
  setRemoteImages: (v: boolean) => void;
  compareIds: string[];
  toggleCompare: (id: string) => "added" | "removed" | "full";
  removeCompare: (id: string) => void;
  clearCompare: () => void;
}

const UiPrefsContext = createContext<UiPrefs | null>(null);
export const MAX_COMPARE = 3;

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const [remoteImages, setRemote] = useState<boolean>(() => readStorage("cc.remoteImages", true));
  const [compareIds, setCompareIds] = useState<string[]>(() => readStorage<string[]>("cc.compare", []).slice(0, MAX_COMPARE));

  useEffect(() => writeStorage("cc.remoteImages", remoteImages), [remoteImages]);
  useEffect(() => writeStorage("cc.compare", compareIds), [compareIds]);

  const toggleCompare = useCallback(
    (id: string) => {
      if (compareIds.includes(id)) {
        setCompareIds((ids) => ids.filter((x) => x !== id));
        return "removed" as const;
      }
      if (compareIds.length >= MAX_COMPARE) return "full" as const;
      setCompareIds((ids) => [...ids, id]);
      return "added" as const;
    },
    [compareIds],
  );
  const value = useMemo(
    () => ({
      remoteImages,
      setRemoteImages: setRemote,
      compareIds,
      toggleCompare,
      removeCompare: (id: string) => setCompareIds((ids) => ids.filter((x) => x !== id)),
      clearCompare: () => setCompareIds([]),
    }),
    [remoteImages, compareIds, toggleCompare],
  );
  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export function useUiPrefs(): UiPrefs {
  const ctx = useContext(UiPrefsContext);
  if (!ctx) throw new Error("useUiPrefs must be used inside UiPrefsProvider");
  return ctx;
}

/* ----------------------------------------------------------------- course actions */
export function useCourseActions() {
  const { notify } = useToast();
  const { bump } = useAppData();
  const { toggleCompare } = useUiPrefs();

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success: string): Promise<T | null> => {
      try {
        const result = await fn();
        notify(success, "success");
        bump();
        return result;
      } catch (e) {
        notify(errorMessage(e), "error");
        return null;
      }
    },
    [notify, bump],
  );

  return {
    save: (id: string) => run(() => api.addWishlist(id), "Saved to your wishlist"),
    unsave: (id: string) => run(() => api.removeWishlist(id), "Removed from your wishlist"),
    enroll: (id: string, total?: number | null, target?: string | null) =>
      run(() => api.enroll(id, total, target), "Added to My Learning"),
    feedback: (id: string, kind: FeedbackKind) =>
      run(
        () => api.sendFeedback(id, kind),
        kind === "relevant"
          ? "Marked relevant. Similar courses will rank higher."
          : kind === "irrelevant"
            ? "Marked not relevant. It won't be recommended again."
            : "Marked as previously studied",
      ),
    rate: (id: string, rating: number) => run(() => api.sendFeedback(id, null, rating), `Rated ${rating} out of 5`),
    clearFeedback: (id: string) => run(() => api.clearFeedback(id), "Feedback cleared"),
    compare: (id: string) => {
      const outcome = toggleCompare(id);
      if (outcome === "full") notify(`You can compare up to ${MAX_COMPARE} courses. Remove one first.`, "info");
      else notify(outcome === "added" ? "Added to comparison" : "Removed from comparison", "info");
      return outcome;
    },
  };
}
