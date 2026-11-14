import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "cyan";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-violet text-white hover:bg-violet-deep hover:shadow-glow-violet border border-violet/80 disabled:hover:shadow-none",
  secondary: "bg-slate text-ink border border-line hover:border-line-strong hover:bg-graphite",
  ghost: "bg-transparent text-muted border border-transparent hover:text-ink hover:bg-slate",
  danger: "bg-rose/10 text-rose border border-rose/40 hover:bg-rose/20",
  cyan: "bg-cyan/10 text-cyan border border-cyan/40 hover:bg-cyan/15 hover:shadow-glow-cyan",
};
const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-base gap-2.5 rounded-md",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = ""): string {
  return `inline-flex select-none items-center justify-center whitespace-nowrap font-semibold no-underline transition-all duration-fast ease-out hover:no-underline disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${extra}`;
}

/** A router link that looks like a button (keeps link semantics; no button nested in an anchor). */
export function LinkButton({ variant = "secondary", size = "md", icon, className = "", children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className = "", children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  children,
  active = false,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors duration-fast ${
        active ? "border-violet/70 bg-violet/15 text-violet-bright" : "border-line bg-charcoal/80 text-muted hover:text-ink hover:border-line-strong"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  selected,
  onClick,
  className = "",
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  if (!onClick) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border border-line bg-slate/70 px-2.5 py-0.5 text-2xs text-muted ${className}`}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-fast ${
        selected
          ? "border-violet bg-violet/20 text-ink shadow-[inset_0_0_0_1px_rgb(var(--cc-violet)/0.4)]"
          : "border-line bg-charcoal text-muted hover:border-line-strong hover:text-ink"
      } ${className}`}
    >
      {children}
    </button>
  );
}

type Tone = "neutral" | "violet" | "cyan" | "mint" | "amber" | "rose";
const TONE: Record<Tone, string> = {
  neutral: "border-line bg-slate text-muted",
  violet: "border-violet/40 bg-violet/15 text-violet-bright",
  cyan: "border-cyan/40 bg-cyan/10 text-cyan",
  mint: "border-mint/40 bg-mint/10 text-mint",
  amber: "border-amber/40 bg-amber/10 text-amber",
  rose: "border-rose/40 bg-rose/10 text-rose",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-2xs font-semibold ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, label, tone = "violet", className = "" }: { value: number; label: string; tone?: "violet" | "cyan" | "mint"; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const fill = tone === "cyan" ? "bg-cyan" : tone === "mint" ? "bg-mint" : "bg-gradient-to-r from-violet to-cyan";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-graphite ${className}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${fill} transition-[width] duration-slow ease-out`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-md border border-line bg-abyss p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`rounded-sm font-semibold transition-colors duration-fast ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
              active ? "bg-violet text-white" : "text-muted hover:bg-slate hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="hint mt-0.5 block">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-fast ${checked ? "border-violet bg-violet" : "border-line bg-graphite"}`}
      >
        <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-transform duration-fast ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

export function StatTile({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="surface flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon}
        <span>{label}</span>
      </div>
      <div className="num font-display text-2xl font-semibold text-ink">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}
