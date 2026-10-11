"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { Logo } from "@/components/logo";
import { useStreamState } from "@/components/providers";
import { useHealth } from "@/lib/health";
import { timeAgo } from "@/lib/explain";
import { useNow } from "@/components/live/basics";
import { networkLabel } from "@/lib/network";

const nav: [string, string][] = [["/", "Start"], ["/learn", "Learn"], ["/sidechains", "Sidechains"], ["/live", "Live"], ["/glossary", "Glossary"], ["/about", "About"]];

export function SiteHeader() {
  const path = usePathname(), stream = useStreamState(), { level, reasons, status } = useHealth(), now = useNow(), tip = useId();
  const block = status?.latest_observed_block;
  const active = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  const details = !status ? "" : `Network: ${networkLabel(status.meta.network_id)}. Sync: ${status.sync_mode.replaceAll("_", " ")}. Sources ${status.source_reachable ? "reachable" : "unreachable or stale"}. Node and enforcer tips: ${status.branch.joint_source_status || "unknown"}. Live updates: ${stream}.`;
  const state = [...reasons, details].filter(Boolean).join(" ") || "Waiting for data.";
  const prefix = level === "delayed" ? "Delayed · " : level === "degraded" ? "Check status · " : "";
  return <header className="site-top">
    <div className="site-top-inner">
      <Link className="brand" href="/" aria-label="Drivechain Observatory, home"><Logo size={34}/><span>Drivechain <strong>Observatory</strong></span></Link>
      <nav className="main-nav" aria-label="Primary navigation">{nav.map(([href, title]) =>
        <Link key={href} href={href} className={active(href) ? "active" : ""} aria-current={active(href) ? "page" : undefined}>{title}</Link>)}</nav>
      <span className={`live-pill health-${level}`} tabIndex={0} aria-describedby={tip} role="status">
        <span className="status-dot"/>{level !== "offline" && block ? <span>{prefix}{networkLabel(status?.meta.network_id)} · block <strong>{block.height.toLocaleString("en-US")}</strong> · {timeAgo(block.observed_at, now)}</span> : <span>{level === "offline" ? "API unavailable" : "Connecting…"}</span>}
        <span role="tooltip" id={tip} className="term-tip">{state}</span>
      </span>
    </div>
  </header>;
}
