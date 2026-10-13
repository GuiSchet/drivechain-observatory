"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { n } from "@/lib/live";

/** One value per L1 block; `y: null` is a block with no value (unobserved, or nothing to count). */
export type BlockPoint = { x: number; y: number | null; label: ReactNode; href?: string; tone?: "good" | "bad" | "muted" };

const H = 180, PAD = { top: 14, right: 16, bottom: 30, left: 64 };

/**
 * Values per L1 block. `bars` draws one bar per block; `step` holds each value until the next one, for a balance
 * that changes only at certain blocks. Hover or focus a block to read it.
 */
export function BlockChart({ points, mode = "bars", yFormat, label, reference, note, zero = true }: {
  points: BlockPoint[]; mode?: "bars" | "step"; yFormat: (y: number) => string; label: string;
  reference?: { y: number; label: string }; note?: ReactNode; zero?: boolean;
}) {
  const [hover, setHover] = useState<number>();
  const box = useRef<HTMLDivElement>(null), [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [points.length > 0]);
  const sorted = [...points].sort((a, b) => a.x - b.x), valued = sorted.filter(p => p.y != null) as (BlockPoint & { y: number })[];
  if (!valued.length) return null;
  const x0 = sorted[0].x, x1 = Math.max(sorted[sorted.length - 1].x, x0 + 1);
  const ys = valued.map(p => p.y).concat(reference ? [reference.y] : []);
  const yMax = Math.max(...ys), yMin = zero ? Math.min(0, ...ys) : Math.min(...ys), ySpan = yMax - yMin || 1;
  const plotW = W - PAD.left - PAD.right;
  // Bars sit in equal slots, one per block; steps use the same horizontal scale.
  const slot = plotW / (x1 - x0 + 1);
  const sx = (x: number) => PAD.left + (x - x0) * slot;
  const sy = (y: number) => H - PAD.bottom - ((y - yMin) / ySpan) * (H - PAD.top - PAD.bottom);
  const ticks = [yMin, yMin + ySpan / 2, yMax];
  const step = valued.map((p, i) => `${i ? `H${sx(p.x).toFixed(1)}V` : `M${sx(p.x).toFixed(1)},`}${sy(p.y).toFixed(1)}`).join("") + `H${(PAD.left + plotW).toFixed(1)}`;
  const shown = hover != null ? sorted[hover] : undefined;
  const hoverX = shown ? sx(shown.x) + (mode === "bars" ? slot / 2 : 0) : 0;
  return <figure className="readings-chart block-chart">
    <div className="readings-plot" ref={box} onMouseLeave={() => setHover(undefined)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        {ticks.map((t, i) => <g key={i}><line className="rc-grid" x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)}/><text className="rc-tick" x={PAD.left - 8} y={sy(t) + 4} textAnchor="end">{yFormat(t)}</text></g>)}
        {reference && <g><line className="rc-reference" x1={PAD.left} x2={W - PAD.right} y1={sy(reference.y)} y2={sy(reference.y)}/><text className="rc-tick" x={W - PAD.right} y={sy(reference.y) - 6} textAnchor="end">{reference.label}</text></g>}
        <text className="rc-tick" x={PAD.left} y={H - 8}>block {n(x0)}</text>
        <text className="rc-tick" x={W - PAD.right} y={H - 8} textAnchor="end">block {n(sorted[sorted.length - 1].x)}</text>
        {mode === "step" && <path className="bc-step" d={step}/>}
        {sorted.map((p, i) => {
          const x = sx(p.x), active = hover === i;
          return <g key={p.x} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={p.y == null ? -1 : 0} aria-label={p.y == null ? undefined : `${yFormat(p.y)} at block ${n(p.x)}`}>
            <rect className="bc-hit" x={x} y={PAD.top} width={Math.max(slot, 2)} height={H - PAD.top - PAD.bottom}/>
            {mode === "bars" && p.y != null && <rect className={`bc-bar ${p.tone ?? ""} ${active ? "active" : ""}`} x={x + Math.min(1, slot * 0.15)} width={Math.max(1, slot - Math.min(2, slot * 0.3))}
              y={Math.min(sy(p.y), sy(Math.max(yMin, 0)))} height={Math.max(1, Math.abs(sy(Math.max(yMin, 0)) - sy(p.y)))}/>}
            {mode === "step" && p.y != null && <circle className={`rc-dot ${active ? "active" : ""}`} cx={x} cy={sy(p.y)} r={active ? 5 : 3.5}/>}
          </g>;
        })}
        {shown && <line className="bc-cursor" x1={hoverX} x2={hoverX} y1={PAD.top} y2={H - PAD.bottom}/>}
      </svg>
      {shown && <div className={`rc-tooltip ${hoverX < W * 0.25 ? "start" : hoverX > W * 0.75 ? "end" : ""}`} style={{ left: `${(hoverX / W) * 100}%`, top: `${((shown.y != null ? sy(shown.y) : H / 2) / H) * 100}%` }} role="status">
        {shown.label}{shown.href && <> · <Link href={shown.href}>evidence</Link></>}
      </div>}
    </div>
    {note && <figcaption>{note}</figcaption>}
  </figure>;
}
