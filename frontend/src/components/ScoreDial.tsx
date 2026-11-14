import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

/**
 * The CourseCompass match dial: a compass bezel whose arc fills with the
 * preference-match score and whose needle points at it. Used everywhere a
 * match score appears so the score always reads the same way.
 */
export function ScoreDial({ value, size = 64, label = "match" }: { value: number | null | undefined; size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  const ticks = Array.from({ length: 24 });
  const angle = v == null ? 0 : (v / 100) * 360;
  const big = size >= 80;
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={v == null ? "No match score yet" : `Match score ${Math.round(v)} out of 100`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--cc-violet))" />
            <stop offset="100%" stopColor="rgb(var(--cc-cyan))" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="47" fill="rgb(var(--cc-abyss))" stroke="rgb(var(--cc-line))" strokeWidth="1" />
        {ticks.map((_, i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const major = i % 6 === 0;
          const r1 = major ? 30 : 32;
          return (
            <line
              key={i}
              x1={50 + Math.sin(a) * r1}
              y1={50 - Math.cos(a) * r1}
              x2={50 + Math.sin(a) * 35}
              y2={50 - Math.cos(a) * 35}
              stroke={major ? "rgb(var(--cc-faint))" : "rgb(var(--cc-line-strong))"}
              strokeWidth={major ? 1.6 : 1}
            />
          );
        })}
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--cc-graphite))" strokeWidth="5" />
        {v != null && (
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#g${id})`}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={c}
            transform="rotate(-90 50 50)"
            initial={reduce ? false : { strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - v / 100) }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          />
        )}
        {v != null && big && (
          <g transform={`rotate(${angle} 50 50)`} style={{ transition: reduce ? undefined : "transform 0.9s cubic-bezier(0.2,0.8,0.2,1)" }}>
            <path d="M50 1.5 L54 9 L46 9 Z" fill="rgb(var(--cc-cyan))" />
          </g>
        )}
      </svg>
      <div className="relative flex flex-col items-center leading-none">
        <span className="num font-display font-semibold text-ink" style={{ fontSize: Math.round(size * (v != null && v >= 100 ? 0.22 : 0.28)) }}>
          {v == null ? "-" : Math.round(v)}
        </span>
        {size >= 56 && <span className={`mt-0.5 text-faint ${big ? "text-xs" : "text-[10px]"}`}>{label}</span>}
      </div>
    </div>
  );
}
