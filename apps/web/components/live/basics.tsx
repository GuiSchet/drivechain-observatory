"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBlocks } from "@/lib/api";
import { object } from "@/lib/protocol";
import { formatCoins, formatSats, sats, short, timeAgo } from "@/lib/explain";
import { activeSidechains, n, proofHref, snapshotOf, useObservatory, useOverview, weakestQuality } from "@/lib/live";
import { useLiveActivity } from "@/components/providers";
import { useUnit } from "@/lib/unit";
import { LivePanel, Stat } from "@/components/learn/primitives";

/** Re-renders every few seconds so relative times stay fresh. */
export function useNow(interval = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), interval); return () => clearInterval(t); }, [interval]);
  return now;
}

/** Four separate facts, each with its own quality and proof: a block, and three readings of state. */
export function NetworkSnapshot() {
  const overview = useOverview(), observatory = useObservatory(), unit = useUnit(), now = useNow();
  const o = overview.data, data = observatory.data, state = object(data?.state);
  const treasury = object(state.treasury), dataset = data?.context.meta.dataset_id;
  const values = Object.values(treasury).map(v => sats(object(v).value_sats)).filter((v): v is bigint => v !== undefined);
  const locked = values.reduce((a, b) => a + b, BigInt(0));
  const tip = o?.latest_observed_block, blockDataset = o?.meta.dataset_id;
  const active = activeSidechains(data), activeRead = snapshotOf(data, "active_sidechains");
  // One treasury reading and one bundle reading per active sidechain; the totals are as certain as the weakest one.
  const treasuryReads = active.map(s => snapshotOf(data, "ctip", s.slot));
  const bundleReads = active.map(s => snapshotOf(data, "withdrawal_bundle_proposals", s.slot));
  const pending = Object.values(object(state.bundles));
  const onlyBundle = pending.length === 1 ? object(pending[0]) : undefined;
  const bundleEvent = Array.isArray(onlyBundle?.evidence) ? object(onlyBundle.evidence[0]).event_id : undefined;
  const ready = !!data;
  return <LivePanel title="eCash Betanet right now"
    status={{ pending: overview.isPending && observatory.isPending, error: overview.isError && observatory.isError && !o && !data }}
    footer="The block is observed directly. The other three are separate readings of current state taken at the chain tip, so each has its own label and proof.">
    <div className="stat-grid">
      <Stat label="Latest L1 block" value={tip ? `#${n(tip.height)}` : "Unknown"} hint={tip ? `seen ${timeAgo(tip.observed_at, now)}` : undefined}
        quality={tip ? "observed" : undefined} proof={tip && blockDataset ? `/datasets/${blockDataset}/blocks/${tip.hash}` : undefined}/>
      <Stat label="Active sidechains" value={ready ? active.length : "Unknown"} hint={<Link href="/sidechains">meet them →</Link>}
        quality={ready ? activeRead?.quality ?? null : undefined} proof={proofHref(activeRead, dataset)}/>
      <Stat label="Coins locked in treasuries" value={values.length ? formatCoins(locked.toString(), true) : "Unknown"}
        hint={values.length ? <>{formatSats(locked.toString(), unit)}, sum of {values.length} treasury readings · <Link href="/sidechains">per sidechain →</Link></> : undefined}
        quality={ready ? weakestQuality(treasuryReads) : undefined}/>
      <Stat label="Withdrawals being voted on" value={ready ? pending.length : "Unknown"} hint={<Link href="/learn/withdrawals">how voting works →</Link>}
        quality={ready ? weakestQuality(bundleReads) : undefined}
        proof={typeof bundleEvent === "string" && dataset ? `/datasets/${dataset}/events/${bundleEvent}` : undefined}/>
    </div>
  </LivePanel>;
}

export function BlockHeartbeat() {
  const live = useLiveActivity(), now = useNow(1_000);
  const blocks = useQuery({ queryKey: ["blocks", "heartbeat"], queryFn: () => getBlocks("limit=8") });
  const list = blocks.data?.blocks ?? [], tip = list[0], dataset = blocks.data?.meta.dataset_id;
  return <LivePanel title="The latest L1 blocks" quality={tip ? "observed" : null} proof={tip && dataset ? `/datasets/${dataset}/blocks/${tip.hash}` : undefined}
    status={{ pending: blocks.isPending, error: blocks.isError && !list.length, empty: !list.length, emptyText: "No block headers have been imported yet." }}>
    <p className="live-lede">{tip ? <>The newest block is <strong>#{n(tip.height)}</strong>, mined about <strong>{timeAgo(tip.block_time, now)}</strong> by its own timestamp. Keep this page open: when a new block arrives, it slides in on the left.</> : null}</p>
    <ol className="chain-strip" aria-label="Most recent blocks, newest first">{list.map((b, i) =>
      <li key={b.hash} className={live?.hash === b.hash ? "fresh-block" : ""}>
        <Link href={`/datasets/${dataset}/blocks/${b.hash}`}><span className="chain-height">#{n(b.height)}</span><span className="hash">{short(b.hash)}</span><small>{timeAgo(b.block_time, now)}</small></Link>
        {i < list.length - 1 && <span className="chain-link" aria-hidden="true">←</span>}
      </li>)}</ol>
    <p className="live-note">Each block's parent is the one to its right. Times come from each block's own timestamp, set by its miner. Hashes start with many zeros because of proof-of-work.</p>
  </LivePanel>;
}

export function BranchCheck() {
  const blocks = useQuery({ queryKey: ["blocks", "branches"], queryFn: () => getBlocks("limit=100&scope=all") });
  const list = blocks.data?.blocks ?? [];
  const alternative = list.filter(b => b.membership !== "selected");
  return <LivePanel title="Competing branches" quality={list.length ? "observed" : null}
    status={{ pending: blocks.isPending, error: blocks.isError && !list.length, empty: !list.length }}>
    <p className="live-lede">{alternative.length
      ? <>Among the last {list.length} block headers the monitor kept, <strong>{alternative.length}</strong> are outside the current chain: a reorganization left them behind. They stay on record so you can inspect them.</>
      : <>Among the last {list.length} block headers the monitor kept, <strong>none</strong> belong to a competing branch. No reorganization shows up in this window.</>}</p>
  </LivePanel>;
}

export function SlotGrid() {
  const observatory = useObservatory();
  const active = activeSidechains(observatory.data);
  const bySlot = new Map(active.map(s => [s.slot, s]));
  const [selected, setSelected] = useState<number>();
  const pick = selected ?? active[0]?.slot;
  const s = pick == null ? undefined : bySlot.get(pick);
  const dataset = observatory.data?.context.meta.dataset_id;
  const obs = snapshotOf(observatory.data, "active_sidechains");
  return <LivePanel title="All 256 slots" quality={obs?.quality ?? null} proof={proofHref(obs, dataset)}
    status={{ pending: observatory.isPending, error: observatory.isError && !observatory.data }}>
    <p className="live-lede"><strong>{active.length}</strong> of 256 slots hold an active sidechain right now. Select a lit slot to read its declaration.</p>
    <div className="slot-grid" role="list">{Array.from({ length: 256 }, (_, i) => {
      const sc = bySlot.get(i);
      return sc ? <button key={i} role="listitem" className={`slot-cell used ${pick === i ? "picked" : ""}`} aria-pressed={pick === i} title={`#${i} · ${sc.title ?? "unnamed"}`} onClick={() => setSelected(i)}><span>{i}</span></button>
        : <span key={i} role="listitem" className="slot-cell" title={`#${i} · empty`} aria-label={`Slot ${i}: empty`}/>;
    })}</div>
    {s && <div className="declaration-card">
      <span className="section-kicker">Slot #{s.slot}</span>
      <h4>{s.title ?? "Unnamed sidechain"}</h4>
      <p className="sc-desc">{s.description ?? "No description declared."}</p>
      <dl className="mini-facts"><dt>Proposed in</dt><dd>block {n(s.proposalHeight)}</dd><dt>Active since</dt><dd>block {n(s.activationHeight)}</dd></dl>
      <Link className="text-link" href={`/sidechains/${s.slot}`}>Follow {s.title ?? "this sidechain"} →</Link>
    </div>}
  </LivePanel>;
}
