"use client";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { chapters } from "@/content/chapters";
import { useProgress } from "@/lib/progress";
import { HowItWorks } from "@/components/learn/how-it-works";
import { NetworkSnapshot } from "@/components/live/basics";
import { ActivityFeed } from "@/components/live/activity";
import { DepositStory } from "@/components/live/money";
import { DaySummary } from "@/components/live/summary";

export function Home() {
  const { isDone, completed } = useProgress();
  const doneCount = chapters.filter(c => completed.includes(c.slug)).length;
  const next = chapters.find(c => !isDone(c.slug)) ?? chapters[0];
  return <main className="home">
    <section className="home-hero split">
      <div>
        <div className="eyebrow">eCash (ECX) · Betanet · BIP300 / BIP301</div>
        <h1>Learn drivechains by <span>watching one run.</span></h1>
        <p>The Drivechain Observatory watches <strong>eCash Betanet</strong>, the network where eCash tests drivechains (BIP300 and BIP301) before its mainnet. It runs its own node and the official enforcer, records every sidechain, deposit, withdrawal vote and merged-mining commitment, and explains what each one means, with the proof behind every number.</p>
        <div className="cta-row">
          <Link className="cta primary" href={`/learn/${next.slug}`}>{doneCount ? "Continue" : "Start learning"} <ArrowRight size={16}/></Link>
          <Link className="cta" href="/sidechains">Meet the sidechains</Link>
        </div>
      </div>
      <NetworkSnapshot/>
    </section>

    <h2>What happened recently</h2>
    <p className="section-lede">Real events from Betanet, each with its own proof. <Link className="text-link" href="/live">See all live activity →</Link></p>
    <div className="home-recent">
      <DepositStory/>
      <DaySummary/>
    </div>

    <HowItWorks/>

    <h2>The learning path</h2>
    <p className="section-lede">Each concept builds on the one before. Start at the beginning, or jump to what you are curious about.</p>
    {doneCount > 0 && <p className="progress-line"><progress max={chapters.length} value={doneCount}/>{doneCount} of {chapters.length} concepts understood</p>}
    <ol className="chapter-cards">{chapters.map((c, i) => <li key={c.slug}><Link href={`/learn/${c.slug}`}>
      <span className="num">Concept {i + 1}{isDone(c.slug) && <span className="done-tag"><Check size={13}/> understood</span>}</span>
      <strong>{c.title}</strong><p>{c.tagline}</p><small>{c.minutes} min</small>
    </Link></li>)}</ol>

    <h2>Latest deposits</h2>
    <p className="section-lede">Newest block first, with each treasury before and after when the monitor read it.</p>
    <ActivityFeed kind="deposit" limit={8} withTreasury/>

  </main>;
}
