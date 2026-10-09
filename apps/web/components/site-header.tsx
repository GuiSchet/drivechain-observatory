"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";
import { Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { useStreamState } from "@/components/providers";
import { useStatus } from "@/lib/live";
import { timeAgo } from "@/lib/explain";
import { useNow } from "@/components/live/basics";
import { networkLabel } from "@/lib/network";

const nav: [string, string][] = [["/", "Start"], ["/learn", "Learn"], ["/sidechains", "Sidechains"], ["/live", "Live"], ["/glossary", "Glossary"], ["/about", "About"]];

export function SiteHeader() {
  const path = usePathname(), stream = useStreamState(), status = useStatus(), now = useNow(), tip = useId();
  const block = status.data?.latest_observed_block;
  const active = (href: string) => href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  const state = status.isError ? "The Observatory API is unreachable; retrying." : !status.data ? "Waiting for data." :
    `Network: ${networkLabel(status.data.meta.network_id)}. Sync: ${status.data.sync_mode.replaceAll("_", " ")}. Source ${status.data.source_reachable ? "reachable" : "unavailable or stale"}. Live updates: ${stream}.`;
  return <header className="site-top">
    <div className="site-top-inner">
      <Link className="brand" href="/" aria-label="Drivechain Observatory, home"><Logo size={34}/><span>Drivechain <strong>Observatory</strong></span></Link>
      <nav className="main-nav" aria-label="Primary navigation">{nav.map(([href, title]) =>
        <Link key={href} href={href} className={active(href) ? "active" : ""} aria-current={active(href) ? "page" : undefined}>{title}</Link>)}</nav>
      <div className="header-search"><form action="/search" role="search"><Search size={15} aria-hidden="true"/><input name="q" aria-label="Search blocks, transactions or sidechains" placeholder="Block, txid or sidechain" required/></form></div>
      <span className={`live-pill ${stream}`} tabIndex={0} aria-describedby={tip} role="status">
        <span className="status-dot"/>{block ? <span>{networkLabel(status.data?.meta.network_id)} · block <strong>{block.height.toLocaleString("en-US")}</strong> · {timeAgo(block.observed_at, now)}</span> : <span>{status.isError ? "API unavailable" : "Connecting…"}</span>}
        <span role="tooltip" id={tip} className="term-tip">{state}</span>
      </span>
    </div>
  </header>;
}
