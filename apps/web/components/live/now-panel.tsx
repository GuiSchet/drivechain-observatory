"use client";
import Link from "next/link";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { object } from "@/lib/protocol";
import { sidechainLabel } from "@/lib/explain";
import { n, useObservatory, useSidechainNames } from "@/lib/live";
import { percent } from "@/lib/stats";
import type { SidechainStats } from "@/lib/types";
import { LivePanel, Method } from "@/components/learn/primitives";
import { BmmBids, BmmCommitments } from "./bmm";
import { DaySummary } from "./summary";

/** Pending withdrawals of every sidechain, each against its threshold and the pace of its votes. */
function PendingWithdrawals() {
  const observatory = useObservatory(), names = useSidechainNames();
  const slots = [...new Set(Object.keys(object(object(observatory.data?.state).bundles)).map(k => Number(k.split(":")[0])))].filter(Number.isInteger).sort((a, b) => a - b);
  const stats = useQueries({ queries: slots.map(slot => ({ queryKey: ["protocol", "stats", slot, 144], queryFn: () => getJson<SidechainStats>(`/api/v1/sidechains/${slot}/stats?window_blocks=144`) })) });
  const rows = stats.flatMap((q, i) => (q.data?.withdrawals.pending ?? []).map(p => ({ slot: slots[i], p })));
  return <LivePanel title="Withdrawals in vote" status={{ pending: observatory.isPending || stats.some(q => q.isPending), error: stats.some(q => q.isError) && !rows.length, empty: !rows.length, emptyText: "No withdrawal bundle is being voted on right now." }}>
    <ul className="pending-list">{rows.map(({ slot, p }) => {
      const need = p.threshold != null ? p.threshold + 1 : undefined, rate = p.rate_recent ?? p.rate_since_proposal;
      return <li key={p.m6id_txid_order ?? slot}>
        <Link href={`/sidechains/${slot}#withdrawals`}>{sidechainLabel(slot, names)}</Link>
        <span className="pending-figures"><strong>{n(p.votes)}</strong> / {n(need)} votes ({percent(p.votes, need)}) · {n(p.blocks_left)} blocks left</span>
        <span className="meter"><span style={{ width: `${Math.min(100, ((p.votes ?? 0) / (need ?? 1)) * 100)}%` }}/></span>
        <small>{p.can_still_pass === false ? "Cannot reach the threshold before it expires."
          : rate != null && rate > 0 ? <>Pace {rate.toFixed(3)} votes/block: {p.passes_at_rate ? `passes in ~${n(p.blocks_to_pass_at_rate)} blocks` : `would need ~${n(p.blocks_to_pass_at_rate)} blocks, more than it has`}.</>
          : "Votes are not growing."}</small>
      </li>;
    })}</ul>
    <p className="live-note">Pace is the change in votes per block over about the last 144 blocks. <Method source="The enforcer's vote counts, read at the tip." limits="A reading of the past, not a forecast: each block can add or remove a vote."/></p>
  </LivePanel>;
}

/** What is open right now: bids for the next block, withdrawals in vote, recent merged mining and the period's totals. */
export function NowPanel() {
  const [window, setWindow] = useState<24 | 144>(24), [hours, setHours] = useState<24 | 168>(24);
  return <aside className="now-panel" aria-label="Right now">
    <h2 className="aside-title">Right now</h2>
    <BmmBids/>
    <PendingWithdrawals/>
    <div className="window-picker" role="group" aria-label="Blocks shown">{([24, 144] as const).map(w =>
      <button key={w} type="button" aria-pressed={window === w} onClick={() => setWindow(w)}>{w} blocks</button>)}</div>
    <BmmCommitments window={window}/>
    <div className="window-picker" role="group" aria-label="Period">{([24, 168] as const).map(h =>
      <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>{h === 24 ? "24 hours" : "7 days"}</button>)}</div>
    <DaySummary hours={hours}/>
  </aside>;
}
