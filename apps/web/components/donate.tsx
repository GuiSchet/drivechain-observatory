"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** A value shown as code with a copy button, e.g. an address or a username. */
export function CopyText({ value, label, className = "donate-address" }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return <div className={className}>
    <code>{value}</code>
    <button onClick={async () => { try { await navigator.clipboard.writeText(value); setState("copied"); } catch { setState("failed"); } }}>
      {state === "copied" ? <><Check size={15}/> Copied</> : <><Copy size={15}/> {label}</>}
    </button>
    {state === "failed" && <small role="status">Copy is unavailable here; select the text instead.</small>}
  </div>;
}
