"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts its children once they come within `margin` of the viewport, and keeps them mounted.
 * Everything inside (every query hook, at any depth) waits until then, so a long page only asks
 * the API for what the reader is about to see. The placeholder reserves height so the page does
 * not jump much when the content arrives; anchors stay on the parent section.
 */
export function NearViewport({ children, minHeight = 240, margin = "600px" }: { children: ReactNode; minHeight?: number; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: `${margin} 0px` });
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, margin]);
  if (near) return <>{children}</>;
  return <div ref={ref} className="near-viewport" style={{ minHeight }} aria-busy="true"><p className="live-empty" role="status">Loading…</p></div>;
}
