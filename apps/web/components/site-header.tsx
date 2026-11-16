"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { Logo } from "@/components/logo";
import { useNetwork, useStreamState } from "@/components/providers";
import { useHealth } from "@/lib/health";
import { timeAgo } from "@/lib/explain";
import { utc } from "@/lib/stats";
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

const tipsText: Record<string, string> = { matched: "same tip", different_tips: "different tips" };
const streamText: Record<string, string> = { connecting: "connecting", connected: "connected", reconnecting: "reconnecting" };

/** The pill's tooltip: what is wrong (if anything) first, then one short fact per line. */
function PillTip({ id, reasons, status, stream, now }: { id: string; reasons: string[]; status: ReturnType<typeof useHealth>["status"]; stream: string; now: number }) {
  const block = status?.latest_observed_block;
  return <span role="tooltip" id={id} className="term-tip">
    {reasons.length > 0 && <ul className="pill-tip-reasons">{reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    {status ? <dl className="pill-tip-facts">
      <dt>Network</dt><dd>{networkLabel(status.meta.network_id)}</dd>
      <dt>Latest block</dt><dd>{block ? <>#{block.height.toLocaleString("en-US")}<span className="muted">seen {timeAgo(block.observed_at, now)} · {utc(block.observed_at)}</span></> : "none seen yet"}</dd>
      <dt>Sync</dt><dd>{status.sync_mode.replaceAll("_", " ")}</dd>
      <dt>Sources</dt><dd>{status.source_reachable ? "reachable" : "unreachable or stale"}</dd>
      <dt>Node and enforcer</dt><dd>{tipsText[status.branch.joint_source_status ?? ""] ?? "unknown"}</dd>
      <dt>Live updates</dt><dd>{streamText[stream] ?? stream}</dd>
    </dl> : !reasons.length && "Waiting for data."}
  </span>;
}

export function SiteHeader() {
  const path = usePathname(), stream = useStreamState(), { level, reasons, status } = useHealth(), now = useNow(), tip = useId();
  const block = status?.latest_observed_block;
  const active = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  const prefix = level === "delayed" ? "Delayed · " : level === "degraded" ? "Check status · " : "";
  return <header className="site-top">
    <div className="site-top-inner">
      <Link className="brand" href="/" aria-label="Drivechain Observatory, home"><Logo size={34}/><span>Drivechain <strong>Observatory</strong></span></Link>
      <nav className="main-nav" aria-label="Primary navigation">{nav.map(([href, title]) =>
        <Link key={href} href={href} className={active(href) ? "active" : ""} aria-current={active(href) ? "page" : undefined}>{title}</Link>)}</nav>
      <NetworkPicker/>
      <span className={`live-pill health-${level}`} tabIndex={0} aria-describedby={tip} role="status">
        <span className="status-dot"/>{level !== "offline" && block ? <span className="pill-text">{prefix}<span className="pill-network">{networkLabel(status?.meta.network_id)} · </span>block <strong>{block.height.toLocaleString("en-US")}</strong> · {timeAgo(block.observed_at, now)}</span> : <span>{level === "offline" ? "API unavailable" : "Connecting…"}</span>}
        <PillTip id={tip} reasons={reasons} status={status} stream={stream} now={now}/>
      </span>
    </div>
  </header>;
}
