"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiFailure, getBlock } from "@/lib/api";
import type { Block, ProtocolItem } from "@/lib/types";
import { object } from "@/lib/protocol";
import { formatCoins, formatSats, outcomeOf, short, sidechainLabel, timeAgo } from "@/lib/explain";
import { n, useProtocolPage, useSidechainNames } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import { useNow } from "@/components/live/basics";
import { GoDeeper } from "@/components/learn/primitives";
import { BranchSummary } from "./branch-summary";
import { ProofIntro } from "./proof-intro";

// What each recorded kind is, in words; slot reports name their sidechain.
const recordText: Record<string, string> = {
  mainchain_block: "Header read from our Betanet node",
  chain_tip: "Tip reading: this block was the newest block",
  mainchain_transition: "Live notice from the enforcer: this block was added",
  block_disconnected: "Live notice from the enforcer: this block was removed by a reorganization",
};
const methodText: Record<string, string> = { live: "live", backfill: "catch-up read" };

/** "2026-10-09 18:30:57 UTC" */
function utc(iso: string | null | undefined): string {
  return iso ? iso.replace("T", " ").replace(/(\.\d+)?Z$/, " UTC") : "unknown";
}

/** A huge decimal integer as "≈ 1.7 × 10¹⁹". */
function magnitude(value: string | null | undefined): ReactNode {
  if (!value || !/^\d+$/.test(value)) return "unknown";
  if (value.length < 7) return Number(value).toLocaleString("en-US");
  return <>≈ {value[0]}.{value[1]} × 10<sup>{value.length - 1}</sup></>;
}

export function BlockDetail({ dataset, hash, initial }: { dataset: string; hash: string; initial: Block | null }) {
  const query = useQuery({ queryKey: ["blocks", "detail", dataset, hash], queryFn: () => getBlock(dataset, hash), initialData: initial ?? undefined, retry: (count, e) => !(e instanceof ApiFailure && e.status === 404) && count < 2 });
  const activity = useProtocolPage("activity", `dataset=${dataset}&hash=${hash}&scope=all&limit=200`);
  const names = useSidechainNames(), unit = useUnit(), now = useNow(30_000);
  const data = query.data, block = data?.block;
  const proof = (event: string) => `/datasets/${dataset}/events/${event}`;

  // One enforcer report per sidechain slot that was active in this block; activity says what each contained.
  const reports = (data?.facts ?? []).filter(f => f.kind === "block_connected" && f.slot != null);
  const items = activity.data?.items ?? [];
  const bySlot = (slot: number, kind: string) => items.filter(i => i.slot === slot && i.kind === kind);
  const rows = reports.map(r => {
    const slot = r.slot!, commitment = bySlot(slot, "bmm_commitment").find(i => object(i.data).bmm_commitment);
    return { slot, event: r.event_id, commitment, deposits: bySlot(slot, "deposit"), outcomes: bySlot(slot, "bundle_outcome") };
  }).sort((a, b) => a.slot - b.slot);
  const committed = rows.filter(r => r.commitment), deposits = rows.flatMap(r => r.deposits), outcomes = rows.flatMap(r => r.outcomes);
  const onTop = block && data?.branch.tip_height != null && block.membership === "selected" ? data.branch.tip_height - block.height : undefined;
  const list = (xs: { slot: number }[]) => xs.map(r => sidechainLabel(r.slot, names)).join(", ");
  const otherRecords = (data?.facts ?? []).filter(f => f.kind !== "block_connected");

  return <main className="detail-shell">
    <Link className="text-link" href="/live">← Live activity</Link>
    <div className="eyebrow">L1 BLOCK</div>
    <h1>{block ? `Block ${n(block.height)}` : "Block detail"}</h1>
    {query.isError && <p className="inline-notice" role="status">{query.error instanceof ApiFailure && query.error.status === 404 ? "Our node has not reported this block yet. A tip can be seen before its header arrives." : "The API is unavailable right now. Any values below are the last loaded view."}</p>}
    {!data && !query.isError && <p role="status">Loading the block…</p>}

    {block && data && <>
      <p className="lede">
        Mined {timeAgo(block.block_time, now)} ({utc(block.block_time)}).{" "}
        {block.membership !== "selected" ? <>It is <strong>not on the chain we follow</strong>: a reorganization left it behind. It stays on record so it can be inspected.</>
          : onTop === 0 ? <>It is the <strong>newest block</strong> on the chain we follow.</>
          : onTop != null ? <><strong>{n(onTop)} {onTop === 1 ? "block has" : "blocks have"}</strong> been built on top of it.</> : null}
      </p>

      <section className="panel compact-panel block-summary">
        <h2>What happened in this block</h2>
        {reports.length ? <p>
          The enforcer reported this block for the <strong>{n(reports.length)} sidechains</strong> active at the time.{" "}
          {committed.length ? <>L1 miners committed to a block hash of <strong>{n(committed.length)}</strong> of them: {list(committed)}.</> : <>No sidechain got a merged-mining commitment.</>}{" "}
          {deposits.length ? <><strong>{n(deposits.length)} {deposits.length === 1 ? "deposit" : "deposits"}</strong>.</> : "No deposits."}{" "}
          {outcomes.length ? <><strong>{n(outcomes.length)} withdrawal {outcomes.length === 1 ? "event" : "events"}</strong>.</> : "No withdrawal events."}
        </p> : <p>No sidechain report has been recorded for this block, so we can&apos;t say what it contained for the sidechains. The header below still comes from our node.</p>}
        {!!rows.length && <div className="table-scroll"><table className="friendly-table">
          <thead><tr><th>Sidechain</th><th>Merged mining</th><th>Deposits</th><th>Withdrawals</th><th>Proof</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.slot}>
            <td><Link href={`/sidechains/${r.slot}`}>{sidechainLabel(r.slot, names)}</Link></td>
            <td>{r.commitment ? <>commitment <span className="hash">{short(String(object(r.commitment.data).bmm_commitment))}</span></> : <span className="muted">none</span>}</td>
            <td>{r.deposits.length ? r.deposits.map(d => <div key={d.id}>{formatCoins(object(d.data).value_sats)} <small className="muted">{formatSats(object(d.data).value_sats, unit)}</small></div>) : <span className="muted">none</span>}</td>
            <td>{r.outcomes.length ? r.outcomes.map(o => <div key={o.id}>{outcomeText(o)}</div>) : <span className="muted">none</span>}</td>
            <td><Link className="text-link" href={proof(r.event)}>report</Link></td>
          </tr>)}</tbody>
        </table></div>}
        <p className="scope-note">A commitment is only a hash: L1 records it without seeing or checking the sidechain block. <Link className="text-link" href="/learn/merged-mining">How merged mining works</Link> · <Link className="text-link" href="/learn/deposits">Deposits</Link> · <Link className="text-link" href="/learn/withdrawals">Withdrawals</Link></p>
      </section>

      <section className="panel compact-panel">
        <h2>Where it sits in the chain</h2>
        <dl className="facts">
          <dt>Previous block</dt><dd><Link className="text-link" href={`/datasets/${dataset}/blocks/${block.parent_hash}`}>block {n(block.height - 1)}</Link> <span className="hash muted">{short(block.parent_hash)}</span></dd>
          <dt>This block&apos;s hash</dt><dd className="hash">{block.hash}</dd>
          <dt>Proof of work</dt><dd>{magnitude(block.block_work)} hashes expected to find it; the chain behind it adds up to {magnitude(block.chain_work)}. <Link className="text-link" href="/learn/blocks">Why work matters</Link></dd>
          <dt>Our node and the enforcer</dt><dd>{data.branch.joint_source_status === "matched" ? "agree on the chain this block belongs to" : `status: ${data.branch.joint_source_status || "unknown"}`}{block.conflicted ? "; some evidence about this block conflicts" : ""}</dd>
        </dl>
      </section>

      <GoDeeper summary="how we know: every record of this block">
        <ProofIntro what="block"/>
        <h3>Records</h3>
        <ul className="evidence-list">
          {reports.map(f => <li key={f.event_id}><Link className="text-link" href={proof(f.event_id)}>Enforcer report for {sidechainLabel(f.slot, names)}</Link><span>record {f.event_id} · first recorded {utc(f.observed_at)}</span>{f.interpretation_error && <span className="error-text">{f.interpretation_error}</span>}</li>)}
          {otherRecords.map(f => <li key={f.event_id}><Link className="text-link" href={proof(f.event_id)}>{recordText[f.kind] ?? f.kind.replaceAll("_", " ")}</Link><span>record {f.event_id} · first recorded {utc(f.observed_at)}</span>{f.interpretation_error && <span className="error-text">{f.interpretation_error}</span>}</li>)}
        </ul>
        {data.facts_truncated && <p className="inline-notice">Showing the latest 200 records for this block.</p>}
        <h3>Every time the monitor saw them</h3>
        <p>A record can be seen more than once: live as it happens, again when the monitor catches up after a restart, and on each later tip reading. Each sighting is listed, newest first.</p>
        <div className="table-scroll"><table className="friendly-table">
          <thead><tr><th>When</th><th>What</th><th>How</th><th>Record</th></tr></thead>
          <tbody>{data.observations.map(o => <tr key={o.observation_id}>
            <td>{utc(o.observed_at)}</td>
            <td>{o.slot != null ? `Enforcer report for ${sidechainLabel(o.slot, names)}` : recordText[o.kind] ?? o.kind.replaceAll("_", " ")}</td>
            <td>{methodText[o.capture_method] ?? o.capture_method}</td>
            <td><Link className="text-link" href={proof(o.event_id)}>{o.event_id}</Link></td>
          </tr>)}</tbody>
        </table></div>
        {!data.observations.length && <p>No sightings have been imported yet.</p>}
        {data.observations_truncated && <p>Showing the latest 200 sightings.</p>}
        <h3>Times</h3>
        <dl className="facts">
          <dt>Block time (set by the miner)</dt><dd>{utc(block.block_time)}</dd>
          <dt>First enforcer report</dt><dd>{utc(reports.map(r => r.observed_at).sort()[0])}</dd>
          <dt>Header first read from our node</dt><dd>{utc(block.first_observed_at)}</dd>
          <dt>Exact proof of work</dt><dd className="hash">block {block.block_work ?? "unknown"} · chain {block.chain_work}</dd>
        </dl>
        <h3>The chain we follow right now</h3>
        <p>This is the current state of the whole chain, not of this block: which branch our node and the enforcer selected, and from which height it is verified.</p>
        <BranchSummary branch={data.branch} dataset={dataset}/>
      </GoDeeper>
    </>}
  </main>;
}

function outcomeText(item: ProtocolItem): string {
  const outcome = outcomeOf(item);
  return outcome === "Succeeded" ? "bundle paid out" : outcome === "Failed" ? "bundle failed" : outcome === "Submitted" ? "bundle put up for a vote" : "bundle event";
}
