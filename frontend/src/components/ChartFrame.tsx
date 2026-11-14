import { useLayoutEffect, useRef, useState, type ReactElement } from "react";

/**
 * Measures its own box and renders the chart at that exact pixel size.
 * More predictable than relying on a chart library's responsive container:
 * the chart re-renders on every resize and never draws at a stale size.
 */
export function ChartFrame({ height, children }: { height: number; children: (size: { width: number; height: number }) => ReactElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ height }} className="w-full">
      {width > 0 ? children({ width, height }) : null}
    </div>
  );
}
