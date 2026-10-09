"use client";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { chapters } from "@/content/chapters";
import { useProgress } from "@/lib/progress";
import { activeSidechains, n, useNetworkParams, useObservatory } from "@/lib/live";
import { references } from "@/content/references";
import { DrivechainDiagram } from "@/components/learn/diagrams";
import { NetworkSnapshot } from "@/components/live/basics";
import { ActivityFeed } from "@/components/live/activity";

export function Home() {
  const { isDone, completed } = useProgress();
  const doneCount = chapters.filter(c => completed.includes(c.slug)).length;
  const next = chapters.find(c => !isDone(c.slug)) ?? chapters[0];
  const sidechains = activeSidechains(useObservatory().data);
  const { params } = useNetworkParams();
  return <main className="home">
    <section className="home-hero">
      <div>
        <div className="eyebrow">eCash (ECX) · Betanet · BIP300 / BIP301</div>
        <h1>Learn drivechains by <span>watching one run.</span></h1>
        <p>Eight short concepts, one at a time. Each lesson explains an idea in plain words, links the exact part of the specification, and shows it happening right now on <strong>eCash Betanet</strong>, the network where eCash rehearses drivechains before its mainnet.</p>
        <div className="cta-row">
          <Link className="cta primary" href={`/learn/${next.slug}`}>{doneCount ? "Continue" : "Start learning"} <ArrowRight size={16}/></Link>
          <Link className="cta" href="/sidechains">Meet the sidechains</Link>
        </div>
      </div>
      <DrivechainDiagram names={sidechains.map(s => s.title).filter((t): t is string => !!t)}/>
    </section>
    <section className="network-intro" aria-labelledby="network-intro-title">
      <h2 id="network-intro-title">Which network is this?</h2>
      <div className="network-cards">
        <article><span className="nc-kicker">The project</span><strong>eCash (ECX)</strong><p>A hard fork of Bitcoin, associated with Paul Sztorc and LayerTwo Labs, that turns on drivechains (BIP300 and BIP301). It is <em>not</em> eCash (XEC), which is a different coin and network.</p></article>
        <article><span className="nc-kicker">The network we watch</span><strong>Betanet</strong><p>eCash's rehearsal network. It starts from Bitcoin's own chain and enforces the drivechain rules from block {n(params.activationHeight)} onward, so every mechanism can be tried before eCash's mainnet.</p></article>
        <article><span className="nc-kicker">Where the data comes from</span><strong>Our own Betanet node</strong><p>A Betanet node and the official enforcer, watched by a monitor that records everything it sees. <Link className="text-link" href="/learn/how-we-know">How we know</Link></p></article>
      </div>
      <p className="network-source">Source: <a className="text-link" href={references.ecash.href} target="_blank" rel="noopener noreferrer">ecash.com</a>. Live data below is from Betanet only, not from eCash's mainnet or from Bitcoin.</p>
    </section>
    <NetworkSnapshot/>

    <h2>The learning path</h2>
    <p className="section-lede">Each concept builds on the one before. Start at the beginning, or jump to what you are curious about.</p>
    {doneCount > 0 && <p className="progress-line"><progress max={chapters.length} value={doneCount}/>{doneCount} of {chapters.length} concepts understood</p>}
    <ol className="chapter-cards">{chapters.map((c, i) => <li key={c.slug}><Link href={`/learn/${c.slug}`}>
      <span className="num">Concept {i + 1}{isDone(c.slug) && <span className="done-tag"><Check size={13}/> understood</span>}</span>
      <strong>{c.title}</strong><p>{c.tagline}</p><small>{c.minutes} min</small>
    </Link></li>)}</ol>

    <h2>Happening now</h2>
    <p className="section-lede">The latest deposits into sidechains, in plain words. <Link className="text-link" href="/live">See all live activity →</Link></p>
    <ActivityFeed kind="deposit" limit={5}/>
  </main>;
}
