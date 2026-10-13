"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Guided explains every figure in words; technical shows the same data densely, with exact values and extra panels.
 * `?view=tech` or `?view=guided` in the URL wins over the stored choice, so a link opens in the view it was shared in.
 */
export type ViewMode = "guided" | "technical";

// Per-viewer convenience only: without storage the page opens guided.
const KEY = "observatory.view";
const listeners = new Set<() => void>();

function fromUrl(): ViewMode | undefined {
  try {
    const v = new URLSearchParams(window.location.search).get("view");
    return v === "tech" || v === "technical" ? "technical" : v === "guided" ? "guided" : undefined;
  } catch { return undefined; }
}
function read(): ViewMode {
  const url = fromUrl();
  if (url) return url;
  try { return window.localStorage.getItem(KEY) === "technical" ? "technical" : "guided"; } catch { return "guided"; }
}

export function useViewMode() {
  const mode = useSyncExternalStore(
    (cb) => { listeners.add(cb); window.addEventListener("popstate", cb); return () => { listeners.delete(cb); window.removeEventListener("popstate", cb); }; },
    read,
    (): ViewMode => "guided",
  );
  const setMode = useCallback((next: ViewMode) => {
    try { window.localStorage.setItem(KEY, next); } catch { /* storage unavailable */ }
    // Keep a shared link's parameter in step with the choice, so a reload shows what was picked.
    if (fromUrl()) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("view", next === "technical" ? "tech" : "guided");
        window.history.replaceState(window.history.state, "", url);
      } catch { /* history unavailable */ }
    }
    listeners.forEach(l => l());
  }, []);
  return { mode, technical: mode === "technical", setMode };
}
