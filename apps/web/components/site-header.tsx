"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { Logo } from "@/components/logo";
import { useNetwork, useStreamState } from "@/components/providers";
import { useHealth } from "@/lib/health";
import { timeAgo } from "@/lib/explain";
import { useNow } from "@/components/live/basics";
import { isNetworkRecordPath, networkLabel, networks, rememberNetwork } from "@/lib/network";

const nav: [string, string][] = [["/", "Start"], ["/learn", "Learn"], ["/sidechains", "Sidechains"], ["/live", "Live"], ["/glossary", "Glossary"], ["/about", "About"]];

/** Switching reloads the page, so every query, stream and link reads the new network's API from the start. */
function switchNetwork(id: string) {
  rememberNetwork(id);
  // Reloading a record page would send the reader back to the record's network.
  if (isNetworkRecordPath(window.location.pathname)) return window.location.assign("/");
  const url = new URL(window.location.href);
  url.searchParams.delete("network");
  window.location.assign(url.pathname + url.search + url.hash);
}

function NetworkPicker() {
  const network = useNetwork();
  if (networks.length < 2) return null;
  return <select className="network-picker" aria-label="Network" value={network.id} onChange={e => switchNetwork(e.target.value)}>
    {networks.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
  </select>;
}

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
      <NetworkPicker/>
      <span className={`live-pill health-${level}`} tabIndex={0} aria-describedby={tip} role="status">
        <span className="status-dot"/>{level !== "offline" && block ? <span className="pill-text">{prefix}<span className="pill-network">{networkLabel(status?.meta.network_id)} · </span>block <strong>{block.height.toLocaleString("en-US")}</strong> · {timeAgo(block.observed_at, now)}</span> : <span>{level === "offline" ? "API unavailable" : "Connecting…"}</span>}
        <span role="tooltip" id={tip} className="term-tip">{state}</span>
      </span>
    </div>
  </header>;
}
