"use client";
import { BookOpen, Table2 } from "lucide-react";
import { useViewMode } from "@/lib/view-mode";

/** Switches every page that reads `useViewMode` between the guided and the technical view. */
export function ViewToggle() {
  const { mode, setMode } = useViewMode();
  return <div className="view-toggle" role="group" aria-label="Level of detail">
    <button type="button" aria-pressed={mode === "guided"} onClick={() => setMode("guided")}><BookOpen size={14} aria-hidden="true"/> Guided</button>
    <button type="button" aria-pressed={mode === "technical"} onClick={() => setMode("technical")}><Table2 size={14} aria-hidden="true"/> Technical</button>
  </div>;
}

/** A page title row with the view switch on the right. */
export function PageHead({ eyebrow, children }: { eyebrow: string; children?: React.ReactNode }) {
  return <div className="page-head"><div className="eyebrow">{eyebrow}</div><ViewToggle/>{children}</div>;
}
