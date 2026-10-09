"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAuctions, getJson } from "@/lib/api";
import { formatSats, short, sidechainLabel, timeAgo } from "@/lib/explain";
import { n, useProtocolPage, useSidechainNames } from "@/lib/live";
import type { BmmMetrics } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { LivePanel } from "@/components/learn/primitives";
import { useNow } from "./basics";

// Plain explanations of the auction states the API reports.
const auctionState: Record<string, string> = {
  available: "These are the bids the monitor saw in its latest successful look at the open bids.",
  no_observed_bids: "The latest look found no open bids. That does not prove there were none anywhere.",
  stale: "The latest sample is getting old; the bids below may no longer be open.",
  rpc_error: "The monitor could not read the bids this time. The last sample is shown; it does not mean there are no bids.",
  unavailable: "The data source does not offer merged-mining bids.",
  awaiting_observation: "Waiting for the first readable sample of bids.",
  interpretation_error: "The latest sample could not be interpreted.",
  inconsistent_snapshot: "The chain moved while the bids were read, so this sample may not belong to the current block.",
  awaiting_current_parent: "The latest sample was taken for an earlier block than the current tip.",
  branch_unresolved: "The chain branch is unclear right now, so these bids may not be current.",
};

export function BmmBids({ slot }: { slot?: number }) {
  const auctions = useQuery({ queryKey: ["bmm"], queryFn: getAuctions, refetchInterval: 5_000 });
  const names = useSidechainNames(), unit = useUnit(), now = useNow(2_000);
  const a = auctions.data;
  const bids = [...(a?.requests ?? [])].filter(b => slot == null || b.slot === slot).sort((x, y) => BigInt(y.bid_sats) > BigInt(x.bid_sats) ? 1 : -1);
  return <LivePanel title="Open bids for the next block" quality={a?.state === "available" ? "tip_matched" : a ? "unknown" : null} proof={a?.evidence_url ?? undefined}
    status={{ pending: auctions.isPending, error: auctions.isError && !a }}>
    <p className="live-lede">{a ? auctionState[a.state] ?? a.state.replaceAll("_", " ") : null} {a?.observed_at && <>Sampled {timeAgo(a.observed_at, now)}.</>}</p>
    {bids.length ? <div className="table-scroll"><table className="friendly-table"><thead><tr><th>Sidechain</th><th>Bid to the miner</th><th>Side block (h*)</th><th>Bid transaction</th></tr></thead>
      <tbody>{bids.map((b, i) => <tr key={b.txid + i}><td><Link href={`/sidechains/${b.slot}`}>{sidechainLabel(b.slot, names)}</Link></td><td><strong>{formatSats(b.bid_sats, unit)}</strong></td><td className="hash">{short(b.critical_hash)}</td><td className="hash">{short(b.txid)}</td></tr>)}</tbody></table></div>
      : a ? <p className="live-empty">No bids in this sample.</p> : null}
    {a?.parent_hash && <p className="live-note">Every bid names the block it builds on ({short(a.parent_hash)}); it can only be accepted in the very next block.</p>}
  </LivePanel>;
}

const cellText: Record<string, string> = { present: "commitment in this block", observed_absent: "no commitment in this block", unknown_eligibility: "not observed" };

export function BmmCommitments({ slot }: { slot?: number }) {
  const names = useSidechainNames();
  const query = slot == null ? "window_blocks=24" : `window_blocks=24&slot=${slot}`;
  const metrics = useQuery({ queryKey: ["protocol", "bmm", "metrics", query], queryFn: () => getJson<BmmMetrics>(`/api/v1/bmm?${query}`) });
  const rows = metrics.data?.slots ?? [];
  const dataset = metrics.data?.context.meta.dataset_id;
  return <LivePanel title="Which sidechains got a block, block by block" quality={rows.length ? "observed" : null}
    status={{ pending: metrics.isPending, error: metrics.isError && !rows.length, empty: !rows.length, emptyText: "No commitments have been observed yet." }}
    footer={<span className="legend"><i className="cell present"/> commitment (BMM Accept) <i className="cell observed_absent"/> none <i className="cell unknown_eligibility"/> not observed</span>}>
    <p className="live-lede">The last 24 L1 blocks, oldest on the left. A lit cell means that L1 block committed to one block hash of that sidechain, so that sidechain block was "found". Whether the sidechain block itself is valid is checked by sidechain nodes, not by L1. Select a cell to see its proof.</p>
    <div className="commit-grid">{rows.map(row => <div className="commit-row" key={row.slot}>
      <span className="commit-name"><Link href={`/sidechains/${row.slot}`}>{sidechainLabel(row.slot, names)}</Link><small>{n(row.present)} of {n(row.covered)}</small></span>
      <span className="commit-cells">{[...row.cells].reverse().map(cell => {
        const ev = cell.evidence[0]?.event_id, label = `${sidechainLabel(row.slot, names)}, block ${n(cell.height)}: ${cellText[cell.state] ?? cell.state}`;
        return ev && dataset ? <Link key={cell.height} className={`cell ${cell.state}`} href={`/datasets/${dataset}/events/${ev}`} title={label} aria-label={label}/> : <span key={cell.height} className={`cell ${cell.state}`} title={label} aria-label={label}/>;
      })}</span>
    </div>)}</div>
  </LivePanel>;
}

export function ConfirmedFees() {
  const unit = useUnit(), names = useSidechainNames();
  const page = useProtocolPage("bmm/confirmed", "limit=6&scope=all");
  const items = page.data?.items ?? [];
  return <LivePanel title="Bids that were paid" status={{ pending: page.isPending, error: page.isError && !items.length, empty: !items.length,
    emptyText: <p>No paid bid has been matched yet. A fee is shown only when the monitor saw the bid, found the matching commitment in a block, and could read the transaction's inputs. Otherwise the fee stays unknown rather than guessed.</p> }}>
    <ul className="plain-list">{items.map(item => <li key={item.id}>{sidechainLabel(item.slot, names)}, block {n(item.height)}: {item.data && typeof item.data === "object" && "fee_sats" in item.data && item.data.fee_sats != null ? formatSats(item.data.fee_sats, unit) : "fee unknown"}</li>)}</ul>
  </LivePanel>;
}
