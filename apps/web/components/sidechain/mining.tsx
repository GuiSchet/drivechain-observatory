"use client";
import Link from "next/link";
import { useState } from "react";
import { formatSats } from "@/lib/explain";
import { n, proofHref, useProtocolPage } from "@/lib/live";
import { percent, useSidechainStats, utc } from "@/lib/stats";
import type { SidechainStats } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { CopyHash, LivePanel, Method, Stat } from "@/components/learn/primitives";
import { BmmBids, BmmCommitments, ConfirmedFees } from "@/components/live/bmm";
import { BlockChart } from "@/components/live/block-chart";

const WINDOWS = [24, 144, 1008] as const;

/** One bar per block: the highest bid seen for it, coloured by whether the block then committed to a bid. */
function BidChart({ stats }: { stats: SidechainStats }) {
  const unit = useUnit();
  const points = stats.series.map(b => ({
    x: b.height, y: b.top_bid_sats != null ? Number(b.top_bid_sats) : null,
    tone: b.bid_committed === true ? "good" as const : b.bid_committed === false ? "bad" as const : "muted" as const,
    label: <>Block {n(b.height)}: {b.bids ? <>{n(b.bids)} bid{b.bids > 1 ? "s" : ""}, top {formatSats(b.top_bid_sats, unit)}; {b.bid_committed ? "it committed to a bid" : b.bid_committed === false ? "it did not commit to any of them" : "its commitment was not observed"}</> : "no bid seen"}</>,
  }));
  if (!points.some(p => p.y != null)) return <p className="live-empty">No bid was seen for this sidechain in the last {n(stats.window_blocks)} blocks.</p>;
  return <BlockChart label="Highest merged-mining bid seen for each block" points={points} yFormat={y => `${Math.round(y).toLocaleString("en-US")}`}
    note={<><span className="legend"><i className="cell present"/> the block committed to a bid <i className="cell bad"/> it did not <i className="cell observed_absent"/> not observed</span> Bars are the highest bid seen on each block&apos;s parent, in {unit}. Bids the monitor did not see are not counted.</>}/>;
}

/** Commitments block by block with the committed sidechain block hash, for checking against a sidechain node. */
function CommitmentTable({ slot }: { slot: number }) {
  const page = useProtocolPage("bmm/commitments", `slot=${slot}&limit=50`);
  const items = page.data?.items ?? [], dataset = page.data?.context.meta.dataset_id;
  return <div className="table-scroll"><table className="data-table">
    <thead><tr><th className="num">Block</th><th>Block time</th><th>Committed sidechain block (h*)</th><th/></tr></thead>
    <tbody>{items.map(i => {
      const h = (i.data as { bmm_commitment?: string | null }).bmm_commitment, proof = proofHref(i, dataset);
      return <tr key={i.id}>
        <td className="num">{dataset && i.hash ? <Link href={`/datasets/${dataset}/blocks/${i.hash}`}>{n(i.height)}</Link> : n(i.height)}</td>
        <td className="nowrap">{utc(i.block_time)}</td>
        <td>{h ? <CopyHash value={h} full/> : <span className="muted">no commitment</span>}</td>
        <td>{proof && <Link className="proof-link" href={proof}>evidence</Link>}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export function MiningSection({ slot, name, stats, failed = false, technical }: { slot: number; name: string; stats?: SidechainStats; failed?: boolean; technical: boolean }) {
  const unit = useUnit();
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>(24);
  const long = useSidechainStats(window === 1008 ? slot : undefined, 1008);
  const shown = window === 1008 && long.data ? long.data : stats;
  const bmm = stats?.bmm, b = stats?.bids;
  return <>
    {bmm && <div className="stat-grid">
      {bmm.windows.map(w => <Stat key={w.blocks} label={`Last ${n(w.blocks)} blocks`} value={percent(w.present, w.covered, 0)} hint={`${n(w.present)} of ${n(w.covered)} observed blocks`}
        method={w.blocks === 24 ? <Method source="BMM commitments (BIP301) reported for each L1 block." how="Committing blocks divided by observed blocks." limits="Blocks whose merged-mining data was not observed are left out."/> : undefined}/>)}
      {bmm.since_activation && <Stat label="Since activation" value={percent(bmm.since_activation.present, bmm.since_activation.covered, 0)} hint={`${n(bmm.since_activation.present)} of ${n(bmm.since_activation.covered)} observed blocks`}/>}
      {technical && <Stat label="Current streak" value={`${n(bmm.streak)} blocks`} hint={bmm.last_commit_height != null ? `last commitment in block ${n(bmm.last_commit_height)}` : "no commitment observed"}/>}
      {technical && <Stat label="Longest run without one" value={bmm.longest_gap ? `${n(bmm.longest_gap.blocks)} blocks` : "none"} hint={bmm.longest_gap ? `blocks ${n(bmm.longest_gap.from_height)}–${n(bmm.longest_gap.to_height)}` : "every observed block committed"}/>}
    </div>}
    <BmmCommitments slot={slot} window={window} controls={<div className="window-picker" role="group" aria-label="Blocks shown">{WINDOWS.map(w =>
      <button key={w} type="button" aria-pressed={window === w} onClick={() => setWindow(w)}>{n(w)} blocks</button>)}</div>}/>
    <BmmBids slot={slot}/>
    <LivePanel title="Bids for each block" status={{ pending: !shown, error: !shown && (failed || long.isError) }}
      footer={b ? <>{n(b.count)} bids seen on {n(b.parent_blocks)} blocks since monitoring began; median {formatSats(b.median_sats, unit)}, highest {formatSats(b.max_sats, unit)}.{b.next_block_observed ? <> The next block committed to the bid&apos;s sidechain block for {n(b.committed_next_block)} of the {n(b.next_block_observed)} bids whose next block was observed ({percent(b.committed_next_block, b.next_block_observed, 0)}). That shows which bid won, not that its fee was paid.</> : null}</> : undefined}>
      {shown && <BidChart stats={window === 24 ? { ...shown, series: shown.series.slice(0, 24) } : shown}/>}
    </LivePanel>
    <ConfirmedFees slot={slot}/>
    {technical && <LivePanel title="Commitments, block by block">
      <p className="live-lede">The sidechain block hash each L1 block committed to, newest first. Compare it with a {name} node to see which sidechain block was mined.</p>
      <CommitmentTable slot={slot}/>
    </LivePanel>}
  </>;
}
