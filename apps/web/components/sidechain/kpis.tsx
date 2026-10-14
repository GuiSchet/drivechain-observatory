"use client";
import { useQuery } from "@tanstack/react-query";
import { getAuctions } from "@/lib/api";
import { object } from "@/lib/protocol";
import { formatCoins, formatSats, timeAgo } from "@/lib/explain";
import { bidsKnown, n, snapshotOf, useObservatory, type ActiveSidechain } from "@/lib/live";
import { percent } from "@/lib/stats";
import type { SidechainStats } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { Method, Stat } from "@/components/learn/primitives";
import { useNow } from "@/components/live/basics";

/** The sidechain's main figures at a glance, each with how it is measured. */
export function SidechainKpis({ sc, stats, failed = false, technical }: { sc: ActiveSidechain; stats?: SidechainStats; failed?: boolean; technical: boolean }) {
  const observatory = useObservatory(), unit = useUnit(), now = useNow(30_000);
  const auctions = useQuery({ queryKey: ["bmm"], queryFn: getAuctions, refetchInterval: 5_000 });
  const treasury = object(object(observatory.data?.state).treasury)[String(sc.slot)];
  const value = treasury ? object(treasury).value_sats : undefined;
  const ctipRead = snapshotOf(observatory.data, "ctip", sc.slot);
  const d = stats?.deposits, bmm = stats?.bmm, w144 = bmm?.windows.find(w => w.blocks === 144);
  // A failed request must not look like one still loading.
  const wait = failed ? "Unavailable" : "…";
  const bids = (auctions.data?.requests ?? []).filter(r => r.slot === sc.slot).map(r => BigInt(r.bid_sats));
  const topBid = bids.length ? bids.reduce((a, b) => a > b ? a : b).toString() : undefined;
  const pending = stats?.withdrawals.pending ?? [];
  const lead = [...pending].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
  const since = bmm?.since_activation?.blocks;
  return <div className="stat-grid kpi-grid">
    <Stat label="In its treasury" value={treasury === null ? "Nothing yet" : value ? formatCoins(value, !technical) : "Unknown"}
      hint={value ? <>{formatSats(value, unit)}{object(treasury).sequence_number != null ? ` · output #${String(object(treasury).sequence_number)}` : ""}</> : undefined}
      quality={ctipRead?.quality ?? (observatory.data ? null : undefined)}
      method={<Method source="The enforcer's reading of this sidechain's treasury output (CTIP)." limits="A reading at the chain tip; it is not taken at the same instant as the other figures here."/>}/>
    <Stat label="Deposits" value={d ? n(d.count) : wait}
      hint={d ? <>{formatCoins(d.total_sats, true)} in total{d.last_block_time ? <> · last one {timeAgo(d.last_block_time, now)}</> : null}{technical && d.median_sats ? <> · median {formatSats(d.median_sats, unit)}</> : null}</> : undefined}
      quality={d ? (d.count ? "observed" : null) : undefined}
      method={<Method source="Deposits (M5) recorded in L1 blocks on the selected chain." how="Each amount is the new treasury value minus the previous one." limits="Times are the miners' block timestamps."/>}/>
    <Stat label="Merged mining, last 144 blocks" value={w144 ? percent(w144.present, w144.covered, 0) : wait}
      hint={w144 ? <>{n(w144.present)} of {n(w144.covered)} observed blocks committed{bmm?.blocks_since_last_commit != null ? <> · last {bmm.blocks_since_last_commit === 0 ? "in the newest block" : `${n(bmm.blocks_since_last_commit)} blocks ago`}</> : null}{technical && bmm ? <> · streak {n(bmm.streak)}</> : null}</> : undefined}
      quality={w144 ? (w144.covered ? "observed" : null) : undefined}
      method={<Method source="BMM commitments (BIP301) the enforcer reported for each L1 block." how="Committing blocks divided by the blocks whose merged-mining data was observed." limits="Blocks without observed data are left out rather than counted as misses."/>}/>
    <Stat label="Open bid right now" value={topBid ? formatSats(topBid, unit) : auctions.data ? (bidsKnown(auctions.data) ? "None seen" : "Unknown") : "…"}
      hint={stats?.bids.median_sats ? <>median of {n(stats.bids.count)} bids seen: {formatSats(stats.bids.median_sats, unit)}</> : undefined}
      quality={auctions.data ? (auctions.data.state === "available" ? "tip_matched" : "unknown") : undefined}
      method={<Method source="The monitor's latest sample of open merged-mining bids (BMM requests)." limits="Only bids the monitor saw; a sidechain block can also be mined without an L1 bid."/>}/>
    <Stat label="Withdrawals in vote" value={stats ? n(pending.length) : wait}
      hint={lead ? <>{n(lead.votes)} of {n(lead.threshold != null ? lead.threshold + 1 : undefined)} votes ({percent(lead.votes, lead.threshold != null ? lead.threshold + 1 : undefined)}){lead.passes_at_rate === false ? " · at its pace it expires first" : lead.blocks_to_pass_at_rate != null ? ` · ~${n(lead.blocks_to_pass_at_rate)} blocks at its pace` : ""}</> : stats ? "none pending" : undefined}
      quality={lead ? lead.quality : undefined}
      method={<Method source="The enforcer's list of pending withdrawal bundles and their votes." how="Pace is the change in votes per block over about the last 144 blocks; without readings that old, votes divided by age." limits="Votes can rise or fall by one per block, so the pace is not a forecast."/>}/>
    <Stat label="Active since" value={sc.activationHeight != null ? `block ${n(sc.activationHeight)}` : "Unknown"}
      hint={since != null ? <>{n(since)} blocks ago{technical && stats ? ` · proposed in block ${n(sc.proposalHeight)}` : ""}</> : undefined}
      quality={sc.activationHeight != null ? snapshotOf(observatory.data, "active_sidechains")?.quality ?? null : undefined}/>
  </div>;
}

/** Links to each section of a sidechain's page; stays in view while reading. */
export function SectionNav({ sections }: { sections: [string, string][] }) {
  return <nav className="section-nav" aria-label="Sections of this page">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>;
}

