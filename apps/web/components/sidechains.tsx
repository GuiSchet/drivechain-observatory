"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getAuctions, getJson } from "@/lib/api";
import { object } from "@/lib/protocol";
import { declarationOf, formatCoins, formatSats } from "@/lib/explain";
import { activeSidechains, n, proofHref, snapshotOf, useNetworkParams, useObservatory, useProtocolPage } from "@/lib/live";
import type { BmmMetrics } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { ConfidenceChip, GoDeeper, LivePanel, Term } from "@/components/learn/primitives";
import { ActivityFeed } from "@/components/live/activity";
import { TreasuryHistory, WithdrawalOutcomes, WithdrawalVotes } from "@/components/live/money";
import { BmmBids, BmmCommitments } from "@/components/live/bmm";

function useBmmRows() {
  const metrics = useQuery({ queryKey: ["protocol", "bmm", "metrics", "window_blocks=24"], queryFn: () => getJson<BmmMetrics>("/api/v1/bmm?window_blocks=24") });
  return new Map((metrics.data?.slots ?? []).map(r => [r.slot, r]));
}

export function SidechainGallery() {
  const observatory = useObservatory(), unit = useUnit(), bmm = useBmmRows();
  const auctions = useQuery({ queryKey: ["bmm"], queryFn: getAuctions, refetchInterval: 5_000 });
  const state = object(observatory.data?.state), treasury = object(state.treasury), bundles = Object.keys(object(state.bundles));
  const active = activeSidechains(observatory.data);
  const snap = snapshotOf(observatory.data, "active_sidechains");
  return <main className="page-shell wide">
    <div className="eyebrow">THE SIDECHAINS OF BETANET</div><h1>Meet the sidechains</h1>
    <p className="lede">Each card is one active sidechain: what it declares to be, how many coins it holds on L1, and how often L1 miners committed to one of its blocks (blind merged mining). Open one to follow its whole story. New to the terms? Start with <Link className="text-link" href="/learn/slots">slots and sidechains</Link>.</p>
    {observatory.isPending && <p className="live-empty" role="status">Loading sidechains…</p>}
    {observatory.isError && !observatory.data && <p className="live-empty" role="status">The sidechain list is unavailable right now; retrying automatically.</p>}
    {snap && <p className="gallery-meta"><ConfidenceChip quality={snap.quality}/> {active.length} active sidechains in the latest reading · <Link className="text-link" href={proofHref(snap, observatory.data?.context.meta.dataset_id) ?? "#"}>See the proof</Link></p>}
    <ul className="sidechain-cards">{active.map(s => {
      const ctip = treasury[String(s.slot)], value = ctip ? object(ctip).value_sats : undefined;
      const pending = bundles.filter(k => k.startsWith(`${s.slot}:`)).length;
      const row = bmm.get(s.slot), bid = auctions.data?.requests.find(r => r.slot === s.slot);
      return <li key={s.slot}><Link href={`/sidechains/${s.slot}`}>
        <span className="sc-slot">Slot #{s.slot}</span>
        <strong className="sc-title">{s.title ?? "Unnamed sidechain"}</strong>
        <p className="sc-desc">{s.description ?? "No description declared."}</p>
        <dl>
          <div><dt>Locked on L1</dt><dd>{ctip === null ? "nothing yet" : value ? formatCoins(value, true) : "unknown"}{value ? <small>{formatSats(value, unit)}</small> : null}</dd></div>
          <div><dt>BMM commitments, last 24 L1 blocks</dt><dd>{row ? `in ${row.present} of ${row.covered} observed` : "unknown"}{bid ? <small>open bid {formatSats(bid.bid_sats, unit)}</small> : null}</dd></div>
          <div><dt>Withdrawals in vote</dt><dd>{pending}</dd></div>
          <div><dt>Active since</dt><dd>block {n(s.activationHeight)}</dd></div>
        </dl>
        <span className="sc-open">Follow its story <ArrowRight size={14}/></span>
      </Link></li>;
    })}</ul>
    <p className="scope-note">{256 - active.length} of 256 slots are empty right now.</p>
  </main>;
}

export function SidechainStory({ slot }: { slot: number }) {
  const observatory = useObservatory(), unit = useUnit(), { params } = useNetworkParams();
  const sc = activeSidechains(observatory.data).find(s => s.slot === slot);
  const treasury = object(object(observatory.data?.state).treasury)[String(slot)];
  const instances = useProtocolPage("sidechain-instances", `slot=${slot}&scope=all&limit=20`);
  const history = new Map<string, { title?: string; proposal?: unknown; activation?: unknown; ended?: unknown; current?: boolean | null }>();
  for (const item of instances.data?.items ?? []) {
    const key = item.entity_id ?? item.id;
    if (history.has(key)) continue;
    const d = object(item.data), s = object(d.sidechain ?? d);
    history.set(key, { title: declarationOf(s).title, proposal: s.proposal_height, activation: s.activation_height, ended: d.ended_height ?? d.last_active_height, current: item.is_current });
  }
  // Activating over an earlier instance needs the higher "used slot" threshold.
  const replaced = sc?.activationHeight != null && [...history.values()].some(h => typeof h.activation === "number" && h.activation < sc.activationHeight!);
  const needed = replaced ? params.usedThreshold : params.unusedThreshold;
  const decl = sc ? declarationOf(object(object(observatory.data?.state).active)[String(slot)]) : undefined;
  return <main className="page-shell wide">
    <Link className="back-link" href="/sidechains"><ArrowLeft size={14}/> All sidechains</Link>
    <div className="eyebrow">SLOT #{slot}</div>
    <h1>{sc?.title ?? (observatory.isPending ? "Loading…" : `Slot #${slot}`)}</h1>
    {sc ? <p className="lede">{sc.description ?? "No description declared."}</p>
      : !observatory.isPending && <p className="lede">No sidechain is active in this slot right now. Any earlier sidechains in it are listed below. <Link className="text-link" href="/learn/slots">What is a slot?</Link></p>}

    {sc && <>
      <section className="story">
        <h2>Its story so far</h2>
        <ol className="story-steps">
          <li><span className="story-num">1</span><div><strong>Proposed in block {n(sc.proposalHeight)}</strong><p>A miner wrote its declaration into a block. <Link className="text-link" href="/learn/creating-a-sidechain">How proposals work</Link></p></div></li>
          <li><span className="story-num">2</span><div><strong>Activated in block {n(sc.activationHeight)}</strong><p>After {n(sc.activationHeight != null && sc.proposalHeight != null ? sc.activationHeight - sc.proposalHeight : undefined)} blocks it had {n(sc.voteCount)} miner votes, more than the {n(needed)} needed {replaced ? "to replace the previous sidechain in this slot" : "for an empty slot"}.</p></div></li>
          <li><span className="story-num">3</span><div><strong>{treasury === null ? "No coins deposited yet" : treasury ? `Holds ${formatCoins(object(treasury).value_sats, true)} on L1` : "Treasury unknown"}</strong><p>{treasury ? <>{formatSats(object(treasury).value_sats, unit)} in treasury output #{String(object(treasury).sequence_number ?? "?")}. </> : null}<Link className="text-link" href="/learn/deposits">How deposits work</Link></p></div></li>
        </ol>
      </section>
      <h2 className="story-h2">Coins in and out</h2>
      <TreasuryHistory fixedSlot={slot}/>
      <LivePanel title={`Deposits into ${sc.title ?? `slot #${slot}`}`}><ActivityFeed kind="deposit" slot={slot} limit={12} paged withTreasury/></LivePanel>
      <WithdrawalVotes slot={slot}/>
      <WithdrawalOutcomes slot={slot}/>
      <h2 className="story-h2">Merged-mining commitments</h2>
      <p className="section-lede">L1 records a commitment to a sidechain block hash. It does not see or check what is inside that block; sidechain nodes do. <Link className="text-link" href="/learn/merged-mining">How BMM works</Link></p>
      <BmmCommitments slot={slot}/>
      <BmmBids slot={slot}/>
      <GoDeeper summary="its full declaration">
        <dl className="mini-facts">
          <dt>Title</dt><dd>{decl?.title ?? "—"}</dd><dt>Description</dt><dd>{decl?.description ?? "—"}</dd>
          <dt>Hash 1 (release archive)</dt><dd className="hash">{decl?.hash1 ?? "—"}</dd><dt>Hash 2 (git commit)</dt><dd className="hash">{decl?.hash2 ?? "—"}</dd>
          <dt>Declaration hash</dt><dd className="hash">{sc.descriptionHash ?? "—"}</dd>
        </dl>
        <p>The declaration hash, together with the slot and heights, identifies this sidechain. The two other hashes are meant to identify its software, but L1 does not enforce them. <Term id="declaration">More about declarations</Term>.</p>
      </GoDeeper>
    </>}

    <h2 className="story-h2">Sidechains that have used this slot</h2>
    <LivePanel title={`Instances in slot #${slot}`} status={{ pending: instances.isPending, error: instances.isError && !history.size, empty: !history.size, emptyText: "No sidechain has been recorded in this slot." }}>
      <ul className="plain-list">{[...history.values()].map((h, i) => <li key={i}><strong>{h.title ?? "Unnamed"}</strong>: proposed in block {typeof h.proposal === "number" ? n(h.proposal) : "unknown"}, active from block {typeof h.activation === "number" ? n(h.activation) : "unknown"}{typeof h.ended === "number" ? `, last seen active at block ${n(h.ended)}` : h.current ? ", active now" : ""}.</li>)}</ul>
    </LivePanel>
    <GoDeeper summary={`everything recorded for ${sc?.title ?? `slot #${slot}`}`}>
      <p>Every event and change in this slot, newest block first, including the ones shown above.</p>
      <ActivityFeed slot={slot} limit={30} paged/>
    </GoDeeper>
  </main>;
}
