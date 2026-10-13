"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { getAuctions } from "@/lib/api";
import { object } from "@/lib/protocol";
import { formatCoins, formatSats } from "@/lib/explain";
import { activeSidechains, known, n, useBmmMetrics, proofHref, snapshotOf, unknownText, useObservatory, type ActiveSidechain } from "@/lib/live";
import { percent } from "@/lib/stats";
import { useUnit } from "@/lib/unit";
import { useViewMode } from "@/lib/view-mode";
import { ConfidenceChip } from "@/components/learn/primitives";
import { PageHead } from "@/components/view-toggle";

type Row = { s: ActiveSidechain; treasury?: bigint | null; seq?: unknown; present?: number; covered?: number; bid?: bigint; pending: number };
type Key = "slot" | "treasury" | "bmm" | "bid" | "pending" | "active";

function useRows(window: 24 | 144) {
  const observatory = useObservatory();
  const metrics = useBmmMetrics(window);
  const auctions = useQuery({ queryKey: ["bmm"], queryFn: getAuctions, refetchInterval: 5_000 });
  const state = object(observatory.data?.state), treasury = object(state.treasury), bundles = Object.keys(object(state.bundles));
  const bmm = new Map((metrics.data?.slots ?? []).map(r => [r.slot, r]));
  return activeSidechains(observatory.data).map((s): Row => {
    const raw = treasury[String(s.slot)], value = raw ? object(raw).value_sats : undefined;
    const bids = (auctions.data?.requests ?? []).filter(r => r.slot === s.slot).map(r => BigInt(r.bid_sats));
    return {
      s, treasury: raw === null ? null : typeof value === "string" ? BigInt(value) : undefined, seq: raw ? object(raw).sequence_number : undefined,
      present: bmm.get(s.slot)?.present, covered: bmm.get(s.slot)?.covered,
      bid: bids.length ? bids.reduce((a, b) => a > b ? a : b) : undefined, pending: bundles.filter(k => k.startsWith(`${s.slot}:`)).length,
    };
  });
}

/** Every active sidechain side by side, sortable: the technical view of the gallery. */
function ComparisonTable() {
  const unit = useUnit(), rows = useRows(144), observatory = useObservatory(), bundlesKnown = known(observatory.data, "bundles");
  const [key, setKey] = useState<Key>("treasury");
  const value = (r: Row): number => ({
    slot: -r.s.slot, treasury: r.treasury ? Number(r.treasury) : -1, bmm: r.covered ? (r.present ?? 0) / r.covered : -1,
    bid: r.bid != null ? Number(r.bid) : -1, pending: r.pending, active: -(r.s.activationHeight ?? 0),
  })[key];
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const th = (k: Key, label: string, num = true) => <th className={num ? "num" : ""} aria-sort={key === k ? "descending" : "none"}>
    <button type="button" className="th-sort" onClick={() => setKey(k)}>{label}{key === k ? " ↓" : ""}</button></th>;
  return <div className="table-scroll"><table className="data-table">
    <thead><tr>{th("slot", "Slot")}<th>Sidechain</th>{th("treasury", "Treasury")}{th("bmm", "BMM, 144 blocks")}{th("bid", "Open bid")}{th("pending", "Withdrawals in vote")}{th("active", "Active since")}</tr></thead>
    <tbody>{sorted.map(r => <tr key={r.s.slot}>
      <td className="num">#{r.s.slot}</td>
      <td><Link href={`/sidechains/${r.s.slot}`}>{r.s.title ?? "Unnamed"}</Link></td>
      <td className="num">{r.treasury === null ? "—" : r.treasury != null ? <>{formatSats(r.treasury.toString(), unit)}<small>{typeof r.seq === "string" ? ` #${r.seq}` : ""}</small></> : "unknown"}</td>
      <td className="num">{r.covered ? `${percent(r.present, r.covered, 0)} (${n(r.present)}/${n(r.covered)})` : "unknown"}</td>
      <td className="num">{r.bid != null ? formatSats(r.bid.toString(), unit) : "—"}</td>
      <td className="num">{bundlesKnown ? n(r.pending) : unknownText(observatory.data)}</td>
      <td className="num">block {n(r.s.activationHeight)}</td>
    </tr>)}</tbody>
  </table></div>;
}

export function SidechainGallery() {
  const observatory = useObservatory(), unit = useUnit(), { technical } = useViewMode();
  const rows = useRows(24);
  const snap = snapshotOf(observatory.data, "active_sidechains");
  const data = observatory.data, complete = known(data, "sidechains"), bundlesKnown = known(data, "bundles");
  return <main className="page-shell wide">
    <PageHead eyebrow="THE SIDECHAINS OF BETANET"/><h1>Meet the sidechains</h1>
    <p className="lede">Each card is one active sidechain: what it declares to be, how many coins it holds on L1, and how often L1 miners committed to one of its blocks (blind merged mining). Open one to follow its whole story. New to the terms? Start with <Link className="text-link" href="/learn/slots">slots and sidechains</Link>.</p>
    {observatory.isPending && <p className="live-empty" role="status">Loading sidechains…</p>}
    {observatory.isError && !observatory.data && <p className="live-empty" role="status">The sidechain list is unavailable right now; retrying automatically.</p>}
    {data && !complete && <p className="live-updating" role="status">{data.readiness === "unknown" ? "The list of active sidechains is being updated to the newest block; it will appear shortly." : "The latest reading of active sidechains is incomplete, so this list may be missing some."}</p>}
    {data?.readiness === "updating" && <p className="live-updating" role="status">Updating to the newest block. Showing the last complete reading until then.</p>}
    {snap && complete && <p className="gallery-meta"><ConfidenceChip quality={snap.quality}/> {rows.length} active sidechains in the latest reading · <Link className="text-link" href={proofHref(snap, data?.context.meta.dataset_id) ?? "#"}>See the evidence</Link></p>}
    {technical ? <ComparisonTable/> : <ul className="sidechain-cards">{rows.map(r => {
      const s = r.s, value = r.treasury != null ? r.treasury.toString() : undefined;
      return <li key={s.slot}><Link href={`/sidechains/${s.slot}`}>
        <span className="sc-slot">Slot #{s.slot}</span>
        <strong className="sc-title">{s.title ?? "Unnamed sidechain"}</strong>
        <p className="sc-desc">{s.description ?? "No description declared."}</p>
        <dl>
          <div><dt>Locked on L1</dt><dd>{r.treasury === null ? "nothing yet" : value ? formatCoins(value, true) : "unknown"}{value ? <small>{formatSats(value, unit)}</small> : null}</dd></div>
          <div><dt>BMM commitments, last 24 L1 blocks</dt><dd>{r.covered != null ? `in ${r.present} of ${r.covered} observed` : "unknown"}{r.bid != null ? <small>open bid {formatSats(r.bid.toString(), unit)}</small> : null}</dd></div>
          <div><dt>Withdrawals in vote</dt><dd>{bundlesKnown ? r.pending : unknownText(data)}</dd></div>
          <div><dt>Active since</dt><dd>block {n(s.activationHeight)}</dd></div>
        </dl>
        <span className="sc-open">Follow its story <ArrowRight size={14}/></span>
      </Link></li>;
    })}</ul>}
    {complete && <p className="scope-note">{256 - rows.length} of 256 slots are empty right now.</p>}
  </main>;
}
