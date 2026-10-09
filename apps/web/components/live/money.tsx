"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { apiQuery, object, at } from "@/lib/protocol";
import { groupActivity, readingTip } from "@/lib/activity";
import type { ProtocolItem, ProtocolPage } from "@/lib/types";
import { blockNumber, declarationOf, depositAddress, formatCoinPair, formatCoins, formatSats, sats, short, sidechainLabel, timeAgo } from "@/lib/explain";
import { activeSidechains, n, proofHref, snapshotOf, useCoverageGaps, useNetworkParams, useObservatory, useProtocolPage, useSidechainNames, weakestQuality } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import { ConfidenceChip, GoDeeper, LivePanel, Stat } from "@/components/learn/primitives";
import { ReadingsChart } from "./readings-chart";
import { ActivityFeed } from "./activity";
import { useNow } from "./basics";

export function ParamsPanel({ show }: { show: ("activation" | "withdrawal")[] }) {
  const { params, isPending, isError } = useNetworkParams();
  return <LivePanel title="The rules Betanet is running" quality={params.item?.quality ?? null} proof={proofHref(params.item, params.dataset)}
    status={{ pending: isPending, error: isError && !params.item, empty: !params.item, emptyText: "The enforcer has not reported its parameters yet." }}>
    <p className="live-lede">These numbers come straight from the enforcer. The rule is always <strong>more than</strong> the threshold, before the proposal is older than the maximum age.</p>
    <div className="stat-grid">
      {show.includes("activation") && <>
        <Stat label="New sidechain, empty slot" value={`> ${n(params.unusedThreshold)} votes`} hint={`within ${n(params.unusedMaxAge)} blocks`}/>
        <Stat label="New sidechain, replacing one" value={`> ${n(params.usedThreshold)} votes`} hint={`within ${n(params.usedMaxAge)} blocks`}/>
      </>}
      {show.includes("withdrawal") && <Stat label="Withdrawal bundle" value={`> ${n(params.withdrawalThreshold)} votes`} hint={`within ${n(params.withdrawalMaxAge)} blocks`}/>}
    </div>
  </LivePanel>;
}

/** Proposals the enforcer currently reports as being voted on. */
export function ProposalsNow() {
  const observatory = useObservatory(), { params } = useNetworkParams();
  const state = object(observatory.data?.state);
  const used = new Set(activeSidechains(observatory.data).map(s => s.slot));
  const proposals = Object.values(object(state.proposals)).map(v => object(object(v).proposal ?? v));
  const snap = snapshotOf(observatory.data, "sidechain_proposals"), dataset = observatory.data?.context.meta.dataset_id;
  const tip = at(snap?.data, "observation_window", "reference_tip_height");
  return <LivePanel title="Proposals being voted on" quality={snap?.quality ?? null} proof={proofHref(snap, dataset)}
    status={{ pending: observatory.isPending, error: observatory.isError && !observatory.data, empty: !proposals.length,
      emptyText: <p>{state.proposals_complete === true ? "No sidechain is being voted on right now." : "The latest reading of proposals is incomplete, so we can't say whether any are pending."} Below you can see how the current sidechains got through this step.</p> }}>
    <div className="vote-cards">{proposals.map((p, i) => {
      const slot = typeof p.sidechain_number === "number" ? p.sidechain_number : undefined;
      const votes = typeof p.vote_count === "number" ? p.vote_count : undefined;
      const height = typeof p.proposal_height === "number" ? p.proposal_height : undefined;
      const replacing = slot != null && used.has(slot);
      const threshold = replacing ? params.usedThreshold : params.unusedThreshold, maxAge = replacing ? params.usedMaxAge : params.unusedMaxAge;
      const age = typeof tip === "number" && height != null ? tip - height : undefined;
      return <VoteCard key={i} title={declarationOf(p).title ?? `Proposal for slot #${slot ?? "?"}`} subtitle={`slot #${slot ?? "?"} · ${replacing ? "replaces the current sidechain" : "empty slot"}`} votes={votes} threshold={threshold} age={age} maxAge={maxAge}/>;
    })}</div>
  </LivePanel>;
}

function Meter({ value, max, label }: { value?: number; max?: number; label: string }) {
  const pct = value != null && max ? Math.min(100, (value / max) * 100) : 0;
  return <div className="meter" role="img" aria-label={label}><div style={{ width: `${pct}%` }}/></div>;
}

export function VoteCard({ title, subtitle, votes, threshold, age, maxAge, footer }: { title: string; subtitle: string; votes?: number; threshold?: number; age?: number; maxAge?: number; footer?: React.ReactNode }) {
  const left = age != null && maxAge != null ? maxAge - age : undefined;
  return <article className="vote-card">
    <h4>{title}</h4><p className="vote-sub">{subtitle}</p>
    <div className="vote-row"><span>Votes</span><strong>{n(votes)}</strong><span>needs more than {n(threshold)}</span></div>
    <Meter value={votes} max={threshold} label={`${n(votes)} of more than ${n(threshold)} votes`}/>
    <div className="vote-row"><span>Age</span><strong>{n(age)} blocks</strong><span>limit {n(maxAge)} blocks</span></div>
    <Meter value={age} max={maxAge} label={`Age ${n(age)} of ${n(maxAge)} blocks`}/>
    {left != null && left >= 0 && <p className="vote-note">If it does not pass within the next {n(left)} blocks, it expires. Votes can also go down, so this is a reading, not a forecast.</p>}
    {footer}
  </article>;
}

/** How each current sidechain got from proposal to activation. */
export function ActivationTimeline() {
  const observatory = useObservatory(), { params } = useNetworkParams();
  const active = activeSidechains(observatory.data).filter(s => s.proposalHeight != null && s.activationHeight != null);
  const min = Math.min(...active.map(s => s.proposalHeight!)), max = Math.max(...active.map(s => s.activationHeight!));
  const span = Math.max(1, max - min);
  const snap = snapshotOf(observatory.data, "active_sidechains");
  return <LivePanel title="How today's sidechains were activated" quality={snap?.quality ?? null} proof={proofHref(snap, observatory.data?.context.meta.dataset_id)}
    status={{ pending: observatory.isPending, error: observatory.isError && !observatory.data, empty: !active.length, emptyText: "No active sidechain has been reported yet." }}>
    <p className="live-lede">Each bar starts at the block where the sidechain was proposed and ends where it activated. The enforcer still reports the vote count each one reached.</p>
    <ol className="timeline">{active.map(s => <li key={s.slot}>
      <span className="tl-name"><Link href={`/sidechains/${s.slot}`}>{s.title ?? `slot #${s.slot}`}</Link><small>#{s.slot}</small></span>
      <span className="tl-track"><span className="tl-bar" style={{ left: `${((s.proposalHeight! - min) / span) * 100}%`, width: `${Math.max(1.5, ((s.activationHeight! - s.proposalHeight!) / span) * 100)}%` }}/></span>
      <span className="tl-info">{n(s.activationHeight! - s.proposalHeight!)} blocks · {n(s.voteCount)} votes</span>
    </li>)}</ol>
    <p className="live-note">Blocks {n(min)} → {n(max)}. For an empty slot the rule is more than {n(params.unusedThreshold)} votes within {n(params.unusedMaxAge)} blocks; to replace a sidechain, more than {n(params.usedThreshold)} within {n(params.usedMaxAge)}.</p>
  </LivePanel>;
}

export function TreasuryBars() {
  const observatory = useObservatory(), unit = useUnit(), names = useSidechainNames();
  const treasury = object(object(observatory.data?.state).treasury);
  const rows = activeSidechains(observatory.data).map(s => {
    const raw = treasury[String(s.slot)];
    return { slot: s.slot, value: raw === undefined ? undefined : raw === null ? null : sats(object(raw).value_sats) ?? undefined, seq: raw ? object(raw).sequence_number : undefined };
  }).sort((a, b) => (b.value ?? BigInt(-1)) > (a.value ?? BigInt(-1)) ? 1 : -1);
  const top = rows.reduce((m, r) => r.value && r.value > m ? r.value : m, BigInt(1));
  const dataset = observatory.data?.context.meta.dataset_id;
  const reads = rows.map(r => snapshotOf(observatory.data, "ctip", r.slot));
  return <LivePanel title="What each treasury holds" quality={observatory.data ? weakestQuality(reads) : undefined}
    status={{ pending: observatory.isPending, error: observatory.isError && !observatory.data, empty: !rows.length }}
    footer="Each value is the latest separate reading of that sidechain's treasury output. Bars are to scale with the largest treasury.">
    <ol className="bars">{rows.map(r => {
      const snap = snapshotOf(observatory.data, "ctip", r.slot), proof = proofHref(snap, dataset);
      return <li key={r.slot}>
        <span className="bar-name"><Link href={`/sidechains/${r.slot}`}>{sidechainLabel(r.slot, names)}</Link></span>
        <span className="bar-track">{r.value ? <span className="bar-fill" style={{ width: `${Math.max(0.8, Number((r.value * BigInt(10000)) / top) / 100)}%` }}/> : null}</span>
        <span className="bar-value">{r.value === null ? "no treasury output yet" : r.value === undefined ? "unknown" : <><strong>{formatCoins(r.value.toString(), true)}</strong><small>{formatSats(r.value.toString(), unit)}{typeof r.seq === "string" ? ` · output #${r.seq}` : ""}</small></>}{proof && <Link className="bar-proof" href={proof}>proof</Link>}</span>
      </li>;
    })}</ol>
  </LivePanel>;
}

export function TreasuryHistory({ fixedSlot }: { fixedSlot?: number }) {
  const observatory = useObservatory(), unit = useUnit(), now = useNow(30_000);
  const funded = activeSidechains(observatory.data).filter(s => object(object(observatory.data?.state).treasury)[String(s.slot)]);
  const [picked, setPicked] = useState<number>();
  const slot = fixedSlot ?? picked ?? funded[0]?.slot;
  const history = useProtocolPage("ctip/history", `slot=${slot}&limit=100`, slot != null);
  const changes = useProtocolPage("activity", `kind=ctip&slot=${slot}&changes=true&order=block&limit=200`, slot != null);
  const chartReadings = slot == null ? [] : changes.data?.items ?? [], gaps = useCoverageGaps();
  const dataset = history.data?.context.meta.dataset_id;
  // The monitor re-reads the treasury at every tip; keep one row per treasury output.
  const outputs = new Map<string, { value: unknown; txid: unknown; first?: string | null; last?: string | null; proof?: string }>();
  for (const item of slot == null ? [] : history.data?.items ?? []) {
    const c = object(object(item.data).ctip), seq = typeof c.sequence_number === "string" ? c.sequence_number : object(item.data).ctip === null ? "none" : "?";
    const row = outputs.get(seq);
    const first = item.first_observed_at ?? item.observed_at;
    if (!row) outputs.set(seq, { value: c.value_sats, txid: c.txid, first, last: item.observed_at, proof: item.evidence[0] && dataset ? `/datasets/${dataset}/events/${item.evidence[0].event_id}` : undefined });
    else if (first && (!row.first || first < row.first)) row.first = first;
  }
  const rows = [...outputs].sort(([a], [b]) => Number(b) - Number(a));
  return <LivePanel title="A treasury, output by output" status={{ pending: observatory.isPending || (slot != null && history.isPending), error: history.isError && !rows.length, empty: fixedSlot == null ? !funded.length : !rows.length, emptyText: fixedSlot == null ? "No sidechain has a treasury output yet." : "No treasury output has been read for this sidechain yet." }}>
    {fixedSlot == null && <label className="picker">Sidechain <select value={slot ?? ""} onChange={e => setPicked(Number(e.target.value))}>{funded.map(s => <option key={s.slot} value={s.slot}>{s.title ?? `#${s.slot}`} (#{s.slot})</option>)}</select></label>}
    <p className="live-lede">Every deposit or withdrawal replaces the treasury output with a new one, and the output number goes up by one. These are the outputs the monitor has read so far.</p>
    <ReadingsChart label="Treasury value at each reading" gaps={gaps} yFormat={y => formatCoins(BigInt(Math.round(y * 1e8)).toString(), true)}
      points={chartReadings.map(i => {
        const c = object(object(i.data).ctip), v = sats(c.value_sats), tip = readingTip(i);
        return v === undefined || tip === undefined ? [] : [{ x: tip, y: Number(v) / 1e8, href: i.evidence[0] && dataset ? `/datasets/${dataset}/events/${i.evidence[0].event_id}` : undefined,
          label: <>Output #{String(c.sequence_number ?? "?")}: <strong>{formatSats(c.value_sats, unit)}</strong>, first read at tip {n(tip)}</> }];
      }).flat()}/>
    <GoDeeper summary="every treasury output, newest first">
    <ol className="treasury-steps">{rows.map(([seq, r]) => <li key={seq}><span className="seq">{seq === "none" ? "—" : `#${seq}`}</span>
      <span><strong>{seq === "none" ? "No treasury output yet" : formatSats(r.value, unit)}</strong><small>{typeof r.txid === "string" ? `created by transaction ${short(r.txid)} · ` : ""}first read {timeAgo(r.first, now)}, last read {timeAgo(r.last, now)}</small></span>
      {r.proof && <Link href={r.proof}>proof</Link>}</li>)}</ol>
    </GoDeeper>
    {rows.length === 1 && <p className="live-note">Only one output has been read for this sidechain so far. The next deposit or withdrawal will add a new row.</p>}
  </LivePanel>;
}

export function DepositFeed() {
  return <LivePanel title="Latest deposits">
    <ActivityFeed kind="deposit" limit={10} withTreasury/>
  </LivePanel>;
}

/** Pending withdrawal bundles as the enforcer reports them, against the observed thresholds. */
export function WithdrawalVotes({ slot }: { slot?: number }) {
  const observatory = useObservatory(), { params } = useNetworkParams(), names = useSidechainNames(), unit = useUnit();
  const bundles = useProtocolPage("withdrawal-bundles", slot == null ? "limit=50" : `slot=${slot}&limit=50`);
  const pending = (bundles.data?.items ?? []).filter(i => i.kind === "bundle");
  const dataset = bundles.data?.context.meta.dataset_id;
  const complete = object(observatory.data?.state).bundle_complete;
  // The panel is as certain as the readings behind it, including the ones that found nothing pending.
  const reads = activeSidechains(observatory.data).filter(s => slot == null || s.slot === slot).map(s => snapshotOf(observatory.data, "withdrawal_bundle_proposals", s.slot));
  return <LivePanel title="Withdrawals being voted on" quality={observatory.data ? weakestQuality(reads) : undefined}
    status={{ pending: bundles.isPending, error: bundles.isError && !pending.length, empty: !pending.length,
      emptyText: <p>{Array.isArray(complete) && complete.length ? "No withdrawal bundle is being voted on right now." : "No pending withdrawal bundle appears in the latest readings."} When a sidechain proposes one, it will appear here with its votes.</p> }}>
    <div className="vote-cards">{pending.map(item => {
      const b = object(object(item.data).bundle);
      const votes = typeof b.vote_count === "number" ? b.vote_count : undefined, height = typeof b.proposal_height === "number" ? b.proposal_height : undefined;
      const tip = at(item.data, "observation_window", "reference_tip_height");
      const age = typeof tip === "number" && height != null ? tip - height : undefined;
      const treasury = object(object(object(observatory.data?.state).treasury)[String(item.slot)]);
      return <VoteCard key={item.id} title={`Withdrawal from ${sidechainLabel(item.slot, names)}`} subtitle={`M6 id ${short(typeof b.m6id === "string" ? b.m6id : "unknown")} · proposed in block ${n(height)}`}
        votes={votes} threshold={params.withdrawalThreshold} age={age} maxAge={params.withdrawalMaxAge}
        footer={<><p className="vote-note">{treasury.value_sats ? <>The treasury it would pay from holds {formatSats(treasury.value_sats, unit)}. </> : null}The amounts inside a bundle are not visible on L1 until it is paid. {item.evidence[0] && dataset && <Link href={`/datasets/${dataset}/events/${item.evidence[0].event_id}`}>See the proof →</Link>}</p>
          <VoteHistory item={item} threshold={params.withdrawalThreshold}/></>}/>;
    })}</div>
  </LivePanel>;
}

export function WithdrawalOutcomes({ slot }: { slot?: number }) {
  return <LivePanel title="Withdrawal history">
    <ActivityFeed kind="bundle_outcome" slot={slot} limit={6}/>
  </LivePanel>;
}

/**
 * The newest deposit whose new treasury output the monitor also read, told step by step.
 * Each step names its own source: the deposit is observed in a block; the treasury after it is a separate reading.
 */
export function DepositStory({ slot, compact = false }: { slot?: number; compact?: boolean }) {
  const names = useSidechainNames(), unit = useUnit(), now = useNow(30_000);
  const query = apiQuery({ kind: "deposit,ctip", slot, changes: "true", order: "block", limit: 60 });
  const page = useQuery({ queryKey: ["protocol", "activity", "deposit-story", query], queryFn: () => getJson<ProtocolPage>(`/api/v1/activity?${query}`) });
  const items = page.data?.items ?? [], dataset = page.data?.context.meta.dataset_id;
  const story = groupActivity(items).find(e => e.type === "item" && e.treasury);
  const deposit = story?.type === "item" ? story.item : undefined, change = story?.type === "item" ? story.treasury : undefined;
  const d = object(deposit?.data), txid = at(deposit?.data, "outpoint", "txid"), address = depositAddress(d.address);
  const who = deposit ? sidechainLabel(deposit.slot, names) : "";
  const seq = change?.sequence != null ? Number(change.sequence) : undefined;
  const [before, after] = change ? formatCoinPair(change.before.toString(), change.after.toString()) : [];
  const tip = change ? readingTip(change.reading) : undefined;
  return <LivePanel title="One real deposit, step by step"
    status={{ pending: page.isPending, error: page.isError && !items.length, empty: !deposit,
      emptyText: "No recent deposit has a matching treasury reading yet. Deposits from before the monitor started reading treasuries show only the amount." }}>
    {deposit && change && <ol className="story-steps deposit-story">
      <li><span className="story-num">1</span><div>
        <strong>{formatCoins(d.value_sats)} sent to {who}</strong>
        <p>In {blockNumber(deposit.height)} ({timeAgo(deposit.block_time ?? deposit.observed_at, now)}), transaction <span className="hash">{short(typeof txid === "string" ? txid : "unknown")}</span> deposited {formatSats(d.value_sats, unit)}{address ? <> for the sidechain address <span className="hash">{short(address)}</span></> : null}.</p>
        <div className="stat-meta"><ConfidenceChip quality={deposit.quality}/>{proofHref(deposit, dataset) && <Link className="proof-link" href={proofHref(deposit, dataset)!}>proof</Link>}</div>
      </div></li>
      <li><span className="story-num">2</span><div>
        <strong>The treasury is replaced: {before} → {after}</strong>
        <p>The same transaction spent the old treasury output{seq != null && seq > 0 ? <> (#{seq - 1})</> : null} and created a new one{seq != null ? <> (#{seq})</> : null}. The new output holds the old balance plus the deposit: that difference is the amount.</p>
      </div></li>
      <li><span className="story-num">3</span><div>
        <strong>Our monitor read the new treasury</strong>
        <p>At tip {blockNumber(tip)}, a separate reading found {who}&apos;s treasury output {seq != null ? `#${seq}` : ""} with {formatSats(change.after.toString(), unit)}, created by that same transaction.</p>
        <div className="stat-meta"><ConfidenceChip quality={change.reading.quality}/>{proofHref(change.reading, dataset) && <Link className="proof-link" href={proofHref(change.reading, dataset)!}>proof</Link>}</div>
      </div></li>
      {!compact && <li><span className="story-num">4</span><div>
        <strong>The sidechain credits the coins</strong>
        <p>{who.replace(/ \(#\d+\)$/, "")}&apos;s own nodes see the deposit and credit the address. That happens on the sidechain, which we don&apos;t watch, so there is no proof for this step here.</p>
      </div></li>}
    </ol>}
    <p className="live-note"><Link className="text-link" href="/learn/deposits">How deposits work</Link> · <Link className="text-link" href="/live?kind=deposit">all deposits</Link></p>
  </LivePanel>;
}

/** How one pending bundle's vote count changed between readings; nothing is inferred between them. */
function VoteHistory({ item, threshold }: { item: ProtocolItem; threshold?: number }) {
  const page = useProtocolPage("activity", `kind=bundle&slot=${item.slot}&changes=true&order=block&limit=200`, item.slot != null);
  const gaps = useCoverageGaps(), dataset = page.data?.context.meta.dataset_id;
  const points = (page.data?.items ?? []).filter(i => i.entity_id === item.entity_id).flatMap(i => {
    const votes = at(i.data, "bundle", "vote_count"), tip = readingTip(i);
    return typeof votes === "number" && tip !== undefined ? [{ x: tip, y: votes, href: i.evidence[0] && dataset ? `/datasets/${dataset}/events/${i.evidence[0].event_id}` : undefined,
      label: <><strong>{n(votes)} votes</strong> read at tip {n(tip)}</> }] : [];
  });
  if (points.length < 2) return null;
  return <ReadingsChart label="Votes at each reading of this withdrawal" points={points} gaps={gaps} zero={false} yFormat={y => n(Math.round(y))}
    note={<>Votes at each reading, from {n(points[points.length - 1].y)} to {n(points[0].y)}; the axis shows only that range{threshold != null ? ` (it needs more than ${n(threshold)} to pass)` : ""}.</>}/>;
}
