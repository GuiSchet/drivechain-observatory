"use client";
import { formatSats } from "@/lib/explain";
import { n } from "@/lib/live";
import { formatDuration, percent, useNetworkStats, utc } from "@/lib/stats";
import { useUnit } from "@/lib/unit";
import { LivePanel, Method, Stat } from "@/components/learn/primitives";
import { BlockChart } from "./block-chart";

function median(xs: bigint[]): bigint | undefined {
  const s = [...xs].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  return s.length ? s[Math.floor((s.length - 1) / 2)] : undefined;
}

/** How fast L1 blocks came, block by block, against the ten-minute target. */
export function BlockPace() {
  const net = useNetworkStats(144), d = net.data;
  const points = (d?.series ?? []).map(b => ({
    x: b.height, y: b.interval_seconds != null ? b.interval_seconds / 60 : null,
    tone: b.interval_seconds != null && b.interval_seconds < 0 ? "bad" as const : undefined,
    label: <>Block {n(b.height)}, {utc(b.block_time)}: {b.interval_seconds != null ? <strong>{formatDuration(b.interval_seconds)}</strong> : "gap unknown"} after the previous block</>,
  }));
  return <LivePanel title="Time between blocks" quality={d ? "observed" : undefined} status={{ pending: net.isPending, error: net.isError && !d, empty: !points.length }}>
    <BlockChart label="Minutes between consecutive blocks" points={points} yFormat={y => `${Math.round(y)} min`} reference={{ y: 10, label: "target 10 min" }}
      note={<>The last {n(d?.blocks)} blocks of the selected chain, by their miners&apos; timestamps; a gap can be negative because timestamps need not increase.</>}/>
  </LivePanel>;
}

/** Merged-mining bids the monitor saw for each recent block, across every sidechain. */
export function BmmMarket() {
  const net = useNetworkStats(144), unit = useUnit(), d = net.data;
  const series = d?.series ?? [], withBids = series.filter(b => b.bids);
  const tops = withBids.map(b => BigInt(b.top_bid_sats ?? "0")), total = withBids.reduce((sum, b) => sum + BigInt(b.bid_total_sats ?? "0"), BigInt(0));
  const points = series.map(b => ({
    x: b.height, y: b.bid_total_sats ? Number(b.bid_total_sats) : null,
    label: <>Block {n(b.height)}: {b.bids ? <>{n(b.bids)} bids for {n(b.bid_slots)} sidechains, {formatSats(b.bid_total_sats, unit)} in total, top {formatSats(b.top_bid_sats, unit)}</> : "no bid seen"}</>,
  }));
  return <LivePanel title="The merged-mining market" quality={d ? "observed" : undefined} status={{ pending: net.isPending, error: net.isError && !d, empty: !series.length }}>
    <div className="stat-grid">
      <Stat label="Blocks with a bid seen" value={percent(withBids.length, series.length, 0)} hint={`${n(withBids.length)} of the last ${n(series.length)} blocks`}
        method={<Method source="The monitor's samples of open BMM requests before each block was mined." how="Distinct bids per parent block, however many samples contained them." limits="Bids the monitor did not see, and payments made off L1, are not counted."/>}/>
      <Stat label="Offered in these blocks" value={formatSats(total.toString(), unit)} hint="sum of every distinct bid seen"/>
      <Stat label="Typical top bid" value={withBids.length ? formatSats(median(tops)?.toString(), unit) : "—"} hint="median of each block's highest bid"/>
    </div>
    <BlockChart label="Sum of the bids seen for each block" points={points} yFormat={y => Math.round(y).toLocaleString("en-US")}
      note={<>Bars are the total offered for each block, in {unit}. A bid is offered on a block&apos;s parent and can only be taken by that block&apos;s miner.</>}/>
  </LivePanel>;
}
