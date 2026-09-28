"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { getStatus } from "@/lib/api";
import { useStreamState } from "@/components/providers";

export function SiteHeader() {
  const path = usePathname();
  const stream = useStreamState();
  const status = useQuery({ queryKey: ["status"], queryFn: getStatus, refetchInterval: 5_000 });
  const mode = status.isError ? "API unavailable" : status.data?.sync_mode.replaceAll("_", " ") ?? "awaiting data";
  return <>
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark"><Radio size={18}/></span><span>Drivechain - <strong>Observatory</strong></span></Link>
      <nav aria-label="Primary navigation">
        {[["/", "Live"], ["/bmm", "BMM auctions"], ["/sidechains", "Sidechains"], ["/pegs", "Pegs"], ["/blocks", "Blocks"], ["/explorer", "Explorer"], ["/learn", "Learn"], ["/about/data", "Data"]].map(([href, title]) =>
          <Link key={href} href={href} className={path === href ? "active" : ""} aria-current={path === href ? "page" : undefined}>{title}</Link>)}
      </nav>
      <div className="network-state"><span className="network-label">{status.data?.meta.network_id ?? "Betanet"}</span>
        <span className={"stream-state " + stream}><span className="status-dot"/>Stream {stream}</span></div>
    </header>
    <div className="sync-strip" role="status"><span>Sync: {mode}</span><span>Source: {status.isError || !status.data ? "unknown" : status.data.source_reachable ? "reachable" : "unavailable or stale"}</span>
      {status.data?.last_source_contact_at && <span>Last contact: <time dateTime={status.data.last_source_contact_at}>{status.data.last_source_contact_at}</time></span>}</div>
  </>;
}
