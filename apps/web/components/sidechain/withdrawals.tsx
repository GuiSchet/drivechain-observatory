"use client";
import Link from "next/link";
import { at, object, onChainM6id } from "@/lib/protocol";
import { outcomeOf } from "@/lib/explain";
import { n, proofHref, useProtocolPage } from "@/lib/live";
import { readingTip } from "@/lib/activity";
import type { ProtocolItem, SidechainStats } from "@/lib/types";
import { ConfidenceChip, CopyHash, LivePanel, Stat } from "@/components/learn/primitives";
import { WithdrawalOutcomes, WithdrawalVotes } from "@/components/live/money";

/** One withdrawal attempt: a bundle proposed at one height, with the records of its stages. */
type Attempt = { m6id: string; proposed?: number; reading?: ProtocolItem; outcomes: ProtocolItem[]; ambiguous: boolean };

/**
 * Joins a bundle's records into one row per attempt. A vote reading and its "Submitted" outcome
 * share the proposal height; a payout or failure names only the M6 id, so it goes to the latest
 * attempt proposed before it that has not ended, and is marked ambiguous when more than one could match.
 */
function attempts(items: ProtocolItem[]): Attempt[] {
  const byId = new Map<string, Attempt[]>();
  const attempt = (m6id: string, proposed: number | undefined) => {
    const list = byId.get(m6id) ?? [];
    byId.set(m6id, list);
    let a = list.find(x => x.proposed === proposed);
    if (!a) list.push(a = { m6id, proposed, outcomes: [], ambiguous: false });
    return a;
  };
  const finals: ProtocolItem[] = [];
  for (const i of items) {
    if (i.kind === "bundle") {
      const proposed = at(i.data, "bundle", "proposal_height");
      attempt(String(at(i.data, "bundle", "m6id") ?? ""), typeof proposed === "number" ? proposed : undefined).reading = i;
    } else if (outcomeOf(i) === "Submitted") attempt(String(object(i.data).m6id ?? ""), i.height ?? undefined).outcomes.push(i);
    else finals.push(i);
  }
  const ended = (a: Attempt) => a.outcomes.some(o => outcomeOf(o) !== "Submitted");
  for (const i of finals.sort((x, y) => (x.height ?? Infinity) - (y.height ?? Infinity))) {
    const m6id = String(object(i.data).m6id ?? ""), height = i.height ?? Infinity;
    // Attempts already paid or failed cannot end again.
    const before = (byId.get(m6id) ?? []).filter(a => !ended(a) && (a.proposed == null || a.proposed <= height));
    const target = before.sort((x, y) => (y.proposed ?? -1) - (x.proposed ?? -1))[0] ?? attempt(m6id, undefined);
    target.outcomes.push(i);
    if (before.length > 1) target.ambiguous = true;
  }
  return [...byId.values()].flat().sort((x, y) => (y.proposed ?? -1) - (x.proposed ?? -1));
}

/** Every bundle this slot has had, pending or finished: one row per attempt, with its stages. */
function BundleTable({ slot, stats }: { slot: number; stats?: SidechainStats }) {
  const page = useProtocolPage("bundle-attempts", `slot=${slot}&limit=200`);
  const items = page.data?.items ?? [], dataset = page.data?.context.meta.dataset_id;
  const rows = attempts(items);
  const payouts = new Map((stats?.treasury.steps ?? []).filter(s => s.change === "withdrawal").map(s => [s.sequence, s.txid]));
  return <LivePanel title="Every withdrawal bundle" status={{ pending: page.isPending, error: page.isError && !items.length, empty: !items.length, emptyText: "This sidechain has not proposed a withdrawal bundle yet." }}
    footer="One row per bundle proposal, joining its records: put up for a vote (Submitted, recorded in a block), the last vote reading while pending, and the payout or failure recorded in a block. M6 ids are in M3 order, as the coinbase vote message and mining pools show them.">
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>M6 id</th><th className="num">Proposed in</th><th>State</th><th className="num">Votes</th><th className="num">At block</th><th>Payout transaction</th><th>Quality</th><th>Evidence</th></tr></thead>
      <tbody>{rows.map(a => {
        const final = a.outcomes.find(o => outcomeOf(o) !== "Submitted"), outcome = final ? outcomeOf(final) : undefined;
        const r = a.reading, votes = r ? at(r.data, "bundle", "vote_count") : undefined;
        const seq = final ? at(final.data, "state", "Succeeded", "sequence_number") : undefined;
        const state = outcome ?? (r?.is_current === false ? "no longer pending" : r ? "pending" : "Submitted");
        const latest = final ?? r ?? a.outcomes[0];
        const stages = [...a.outcomes.filter(o => o !== final), r, final].filter((x): x is ProtocolItem => !!x);
        return <tr key={`${a.m6id}:${a.proposed ?? "?"}`}>
          <td><CopyHash value={a.m6id ? onChainM6id(a.m6id) : undefined}/></td>
          <td className="num">{a.proposed != null ? n(a.proposed) : "—"}</td>
          <td>{state}{a.ambiguous ? <span className="muted"> · this id was proposed more than once; the outcome may belong to another proposal</span> : null}</td>
          <td className="num">{typeof votes === "number" ? n(votes) : "—"}</td>
          <td className="num">{final?.height != null ? n(final.height) : r && readingTip(r) != null ? `tip ${n(readingTip(r))}` : a.proposed != null ? n(a.proposed) : "—"}</td>
          <td>{outcome === "Succeeded" ? <CopyHash value={payouts.get(seq != null ? String(seq) : null) ?? undefined}/> : <span className="muted">—</span>}</td>
          <td><ConfidenceChip quality={latest?.quality ?? null}/></td>
          <td>{stages.map((i, k) => { const proof = proofHref(i, dataset); return proof ? <Link key={i.id} className="proof-link" href={proof}>{k ? " · " : ""}{i.kind === "bundle" ? "votes" : (outcomeOf(i) ?? "outcome").toLowerCase()}</Link> : null; })}</td>
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
