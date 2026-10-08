"use client";
import { BmmHistory } from "./protocol-visuals";
import { ProtocolList } from "./protocol-browser";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getAuctions } from "@/lib/api";
import type { Auctions } from "@/lib/types";

const explanations: Record<string, string> = {
  branch_unresolved: "The branch evidence is ambiguous. This retained sample is not a confirmed current auction.",
  available: "Requests seen in the latest successful auction poll.",
  no_observed_bids: "The API returned no bids. Mempool readiness and complete bid coverage are unknown.",
  stale: "The last sample is retained below. Its freshness is no longer established.",
  rpc_error: "The BMM worker reported a failure. The last sample is retained; this does not mean the auction is empty.",
  unavailable: "The current source has not advertised the required BMM capability.",
  awaiting_observation: "Waiting for a successfully imported and interpreted BMM sample.",
  interpretation_error: "The latest sample could not be interpreted. Inspect its evidence.",
  inconsistent_snapshot: "The latest sample lacks matching tip reads. Retained bids do not establish a current auction.",
  awaiting_current_parent: "The latest sample belongs to a different parent from the latest observed tip.",
};
export function BmmAuctions({ initial }: { initial: Auctions | null }) {
  const query = useQuery({ queryKey: ["bmm"], queryFn: getAuctions, initialData: initial ?? undefined, refetchInterval: 5_000 });
  const data = query.data;
  return <main className="detail-shell">
    <div className="eyebrow">BIP301 · OBSERVED AUCTIONS</div><h1>BMM auctions</h1>
    <p className="lede">Explore unconfirmed bids sampled by the Betanet monitor. Requests can enter and leave between polls. Mempool readiness and complete bid coverage are unknown.</p>
    <section className="panel compact-panel" aria-live="polite">
      <h2>{query.isError ? "API unavailable" : data?.state.replaceAll("_", " ") ?? "Awaiting data"}</h2>
      <p>{query.isError ? "Retrying. Any sample below is the last successfully loaded view." : data ? explanations[data.state] : "Waiting for the first synchronized sample."}</p>
      {data?.observed_at && <dl className="facts"><dt>Last observation</dt><dd><time>{data.observed_at}</time></dd><dt>Parent block</dt><dd className="hash">{data.parent_hash ?? "Unknown"}</dd><dt>Occurrence / fact</dt><dd>{data.observation_id} / {data.source_event_id}</dd></dl>}
      {data?.evidence_url && <Link className="text-link" href={data.evidence_url}>Inspect this observation’s evidence →</Link>}
    </section>
    {!!data?.requests.length && <section className="panel compact-panel table-scroll" aria-label="Observed bids"><table>
      <thead><tr><th>Slot</th><th>Bid (satoshis)</th><th>Transaction</th><th>Critical hash</th></tr></thead>
      <tbody>{data.requests.map((bid, index) => <tr key={bid.txid + ":" + index}><td className="slot">#{bid.slot}</td><td className="mono">{BigInt(bid.bid_sats).toLocaleString("en-US")}</td><td className="hash">{bid.txid}</td><td className="hash">{bid.critical_hash}</td></tr>)}</tbody>
    </table></section>}
    <section className="panel compact-panel"><h2>Three different observations</h2><div className="explanation-grid">
      <div><h3>Auction sample</h3><p>Unconfirmed requests seen at a polling instant. A bid is an exact amount in satoshis.</p></div>
      <div><h3>Confirmed request</h3><p>A request recorded in an L1 block. Confirmation is separate evidence and is not inferred from a disappearing bid.</p></div>
      <div><h3>BMM commitment</h3><p>A commitment included in a block. It does not establish the availability or validity of an L2 block.</p></div>
    </div></section>
    <BmmHistory/>
    <ProtocolList resource="bmm/history" heading="Auction sampling history"/>
    <ProtocolList resource="bmm/confirmed" heading="Confirmed BMM requests"/>
    <ProtocolList resource="bmm/commitments" heading="Slot BMM commitments"/>
  </main>;
}
