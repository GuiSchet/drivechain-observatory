"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { n } from "@/lib/live";

export type Reading = { x: number; y: number; label: ReactNode; href?: string };

const H = 200, PAD = { top: 14, right: 16, bottom: 30, left: 64 };

/**
 * Separate readings plotted against L1 height. Dots are the readings; the faint line only joins
 * them for the eye and is not a reading. Shaded bands are heights the monitor did not observe.
 * A reference line (such as a vote threshold) is optional.
 */
export function ReadingsChart({ points, gaps = [], reference, yFormat, label, zero = true, note }: {
  points: Reading[]; gaps?: [number, number][]; reference?: { y: number; label: string }; yFormat: (y: number) => string; label: string;
  /** Start the value axis at zero; without it the axis spans only the readings. */
  zero?: boolean; note?: ReactNode;
}) {
  const [hover, setHover] = useState<number>();
  // Drawn at the container's real width so text keeps its size on a phone.
  const box = useRef<HTMLDivElement>(null), [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [points.length > 0]);
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const x0 = sorted[0].x, x1 = Math.max(sorted[sorted.length - 1].x, x0 + 1);
  const ys = sorted.map(p => p.y).concat(reference ? [reference.y] : []);
  const yMax = Math.max(...ys), yMin = zero ? Math.min(0, ...ys) : Math.min(...ys), ySpan = Math.max(1, yMax - yMin);
  const sx = (x: number) => PAD.left + ((x - x0) / (x1 - x0)) * (W - PAD.left - PAD.right);
  const sy = (y: number) => H - PAD.bottom - ((y - yMin) / ySpan) * (H - PAD.top - PAD.bottom);
  const ticks = [yMin, yMin + ySpan / 2, yMax];
  const path = sorted.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const shown = hover != null ? sorted[hover] : undefined;
  return <figure className="readings-chart">
    <div className="readings-plot" ref={box} onMouseLeave={() => setHover(undefined)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
        {gaps.filter(([a, b]) => b > a && b >= x0 && a <= x1).map(([a, b], i) =>
          <rect key={i} className="rc-gap" x={sx(Math.max(a, x0))} y={PAD.top} width={Math.max(2, sx(Math.min(b, x1)) - sx(Math.max(a, x0)))} height={H - PAD.top - PAD.bottom}/>)}
        {ticks.map((t, i) => <g key={i}><line className="rc-grid" x1={PAD.left} x2={W - PAD.right} y1={sy(t)} y2={sy(t)}/><text className="rc-tick" x={PAD.left - 8} y={sy(t) + 4} textAnchor="end">{yFormat(t)}</text></g>)}
        {reference && <g><line className="rc-reference" x1={PAD.left} x2={W - PAD.right} y1={sy(reference.y)} y2={sy(reference.y)}/><text className="rc-tick" x={W - PAD.right} y={sy(reference.y) - 6} textAnchor="end">{reference.label}</text></g>}
        {sorted.length > 1 || sorted[0].x !== x0 ? <>
          <text className="rc-tick" x={PAD.left} y={H - 8}>block {n(x0)}</text>
          <text className="rc-tick" x={W - PAD.right} y={H - 8} textAnchor="end">block {n(sorted[sorted.length - 1].x)}</text>
        </> : <text className="rc-tick" x={PAD.left} y={H - 8}>block {n(x0)} · only one reading so far</text>}
        {sorted.length > 1 && <path className="rc-join" d={path}/>}
        {sorted.map((p, i) => <g key={i} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${yFormat(p.y)} at block ${n(p.x)}`}>
          <circle className="rc-hit" cx={sx(p.x)} cy={sy(p.y)} r={12}/>
          <circle className={`rc-dot ${hover === i ? "active" : ""}`} cx={sx(p.x)} cy={sy(p.y)} r={hover === i ? 6 : 4.5}/>
        </g>)}
      </svg>
      {shown && <div className={`rc-tooltip ${sx(shown.x) < W * 0.25 ? "start" : sx(shown.x) > W * 0.75 ? "end" : ""}`} style={{ left: `${(sx(shown.x) / W) * 100}%`, top: `${(sy(shown.y) / H) * 100}%` }} role="status">
        {shown.label}{shown.href && <> · <Link href={shown.href}>proof</Link></>}
      </div>}
    </div>
    <figcaption>{note ? <>{note} </> : null}Each dot is one reading, placed at the L1 tip it was first taken at. The line only joins readings; it is not a reading itself.{gaps.some(([a, b]) => b > a) ? " Shaded bands are heights the monitor did not observe." : ""}</figcaption>
  </figure>;
}
