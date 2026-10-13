"use client";
import Link from "next/link";
import { at, object, onChainM6id } from "@/lib/protocol";
import { outcomeOf } from "@/lib/explain";
import { n, proofHref, useProtocolPage } from "@/lib/live";
import { readingTip } from "@/lib/activity";
import type { SidechainStats } from "@/lib/types";
import { ConfidenceChip, CopyHash, LivePanel, Stat } from "@/components/learn/primitives";
import { WithdrawalOutcomes, WithdrawalVotes } from "@/components/live/money";

/** Every bundle this slot has had, pending or finished, as its latest record says. */
function BundleTable({ slot, stats }: { slot: number; stats?: SidechainStats }) {
  const page = useProtocolPage("bundle-attempts", `slot=${slot}&limit=200`);
  const items = page.data?.items ?? [], dataset = page.data?.context.meta.dataset_id;
  const payouts = new Map((stats?.treasury.steps ?? []).filter(s => s.change === "withdrawal").map(s => [s.sequence, s.txid]));
  return <LivePanel title="Every withdrawal bundle" status={{ pending: page.isPending, error: page.isError && !items.length, empty: !items.length, emptyText: "This sidechain has not proposed a withdrawal bundle yet." }}
    footer="One row per bundle, from its latest record: the last vote reading while pending, or the outcome recorded in a block. M6 ids are in M3 order, as the coinbase vote message and mining pools show them.">
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>M6 id</th><th className="num">Proposed in</th><th>State</th><th className="num">Votes</th><th className="num">At block</th><th>Payout transaction</th><th>Quality</th><th/></tr></thead>
      <tbody>{items.map(i => {
        const outcome = i.kind === "bundle_outcome" ? outcomeOf(i) : undefined;
        const stored = String(i.kind === "bundle_outcome" ? object(i.data).m6id ?? "" : at(i.data, "bundle", "m6id") ?? "");
        const votes = at(i.data, "bundle", "vote_count"), proposed = at(i.data, "bundle", "proposal_height");
        const seq = at(i.data, "state", "Succeeded", "sequence_number"), proof = proofHref(i, dataset);
        return <tr key={i.id}>
          <td><CopyHash value={stored ? onChainM6id(stored) : undefined}/></td>
          <td className="num">{typeof proposed === "number" ? n(proposed) : "—"}</td>
          <td>{outcome ?? (i.is_current === false ? "no longer pending" : "pending")}</td>
          <td className="num">{typeof votes === "number" ? n(votes) : "—"}</td>
          <td className="num">{i.height != null ? n(i.height) : readingTip(i) != null ? `tip ${n(readingTip(i))}` : "—"}</td>
          <td>{outcome === "Succeeded" ? <CopyHash value={payouts.get(seq != null ? String(seq) : null) ?? undefined}/> : <span className="muted">—</span>}</td>
          <td><ConfidenceChip quality={i.quality}/></td>
          <td>{proof && <Link className="proof-link" href={proof}>evidence</Link>}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </LivePanel>;
}

export function WithdrawalsSection({ slot, stats, technical }: { slot: number; stats?: SidechainStats; technical: boolean }) {
  const w = stats?.withdrawals;
  return <>
    {technical && w && <div className="stat-grid compact-stats">
      <Stat label="Pending" value={n(w.pending.length)}/>
      <Stat label="Paid out" value={n(w.succeeded)} quality={w.succeeded ? "observed" : undefined}/>
      <Stat label="Failed" value={n(w.failed)} quality={w.failed ? "observed" : undefined}/>
      <Stat label="Put up for a vote" value={n(w.submitted)} hint="Submitted outcomes recorded in blocks"/>
    </div>}
    <WithdrawalVotes slot={slot} projections={w?.pending} technical={technical}/>
    {technical ? <BundleTable slot={slot} stats={stats}/> : <WithdrawalOutcomes slot={slot} paged/>}
  </>;
}
