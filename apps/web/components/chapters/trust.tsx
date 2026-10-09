"use client";
import Link from "next/link";
import { Section } from "@/components/learn/chapter-layout";
import { CheckYourself, ConfidenceChip, GoDeeper, SpecNote, Term } from "@/components/learn/primitives";
import { PipelineDiagram } from "@/components/learn/diagrams";
import { Builds, Downloads, QualitySummary, TrustStatus } from "@/components/live/trust";

export function HowWeKnow() {
  return <>
    <Section title="Where the numbers come from">
      <p>A Betanet node and the official <Term id="enforcer">enforcer</Term> run side by side. A monitor asks them what is happening, block after block, and records every answer exactly as received. The Observatory keeps a checked copy of those records, and this site turns them into the lessons you have read.</p>
    </Section>
    <PipelineDiagram/>
    <Section title="Three kinds of answer">
      <p>Not every value is equally certain, so each live panel says which kind it shows:</p>
      <ul className="lesson-list">
        <li><ConfidenceChip quality="observed"/> A fact the sources reported for a specific block, such as a deposit or a merged-mining commitment.</li>
        <li><ConfidenceChip quality="tip_matched"/> A reading of current state, such as a treasury balance or a vote count, taken while the chain tip did not move. It tells you the state at that moment, not how it got there.</li>
        <li><ConfidenceChip quality="unknown"/> The reading was missing, conflicting, or taken while the chain moved. The Observatory never fills a gap by guessing or by replaying the protocol rules itself.</li>
      </ul>
      <p>Every value also has <em>See the proof</em>: the exact <Term id="evidence">evidence</Term> record behind it, which anyone can download and check.</p>
    </Section>
    <TrustStatus/>
    <QualitySummary/>
    <Section title="What we cannot see">
      <p>The enforcer's official API reports current state and per-block facts, but not the full history of every vote. So the site shows vote counts as they were read, never the individual votes in between. It does not watch the sidechains themselves, so it cannot confirm that a deposit was credited on L2. And when the monitor was not looking, a missing record does not mean nothing happened: that is why <Term id="coverage">coverage</Term> matters.</p>
    </Section>
    <Builds/>
    <Downloads/>
    <SpecNote variant="betanet" refs={["sourceContract", "enforcer"]}>The source contract lists exactly what each official source provides and its limits. The lessons were checked against the enforcer build shown above; if the network moves to a different build, the parameters shown live will follow it.</SpecNote>
    <GoDeeper summary="how the chain itself is checked">
      <p>The Observatory selects the chain from the enforcer's tip readings and checks it against the node's headers: each block's accumulated work must equal its parent's plus its own. If the node and the enforcer disagree, the chain is not certified and the disagreement is shown. If a record changes after it was imported, synchronization stops and says so instead of continuing silently.</p>
      <p>Every block and event has a permanent page. Try the <Link className="text-link" href="/live">live activity</Link> and follow any "Proof" link.</p>
    </GoDeeper>
    <CheckYourself question="The site shows no deposit into a sidechain during a period when the monitor was offline. What can you conclude?" choices={[
      { text: "Nobody deposited during that time", why: "Without coverage, a missing record means the monitor didn't see it, not that it didn't happen." },
      { text: "Nothing, until the missing blocks are covered", correct: true, why: "Absence of evidence only counts where the monitor actually recorded the blocks." },
      { text: "Deposits were blocked by miners", why: "Deposits need no miner vote; nothing suggests they were blocked." },
    ]}/>
  </>;
}
