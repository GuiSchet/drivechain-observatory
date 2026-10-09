"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { ArrowRight, Pause, Play } from "lucide-react";
import { getJson } from "@/lib/api";
import { object } from "@/lib/protocol";
import { formatCoins, sats } from "@/lib/explain";
import { activeSidechains, n, useNetworkParams, useObservatory, useProtocolPage } from "@/lib/live";
import type { BmmMetrics } from "@/lib/types";

type Step = { title: string; body: ReactNode; fact: ReactNode; tag?: string; lesson: string; lessonTitle: string };

/** Picks the example: a sidechain with a withdrawal in vote, else the largest treasury. */
function useExample() {
  const observatory = useObservatory(), { params } = useNetworkParams();
  const bundles = useProtocolPage("withdrawal-bundles", "limit=50");
  const metrics = useQuery({ queryKey: ["protocol", "bmm", "metrics", "window_blocks=24"], queryFn: () => getJson<BmmMetrics>("/api/v1/bmm?window_blocks=24") });
  const active = activeSidechains(observatory.data);
  const treasury = object(object(observatory.data?.state).treasury);
  const value = (slot: number) => sats(object(treasury[String(slot)]).value_sats);
  const pending = (bundles.data?.items ?? []).filter(i => i.kind === "bundle" && active.some(s => s.slot === i.slot));
  const bySize = [...active].sort((a, b) => (value(b.slot) ?? BigInt(0)) > (value(a.slot) ?? BigInt(0)) ? 1 : -1);
  const sc = active.find(s => s.slot === pending[0]?.slot) ?? bySize[0];
  const bundle = sc ? object(object(pending.find(i => i.slot === sc.slot)?.data).bundle) : {};
  const row = metrics.data?.slots.find(r => r.slot === sc?.slot);
  return { sc, treasury: sc ? value(sc.slot) : undefined, votes: typeof bundle.vote_count === "number" ? bundle.vote_count : undefined, hasBundle: !!sc && pending.some(i => i.slot === sc.slot), bmm: row, params, loaded: !!observatory.data };
}

export function HowItWorks() {
  const { sc, treasury, votes, hasBundle, bmm, params, loaded } = useExample();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const auto = playing && !reduced;
  useEffect(() => { if (!auto) return; const t = setInterval(() => setStep(s => (s + 1) % 4), 6500); return () => clearInterval(t); }, [auto]);
  const name = sc?.title ?? "a sidechain";
  const coins = treasury !== undefined ? formatCoins(treasury.toString(), true) : undefined;
  const steps: Step[] = [
    { title: "Lock coins on L1", lesson: "deposits", lessonTitle: "Deposits and the treasury",
      body: <>You send coins to {name}&apos;s <strong>treasury</strong>: a single locked output on the main chain. It is an ordinary L1 transaction, so no vote is needed.</>,
      fact: coins ? <>Right now {name}&apos;s treasury holds <strong>{coins}</strong>.</> : loaded ? <>{name} has no coins locked yet.</> : null },
    { title: "Use them on the sidechain", lesson: "slots", lessonTitle: "Slots and sidechains", tag: "Declared",
      body: <>{name}&apos;s own nodes see the deposit and credit the same amount to your sidechain address. From there you use what {name} offers. L1 never looks inside the sidechain: it only guards the locked coins.</>,
      fact: sc?.description ? <>{name} describes itself as “{sc.description}”. We don&apos;t watch the sidechains themselves, so this step has no live number.</> : <>We don&apos;t watch the sidechains themselves, so this step has no live number.</> },
    { title: "Miners keep it moving", lesson: "merged-mining", lessonTitle: "Blind merged mining",
      body: <>Each L1 block can seal one new {name} block. Sidechain users pay the L1 miner to include it, and the miner never runs sidechain software: that is <strong>blind merged mining</strong>.</>,
      fact: bmm ? <>{name} got a block in <strong>{n(bmm.present)} of the last {n(bmm.covered)}</strong> L1 blocks.</> : null },
    { title: "Withdraw by miner vote", lesson: "withdrawals", lessonTitle: "Withdrawals by miner vote",
      body: <>To leave, the sidechain bundles withdrawals into one L1 payout. Miners vote on it block by block. Only with <strong>more than {n(params.withdrawalThreshold)} votes</strong> within {n(params.withdrawalMaxAge)} blocks do the coins leave the treasury.</>,
      fact: hasBundle ? <>{name}&apos;s withdrawal in vote has <strong>{n(votes)} votes</strong> so far.</> : loaded ? <>No {name} withdrawal is being voted on right now.</> : null },
  ];
  const s = steps[step];
  const label = (text: string, max = 14) => text.length > max ? text.slice(0, max - 1) + "…" : text;
  return <section className="how-it-works" aria-labelledby="hiw-title">
    <div className="hiw-head">
      <h2 id="hiw-title">How a drivechain works, in 4 steps</h2>
      <p>Follow one coin through {sc?.title ? <strong>{sc.title}</strong> : "a sidechain"}, with real numbers from eCash Betanet.</p>
    </div>
    <div className="hiw-body">
      <svg className="hiw-scene" data-step={step + 1} viewBox="0 0 760 400" role="img" aria-labelledby="hiw-svg-title">
        <title id="hiw-svg-title">{`Step ${step + 1} of 4: ${s.title}`}</title>
        <defs><marker id="hiw-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
        {/* Sidechain lane */}
        <rect className="hiw-lane hiw-lane-side" x="170" y="20" width="420" height="110" rx="14"/>
        <text className="hiw-lane-label" x="186" y="42">SIDECHAIN · {label(sc?.title ?? "L2", 18).toUpperCase()}</text>
        {[0, 1, 2, 3, 4].map(i => <rect key={i} className={`hiw-sblock ${i === 4 ? "hiw-new" : ""}`} x={196 + i * 78} y="58" width="58" height="48" rx="7"/>)}
        {/* L1 lane, with the treasury living in it */}
        <rect className="hiw-lane hiw-lane-l1" x="170" y="220" width="420" height="160" rx="14"/>
        <text className="hiw-lane-label" x="186" y="242">L1 · ECASH BETANET</text>
        <g className="hiw-vault">
          <rect x="196" y="254" width="200" height="52" rx="10"/>
          <text x="296" y="276" textAnchor="middle" className="hiw-strong">{label(`${sc?.title ?? "Sidechain"} treasury`, 22)}</text>
          <text x="296" y="295" textAnchor="middle" className="hiw-small">{coins ? `${coins} locked` : "locked coins"}</text>
        </g>
        {[0, 1, 2, 3, 4].map(i => <rect key={i} className={`hiw-lblock ${i === 4 ? "hiw-new" : ""}`} x={196 + i * 78} y="320" width="58" height="44" rx="7"/>)}
        {/* Actors and their two balances */}
        <g className="hiw-actor"><circle cx="80" cy="168" r="16"/><path d="M52 212 q28 -34 56 0"/><text x="80" y="236" textAnchor="middle" className="hiw-strong">You</text></g>
        <g className="hiw-chip hiw-chip-side"><rect x="16" y="60" width="128" height="40" rx="8"/><text x="80" y="85" textAnchor="middle" className="hiw-small">sidechain balance</text></g>
        <g className="hiw-chip"><rect x="16" y="282" width="128" height="40" rx="8"/><text x="80" y="307" textAnchor="middle" className="hiw-small">L1 wallet</text></g>
        <g className="hiw-actor"><circle cx="680" cy="168" r="16"/><path d="M652 212 q28 -34 56 0"/><text x="680" y="236" textAnchor="middle" className="hiw-strong">L1 miners</text></g>
        {/* 1: wallet → treasury */}
        <path className="hiw-flow hiw-s1" d="M144 296 C 166 296, 170 282, 192 282" markerEnd="url(#hiw-arrow)"/>
        <text className="hiw-flow-label hiw-s1" x="20" y="344">deposit →</text>
        {/* 2: the sidechain credits the same amount */}
        <path className="hiw-flow hiw-s2" d="M296 252 V 136" markerEnd="url(#hiw-arrow)"/>
        <text className="hiw-flow-label hiw-s2" x="306" y="182">credited on L2</text>
        <path className="hiw-flow hiw-s2" d="M190 80 H 150" markerEnd="url(#hiw-arrow)"/>
        {/* 3: miners seal one sidechain block in the new L1 block */}
        <path className="hiw-flow hiw-s3" d="M672 248 C 662 310, 620 342, 572 342" markerEnd="url(#hiw-arrow)"/>
        <path className="hiw-flow hiw-s3" d="M537 316 V 112" markerEnd="url(#hiw-arrow)"/>
        <text className="hiw-flow-label hiw-s3" x="546" y="182">seals 1 block</text>
        {/* 4: votes accumulate, then coins leave the treasury */}
        <g className="hiw-s4 hiw-votes">{[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} x={414 + i * 14} y="262" width="9" height="26" rx="2"/>)}<text x="462" y="304" textAnchor="middle" className="hiw-small">votes</text></g>
        <path className="hiw-flow hiw-s4" d="M650 250 C 600 256, 548 266, 520 274" markerEnd="url(#hiw-arrow)"/>
        <path className="hiw-flow hiw-s4" d="M194 296 C 172 296, 168 312, 148 312" markerEnd="url(#hiw-arrow)"/>
        <text className="hiw-flow-label hiw-s4" x="20" y="344">← withdrawal</text>
      </svg>
      <div className="hiw-steps">
        <ol>{steps.map((st, i) => <li key={st.title}><button className={i === step ? "active" : ""} aria-pressed={i === step} onClick={() => { setStep(i); setPlaying(false); }}><span>{i + 1}</span>{st.title}</button></li>)}</ol>
        <div className="hiw-detail" aria-live="polite">
          <h3>{step + 1} · {s.title}</h3>
          <p>{s.body}</p>
          {s.fact && <p className="hiw-fact"><span className={s.tag ? "live-tag declared" : "live-tag"}>{s.tag ?? "Live"}</span> {s.fact}</p>}
          <Link className="text-link" href={`/learn/${s.lesson}`}>Learn it: {s.lessonTitle} <ArrowRight size={13}/></Link>
        </div>
        <button className="hiw-play" onClick={() => setPlaying(p => !p)} aria-pressed={playing}>{playing ? <><Pause size={14}/> Pause</> : <><Play size={14}/> Play steps</>}</button>
      </div>
    </div>
  </section>;
}
