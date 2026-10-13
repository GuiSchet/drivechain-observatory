"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { at, object } from "@/lib/protocol";
import { describeActivity, formatSats, sats, sidechainLabel } from "@/lib/explain";
import { n, useSidechainNames } from "@/lib/live";
import { formatDuration, useNetworkStats, utc } from "@/lib/stats";
import type { ProtocolItem } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { useLiveActivity } from "@/components/providers";
import { CopyHash } from "@/components/learn/primitives";
import { useTimeline } from "./timeline";

/** The block timeline as a dense table: one row per L1 block, every figure exact; expand a row for its records. */
export function BlockTable() {
  const names = useSidechainNames(), unit = useUnit(), live = useLiveActivity();
  const { shown, buckets, cells, previous, proof, dataset, loadMore, pending, error, more, loading } = useTimeline();
  const network = useNetworkStats(144);
  const byHeight = new Map((network.data?.series ?? []).map(b => [b.height, b]));
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (h: number) => setOpen(prev => { const next = new Set(prev); if (next.has(h)) next.delete(h); else next.add(h); return next; });
  if (pending) return <p className="live-empty" role="status">Loading the latest blocks…</p>;
  if (error) return <p className="live-empty" role="status">Live activity is unavailable right now; retrying automatically.</p>;
  const votes = (item: ProtocolItem) => { const v = at(item.data, "bundle", "vote_count"); return typeof v === "number" ? v : undefined; };
  return <>
    <div className="table-scroll"><table className="data-table block-table">
      <thead><tr><th/><th className="num">Block</th><th>Hash</th><th>Block time (UTC)</th><th className="num">Δt</th><th>BMM</th><th className="num">Deposits</th><th>Withdrawals</th><th>Vote changes</th><th className="num">Top bid</th></tr></thead>
      <tbody>{shown.map((b, i) => {
        const at_ = buckets.get(b.height), slots = [...(cells.get(b.height) ?? [])].sort((x, y) => x.slot - y.slot);
        const observed = slots.filter(c => c.state !== "unknown_eligibility"), committed = slots.filter(c => c.state === "present");
        const older = shown[i + 1], net = byHeight.get(b.height);
        const interval = net?.interval_seconds ?? (older && older.height === b.height - 1 && b.block_time && older.block_time ? (Date.parse(b.block_time) - Date.parse(older.block_time)) / 1000 : undefined);
        const deposited = (at_?.deposits ?? []).reduce((sum, d) => sum + (sats(object(d.item.data).value_sats) ?? BigInt(0)), BigInt(0));
        const bundles = (at_?.readings ?? []).filter(r => r.kind === "bundle");
        const expanded = open.has(b.height), records = [...(at_?.deposits.map(d => d.item) ?? []), ...(at_?.outcomes ?? []), ...(at_?.readings ?? [])];
        return <Fragment key={b.hash}>
          <tr className={live?.hash === b.hash ? "fresh-block" : ""}>
            <td>{records.length ? <button type="button" className="row-toggle" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} the records of block ${n(b.height)}`} onClick={() => toggle(b.height)}>{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button> : null}</td>
            <td className="num">{dataset ? <Link href={`/datasets/${dataset}/blocks/${b.hash}`}>{n(b.height)}</Link> : n(b.height)}</td>
            <td><CopyHash value={b.hash}/></td>
            <td className="nowrap">{utc(b.block_time)}</td>
            <td className="num nowrap">{interval != null ? formatDuration(interval) : "—"}</td>
            <td className="nowrap">{observed.length ? <span className="mini-cells" title={slots.map(c => `${sidechainLabel(c.slot, names)}: ${c.state.replaceAll("_", " ")}`).join("\n")}>
              <strong>{committed.length}/{observed.length}</strong>{slots.map(c => <i key={c.slot} className={`cell ${c.state}`}/>)}</span> : <span className="muted">not observed</span>}</td>
            <td className="num">{at_?.deposits.length ? <>{n(at_.deposits.length)} · {formatSats(deposited.toString(), unit)}</> : "—"}</td>
            <td>{at_?.outcomes.length ? at_.outcomes.map(o => `${Object.keys(object(object(o.data).state))[0] ?? "?"} #${o.slot ?? "?"}`).join(", ") : "—"}</td>
            <td>{bundles.length ? bundles.map(r => { const prev = previous(r), v = votes(r), before = prev ? votes(prev) : undefined;
              return <span key={r.id} className="nowrap">#{r.slot} {n(v)}{v != null && before != null ? ` (${v - before >= 0 ? "+" : ""}${n(v - before)})` : ""} </span>; }) : "—"}</td>
            <td className="num nowrap">{net?.top_bid_sats ? <span title={`${n(net.bids)} bids for ${n(net.bid_slots)} sidechains, ${formatSats(net.bid_total_sats, unit)} in total`}>{formatSats(net.top_bid_sats, unit)}</span> : "—"}</td>
          </tr>
          {expanded && <tr className="row-detail"><td/><td colSpan={9}><ul className="plain-list">{records.map(item =>
            <li key={item.id}>{describeActivity(item, names, unit)} {proof(item) && <Link className="proof-link" href={proof(item)!}>evidence</Link>}</li>)}</ul></td></tr>}
        </Fragment>;
      })}</tbody>
    </table></div>
    <p className="live-note">Δt is the time since the previous block by the miners&apos; timestamps. BMM counts sidechains whose block hash this block committed to, of those observed; each square is one sidechain by slot. Vote changes are readings taken while this was the newest block. Top bid is the highest merged-mining bid the monitor saw for this block.</p>
    {more && <div className="pagination"><button disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Show older blocks"}</button></div>}
  </>;
}
