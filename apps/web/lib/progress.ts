"use client";
import { useCallback, useSyncExternalStore } from "react";

// Per-viewer convenience only: the site works the same when storage is blocked.
const KEY = "observatory.learn.completed";
const listeners = new Set<() => void>();

function read(): string {
  try { return window.localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; }
}
function parse(raw: string): string[] {
  try { const v: unknown = JSON.parse(raw); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
}

export function useProgress() {
  const raw = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    read,
    () => "[]",
  );
  const completed = parse(raw);
  const setDone = useCallback((slug: string, done: boolean) => {
    const next = new Set(parse(read()));
    if (done) next.add(slug); else next.delete(slug);
    try { window.localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
    listeners.forEach(l => l());
  }, []);
  return { completed, isDone: (slug: string) => completed.includes(slug), setDone };
}
