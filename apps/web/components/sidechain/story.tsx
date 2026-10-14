"use client";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { object } from "@/lib/protocol";
import { declarationOf, formatCoins, formatSats } from "@/lib/explain";
import { activeSidechains, known, n, useNetworkParams, useObservatory, useProtocolPage } from "@/lib/live";
import { useSidechainStats, utc } from "@/lib/stats";
import { useUnit } from "@/lib/unit";
import { useViewMode } from "@/lib/view-mode";
import { CopyHash, GoDeeper, LivePanel } from "@/components/learn/primitives";
import { ActivityFeed } from "@/components/live/activity";
import { PageHead } from "@/components/view-toggle";
import { SectionNav, SidechainKpis } from "./kpis";
import { TreasurySection } from "./treasury";
import { WithdrawalsSection } from "./withdrawals";
import { MiningSection } from "./mining";
import { IdentitySection, type Instance } from "./identity";
import { DevelopersSection } from "./developers";

export function SidechainStory({ slot }: { slot: number }) {
  const observatory = useObservatory(), unit = useUnit(), { params } = useNetworkParams(), { technical } = useViewMode();
  const sc = activeSidechains(observatory.data).find(s => s.slot === slot), complete = known(observatory.data, "sidechains");
  const treasury = object(object(observatory.data?.state).treasury)[String(slot)];
  const stats = useSidechainStats(slot);
  const instances = useProtocolPage("sidechain-instances", `slot=${slot}&scope=all&limit=20`);
  const history = new Map<string, Instance>();
  for (const item of instances.data?.items ?? []) {
    const key = item.entity_id ?? item.id;
    if (history.has(key)) continue;
    const d = object(item.data), s = object(d.sidechain ?? d);
    history.set(key, { title: declarationOf(s).title, proposal: s.proposal_height, activation: s.activation_height, ended: d.ended_height ?? d.last_active_height, current: item.is_current });
  }
  // Activating over an earlier instance needs the higher "used slot" threshold.
  const replaced = sc?.activationHeight != null && [...history.values()].some(h => typeof h.activation === "number" && h.activation < sc.activationHeight!);
  const needed = replaced ? params.usedThreshold : params.unusedThreshold;
  const name = sc?.title ?? `slot #${slot}`, s = stats.data, failed = stats.isError && !s;
  const sections: [string, string][] = sc
    ? [["summary", "Summary"], ["treasury", "Treasury & deposits"], ["withdrawals", "Withdrawals"], ["mining", "Merged mining"], ["identity", "Identity"], ["data", "Data"]]
    : [["identity", "Slot history"], ["data", "Data"]];
  return <main className="page-shell wide">
    <Link className="back-link" href="/sidechains"><ArrowLeft size={14}/> All sidechains</Link>
    <PageHead eyebrow={`SLOT #${slot}`}/>
    <h1>{sc?.title ?? (observatory.isPending ? "Loading…" : `Slot #${slot}`)}</h1>
    {sc ? <p className="lede">{sc.description ?? "No description declared."}</p>
      : !observatory.isPending && (complete
        ? <p className="lede">No sidechain is active in this slot right now. Any earlier sidechains in it are listed below. <Link className="text-link" href="/learn/slots">What is a slot?</Link></p>
        : <p className="lede">The latest reading of active sidechains is incomplete, so we can&apos;t say yet whether this slot is in use. Earlier sidechains in it are listed below.</p>)}
    {sc && <SidechainKpis sc={sc} stats={s} failed={failed} technical={technical}/>}
    {sc && failed && <p className="inline-notice" role="status">This sidechain&apos;s figures did not load: the Observatory API took too long or failed. Panels that need them show &quot;Unavailable&quot;. <button type="button" onClick={() => stats.refetch()} disabled={stats.isFetching}>{stats.isFetching ? "Retrying…" : "Try again"}</button></p>}
    <SectionNav sections={sections}/>

    {sc && <>
      <section id="summary" className="sc-section">
        {technical ? <LivePanel title="Facts at a glance">
          <dl className="mini-facts">
            <dt>Slot</dt><dd>#{slot}</dd>
            <dt>Declaration hash</dt><dd><CopyHash value={sc.descriptionHash} full/></dd>
            <dt>Proposed / activated</dt><dd>block {n(sc.proposalHeight)} / block {n(sc.activationHeight)} ({n(sc.activationHeight != null && sc.proposalHeight != null ? sc.activationHeight - sc.proposalHeight : undefined)} blocks)</dd>
            <dt>Approvals</dt><dd>{n(sc.voteCount)}, needed more than {n(needed)} ({replaced ? "used slot" : "empty slot"})</dd>
            <dt>Treasury</dt><dd>{treasury === null ? "no output yet" : treasury ? <>{formatSats(object(treasury).value_sats, unit)}, output #{String(object(treasury).sequence_number ?? "?")}{s?.treasury.read_at_tip_height != null ? `, first read at tip ${n(s.treasury.read_at_tip_height)}${s.treasury.confirmed_at_tip_height != null && s.treasury.confirmed_at_tip_height !== s.treasury.read_at_tip_height ? `, still the value at tip ${n(s.treasury.confirmed_at_tip_height)}` : ""}` : ""}</> : "unknown"}</dd>
            <dt>Figures as of</dt><dd>{s ? <>block {n(s.context.anchor_height)} · build {s.context.build_id ?? "?"} · computed {utc(s.generated_at)}</> : "loading"}</dd>
          </dl>
          {s && <GoDeeper summary="the limits of these figures"><ul className="plain-list">{s.notes.map(note => <li key={note}>{note}</li>)}</ul></GoDeeper>}
        </LivePanel>
        : <div className="story">
          <h2>Its story so far</h2>
          <ol className="story-steps">
            <li><span className="story-num">1</span><div><strong>Proposed in block {n(sc.proposalHeight)}</strong><p>A miner wrote its declaration into a block. <Link className="text-link" href="/learn/creating-a-sidechain">How proposals work</Link></p></div></li>
            <li><span className="story-num">2</span><div><strong>Activated in block {n(sc.activationHeight)}</strong><p>After {n(sc.activationHeight != null && sc.proposalHeight != null ? sc.activationHeight - sc.proposalHeight : undefined)} blocks it had {n(sc.voteCount)} miner votes, more than the {n(needed)} needed {replaced ? "to replace the previous sidechain in this slot" : "for an empty slot"}.</p></div></li>
            <li><span className="story-num">3</span><div><strong>{treasury === null ? "No coins deposited yet" : treasury ? `Holds ${formatCoins(object(treasury).value_sats, true)} on L1` : "Treasury unknown"}</strong><p>{treasury ? <>{formatSats(object(treasury).value_sats, unit)} in treasury output #{String(object(treasury).sequence_number ?? "?")}. </> : null}<Link className="text-link" href="/learn/deposits">How deposits work</Link></p></div></li>
          </ol>
        </div>}
      </section>
      <section id="treasury" className="sc-section">
        <h2 className="story-h2">Coins in and out</h2>
        <TreasurySection slot={slot} name={name} stats={s} failed={failed} technical={technical}/>
      </section>
      <section id="withdrawals" className="sc-section">
        <h2 className="story-h2">Withdrawals</h2>
        {!technical && <p className="section-lede">Coins leave a treasury in bundles that L1 miners vote on for months. <Link className="text-link" href="/learn/withdrawals">How withdrawals work</Link></p>}
        <WithdrawalsSection slot={slot} stats={s} technical={technical}/>
      </section>
      <section id="mining" className="sc-section">
        <h2 className="story-h2">Merged mining</h2>
        <p className="section-lede">L1 records a commitment to a sidechain block hash. It does not see or check what is inside that block; sidechain nodes do. <Link className="text-link" href="/learn/merged-mining">How BMM works</Link></p>
        <MiningSection slot={slot} name={name} stats={s} failed={failed} technical={technical}/>
      </section>
    </>}

    <section id="identity" className="sc-section">
      <h2 className="story-h2">{sc ? "Identity and slot history" : "Sidechains that have used this slot"}</h2>
      <IdentitySection slot={slot} sc={sc} instances={[...history.values()]} replaced={replaced} technical={technical}/>
    </section>
    <section id="data" className="sc-section">
      <h2 className="story-h2">Take the data with you</h2>
      <DevelopersSection slot={slot} name={sc?.title ?? `slot #${slot}`} technical={technical}/>
    </section>
    <GoDeeper summary={`everything recorded for ${name}`}>
      <p>Every event and change in this slot, newest block first, including the ones shown above.</p>
      <ActivityFeed slot={slot} limit={30} paged/>
    </GoDeeper>
  </main>;
}
