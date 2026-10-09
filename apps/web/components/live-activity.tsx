"use client";
import Link from "next/link";
import { ActivityFeed } from "@/components/live/activity";
import { BlockTimeline } from "@/components/live/timeline";

type Filter = { label: string; kind?: string; withTreasury?: boolean; readings?: boolean };

// Block by block by default; one kind of event at a time, or the raw log of every reading, one click away.
const filters: Record<string, Filter> = {
  blocks: { label: "Block by block" },
  deposit: { label: "Deposits", kind: "deposit", withTreasury: true },
  withdrawals: { label: "Withdrawals", kind: "bundle,bundle_outcome" },
  ctip: { label: "Treasuries", kind: "ctip" },
  bmm_commitment: { label: "Merged mining", kind: "bmm_commitment" },
  sidechains: { label: "Sidechains", kind: "instance,proposal" },
  readings: { label: "Every reading", readings: true },
};
const notes: Record<string, string> = {
  deposit: "Every deposit, newest block first, with each treasury before and after when the monitor read it.",
  withdrawals: "Withdrawal votes and payouts. Consecutive vote readings of one withdrawal are shown as one row.",
  ctip: "Each time a treasury reading found a new value. A deposit or a payout replaces the treasury output.",
  bmm_commitment: "Merged-mining commitments, one row per L1 block.",
  sidechains: "Readings of which sidechains are active or proposed, each listed when it first appeared or changed.",
  readings: "Every reading the monitor took, by when it was last read. Unchanged values repeat here on purpose: each one is evidence that the value was confirmed again.",
};

export function LiveActivity({ kind }: { kind?: string }) {
  const key = kind && kind in filters ? kind : "blocks", f = filters[key];
  return <main className="page-shell">
    <div className="eyebrow">LIVE ON BETANET</div><h1>What is happening now</h1>
    <p className="lede">Betanet block by block, newest first. For each L1 block: what it contained, and what our readings found had changed while it was the newest block. Every line links to its proof. Looking for something specific? <Link className="text-link" href="/search">Search a block, transaction or sidechain</Link>.</p>
    <nav className="filter-chips" aria-label="Filter activity">{Object.entries(filters).map(([k, { label }]) =>
      <Link key={k} href={k === "blocks" ? "/live" : `/live?kind=${k}`} className={k === key ? "active" : ""} aria-current={k === key ? "page" : undefined}>{label}</Link>)}</nav>
    {key === "blocks" ? <BlockTimeline/> : <>
      <p className="live-note">{notes[key]}</p>
      <ActivityFeed key={key} kind={f.kind} withTreasury={f.withTreasury} changes={!f.readings} order={f.readings ? "observed" : "block"} limit={f.readings ? 25 : 60} paged/>
    </>}
  </main>;
}
