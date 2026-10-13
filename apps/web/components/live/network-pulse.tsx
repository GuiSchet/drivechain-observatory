"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAuctions } from "@/lib/api";
import { object } from "@/lib/protocol";
import { formatCoins, formatSats, sats, timeAgo } from "@/lib/explain";
import { activeSidechains, known, n, snapshotOf, unknownText, useObservatory, weakestQuality } from "@/lib/live";
import { formatDifficulty, formatDuration, formatHashrate, useNetworkStats } from "@/lib/stats";
import { useUnit } from "@/lib/unit";
import { CopyHash, Method, Stat } from "@/components/learn/primitives";
import { useNow } from "./basics";

/** The state of L1 and of the drivechains right now, each figure with how it is measured. */
export function NetworkPulse({ technical }: { technical: boolean }) {
  const net = useNetworkStats(144), observatory = useObservatory(), unit = useUnit(), now = useNow(1_000);
  const auctions = useQuery({ queryKey: ["bmm"], queryFn: getAuctions, refetchInterval: 5_000 });
  const d = net.data, tip = d?.tip, r = d?.retarget, data = observatory.data, state = object(data?.state);
  const active = activeSidechains(data);
  const values = Object.values(object(state.treasury)).map(v => sats(object(v).value_sats)).filter((v): v is bigint => v !== undefined);
  const locked = values.reduce((a, b) => a + b, BigInt(0)).toString();
  const pending = Object.keys(object(state.bundles)).length;
  const bids = auctions.data?.requests ?? [];
  const top = bids.length ? bids.map(b => BigInt(b.bid_sats)).reduce((a, b) => a > b ? a : b).toString() : undefined;
  const missing = unknownText(data);
  const age = tip?.block_time ? (now - Date.parse(tip.block_time)) / 1000 : undefined;
  return <section className="pulse" aria-label="The network right now">
    <div className="stat-grid pulse-grid">
      <Stat label="Latest L1 block" value={tip ? `#${n(tip.height)}` : "…"}
        hint={tip ? <>mined {timeAgo(tip.block_time, now)} by its timestamp{technical ? <> · <CopyHash value={tip.hash}/></> : null}</> : undefined}
        quality={tip ? "observed" : undefined} proof={tip && d ? `/datasets/${d.meta.dataset_id}/blocks/${tip.hash}` : undefined}/>
      <Stat label="Time between blocks" value={d?.interval_mean_seconds != null ? formatDuration(d.interval_mean_seconds) : "…"}
        hint={d ? <>average of the last {n(d.blocks)} blocks{technical && d.interval_median_seconds != null ? `, median ${formatDuration(d.interval_median_seconds)}` : ""}; the target is 10 min{age != null && age > 3 * 600 ? ` · ${formatDuration(age)} since the last one` : ""}</> : undefined}
        method={<Method source="Timestamps in the headers of the selected chain." how="The mean of the gaps between consecutive blocks." limits="Miners set timestamps, so single gaps can be wrong or negative."/>}/>
      <Stat label="Difficulty" value={tip?.difficulty != null ? formatDifficulty(tip.difficulty, !technical) : "…"}
        hint={r ? <>
          <span className="meter" role="img" aria-label={`${n(r.blocks_into_epoch)} of ${n(r.interval_blocks)} blocks into this period`}><span style={{ width: `${(r.blocks_into_epoch / r.interval_blocks) * 100}%` }}/></span>
          next adjustment at block {n(r.next_retarget_height)}, in {n(r.blocks_remaining)} blocks{technical && r.estimated_adjustment != null ? ` · estimated ×${r.estimated_adjustment.toFixed(2)}` : ""}</> : undefined}
        method={<Method source="The newest header's proof-of-work target." how="Block work × 65535 / 2^48. Every 2,016 blocks it is adjusted toward one block per 10 minutes; the estimate divides 10 minutes by this period's average gap, limited to ×0.25–×4." limits="The estimate is noisy early in a period."/>}/>
      <Stat label="Estimated hashrate" value={d?.hashrate_hps != null ? formatHashrate(d.hashrate_hps) : "…"}
        hint={d ? `over the last ${n(d.blocks)} blocks` : undefined}
        method={<Method source="Work and timestamps of the selected chain's headers." how="Total work of the blocks divided by the time they took." limits="An estimate: it depends on miner-set timestamps and on luck."/>}/>
      <Stat label="Active sidechains" value={known(data, "sidechains") ? active.length : missing} hint={<Link href="/sidechains">see them →</Link>}
        quality={data ? (known(data, "sidechains") ? snapshotOf(data, "active_sidechains")?.quality ?? null : "unknown") : undefined}/>
      <Stat label="Locked in treasuries" value={known(data, "treasury") ? formatCoins(locked, !technical) : missing}
        hint={known(data, "treasury") ? <>{formatSats(locked, unit)}, {values.length} treasuries</> : undefined}
        quality={data ? (known(data, "treasury") ? weakestQuality(active.map(s => snapshotOf(data, "ctip", s.slot))) : "unknown") : undefined}/>
      <Stat label="Withdrawals in vote" value={known(data, "bundles") ? pending : missing} hint={<Link href="/learn/withdrawals">how voting works →</Link>}
        quality={data ? (known(data, "bundles") ? weakestQuality(active.map(s => snapshotOf(data, "withdrawal_bundle_proposals", s.slot))) : "unknown") : undefined}/>
      <Stat label="Open merged-mining bids" value={auctions.data ? n(bids.length) : "…"}
        hint={top ? <>highest {formatSats(top, unit)}{auctions.data?.observed_at ? ` · sampled ${timeAgo(auctions.data.observed_at, now)}` : ""}</> : auctions.data ? "none in the latest sample" : undefined}
        quality={auctions.data ? (auctions.data.state === "available" ? "tip_matched" : "unknown") : undefined}/>
    </div>
    {technical && d && <p className="live-note pulse-meta">
      Data as of block {n(data?.context.anchor_height)} · build {data?.context.build_id ?? "?"} · event {d.meta.data_as_of_event_id ?? "?"} · branch {d.branch.status}{d.branch.joint_source_status ? ` (node and enforcer ${d.branch.joint_source_status})` : ""}{tip?.chain_work ? <> · chain work {BigInt(tip.chain_work).toLocaleString("en-US")}</> : null}
    </p>}
  </section>;
}
