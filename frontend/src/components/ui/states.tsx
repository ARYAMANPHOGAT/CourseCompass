import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, RotateCcw, X } from "lucide-react";
import { useToast } from "../../hooks/AppContext";
import { Button, Skeleton } from "./primitives";

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-slate text-violet-bright">{icon}</div>}
      <h3 className="font-display text-lg font-medium">{title}</h3>
      {body && <p className="max-w-prose text-sm text-muted">{body}</p>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-rose/40 bg-rose/5 p-5 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0 text-rose" aria-hidden />
      <p className="flex-1 text-sm text-ink">{message}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry} icon={<RotateCcw className="h-3.5 w-3.5" />}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading courses">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface overflow-hidden">
          <Skeleton className="h-36 rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

const TOAST_ICON = {
  success: <CheckCircle2 className="h-4 w-4 text-mint" aria-hidden />,
  error: <AlertTriangle className="h-4 w-4 text-rose" aria-hidden />,
  info: <Info className="h-4 w-4 text-cyan" aria-hidden />,
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            className="glass pointer-events-auto flex items-start gap-3 rounded-md px-4 py-3 text-sm shadow-lift"
          >
            {TOAST_ICON[t.kind]}
            <span className="flex-1 text-ink">{t.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-faint hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
