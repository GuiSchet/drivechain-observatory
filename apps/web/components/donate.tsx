"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyAddress({ address }: { address: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return <div className="donate-address">
    <code>{address}</code>
    <button onClick={async () => { try { await navigator.clipboard.writeText(address); setState("copied"); } catch { setState("failed"); } }}>
      {state === "copied" ? <><Check size={15}/> Copied</> : <><Copy size={15}/> Copy address</>}
    </button>
    {state === "failed" && <small role="status">Copy is unavailable here; select the address above instead.</small>}
  </div>;
}
