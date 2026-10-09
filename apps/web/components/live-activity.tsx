"use client";
import Link from "next/link";
import { ActivityFeed } from "@/components/live/activity";
import { BlockHeartbeat } from "@/components/live/basics";

const filters: [string | undefined, string][] = [[undefined, "Everything"], ["deposit", "Deposits"], ["bundle", "Withdrawal votes"], ["bundle_outcome", "Withdrawal events"], ["ctip", "Treasury readings"], ["bmm_commitment", "Merged mining"], ["instance", "Sidechains"]];

export function LiveActivity({ kind }: { kind?: string }) {
  const known = filters.some(([k]) => k === kind) ? kind : undefined;
  return <main className="page-shell">
    <div className="eyebrow">LIVE ON BETANET</div><h1>What is happening now</h1>
    <p className="lede">Every drivechain event the monitor records, newest first, in plain words. Each one links to the lesson that explains it and to its proof. Looking for something specific? <Link className="text-link" href="/search">Search a block, transaction or sidechain</Link>.</p>
    <BlockHeartbeat/>
    <nav className="filter-chips" aria-label="Filter activity">{filters.map(([k, label]) =>
      <Link key={label} href={k ? `/live?kind=${k}` : "/live"} className={k === known ? "active" : ""} aria-current={k === known ? "page" : undefined}>{label}</Link>)}</nav>
    <ActivityFeed key={known ?? "all"} kind={known} limit={25} paged/>
  </main>;
}
