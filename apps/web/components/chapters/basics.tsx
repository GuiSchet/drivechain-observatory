"use client";
import Link from "next/link";
import { Section } from "@/components/learn/chapter-layout";
import { Analogy, CheckYourself, GoDeeper, SpecNote, Term } from "@/components/learn/primitives";
import { ChainDiagram } from "@/components/learn/diagrams";
import { HowItWorks } from "@/components/learn/how-it-works";
import { BlockHeartbeat, BranchCheck, NetworkSnapshot, SlotGrid } from "@/components/live/basics";
import { n, useNetworkParams } from "@/lib/live";

export function WhatIsADrivechain() {
  const { params } = useNetworkParams();
  return <>
    <Section title="The problem">
      <p>Bitcoin changes slowly on purpose. Every node must agree on the same rules, so adding a new feature to the main chain is hard and risky.</p>
      <p>A <Term id="sidechain">sidechain</Term> is a separate blockchain with its own software and features, which uses coins brought over from the main chain. If something goes wrong on a sidechain, the main chain is not affected.</p>
    </Section>
    <Section title="The idea">
      <p>A drivechain connects the main chain (<Term id="l1">L1</Term>) with sidechains (L2) using two proposals:</p>
      <ul className="lesson-list">
        <li><strong>BIP300, hashrate escrows.</strong> Coins sent to a sidechain are locked on L1. Getting them back out requires L1 miners to approve the withdrawal in a slow, public vote.</li>
        <li><strong>BIP301, blind merged mining.</strong> L1 miners help produce sidechain blocks and collect their fees, without running any sidechain software.</li>
      </ul>
      <Analogy>Think of a shared vault for each sidechain. Anyone can put coins in. The door only opens after the miners have voted for months, in the open, block by block.</Analogy>
    </Section>
    <HowItWorks/>
    <SpecNote refs={["bip300Abstract"]}>BIP300 lets L2 withdrawals be governed by proof-of-work, "instead of a federation or fixed set of pubkeys". It aims for slow, transparent and auditable withdrawals, and users who don't care about sidechains can ignore them entirely.</SpecNote>
    <Section title="What you are looking at">
      <p>This site watches <strong>eCash Betanet</strong> as it runs. Everything inside a <em>Live on Betanet</em> panel comes from a monitor connected to a Betanet node and the official <Term id="enforcer">enforcer</Term>. <em>See the proof</em> opens the exact record behind a value.</p>
    </Section>
    <NetworkSnapshot/>
    <SpecNote variant="betanet" refs={["ecash", "enforcerNetworkParams"]}><Term id="ecash">eCash (ECX)</Term> is a hard fork of Bitcoin built to activate drivechains; it is not eCash (XEC). <Term id="betanet">Betanet</Term> is its rehearsal network: it starts from Bitcoin's chain and enforces BIP300 and BIP301 from block {n(params.activationHeight)} onward, so every mechanism can be watched working before eCash's mainnet.</SpecNote>
    <CheckYourself question="Who decides whether coins may leave a sidechain and return to L1?" choices={[
      { text: "A fixed group of signers chosen by the sidechain", why: "That would be a federation. BIP300 replaces it with a vote by L1 miners." },
      { text: "L1 miners, voting over many blocks", correct: true, why: "Withdrawals are approved by proof-of-work: miners vote in the blocks they find." },
      { text: "Nobody: withdrawals happen instantly", why: "Deposits are quick, but withdrawals are deliberately slow so everyone can see them coming." },
    ]}/>
  </>;
}

export function Blocks() {
  return <>
    <Section title="A chain of blocks">
      <p>Transactions on L1 are grouped into <Term id="block">blocks</Term>. Miners compete to find the next block using proof-of-work, and the network adjusts the difficulty so a new block appears about every ten minutes on average.</p>
      <p>Every block has a <Term id="height">height</Term> (how many blocks came before it) and a <Term id="block-hash">hash</Term>, a unique fingerprint. Each block also records its parent's hash, which is what chains them together.</p>
    </Section>
    <ChainDiagram/>
    <Section title="Why blocks matter for drivechains">
      <p>Every drivechain action is written into an L1 block: proposing a sidechain, voting on it, depositing, voting on a withdrawal, paying it out. Votes are counted <strong>once per block</strong>, and deadlines are measured <strong>in blocks</strong>, not in days.</p>
      <Analogy>Blocks are the clock of a drivechain. "Too old" means "too many blocks ago", whatever time the wall clock shows.</Analogy>
    </Section>
    <BlockHeartbeat/>
    <Section title="When the chain changes its mind">
      <p>Sometimes two miners find a block at almost the same time and the network briefly splits. The branch with more accumulated work wins, and the blocks on the other branch drop out of the chain. This is a <Term id="reorg">reorganization</Term>. The effects of those blocks, including any drivechain votes, are undone; their transactions may be included again in later blocks.</p>
      <p>The monitor keeps such blocks on record instead of deleting them, so you can still inspect what happened.</p>
    </Section>
    <BranchCheck/>
    <GoDeeper summary="block time vs. the time we saw it">
      <p>A block's timestamp is written by its miner and may differ by a few minutes from real time. The monitor separately records when it first observed each block. That is why a block can appear to be "seen" before its own timestamp.</p>
      <p>Each block's work is added to its parent's to give the chain's accumulated work. That total, not the number of blocks, decides which branch wins.</p>
    </GoDeeper>
    <CheckYourself question="A withdrawal must collect its votes before it is &quot;too old&quot;. How is its age measured?" choices={[
      { text: "In days since it was proposed", why: "Wall-clock time is not part of the rule. Blocks can come faster or slower than usual." },
      { text: "In L1 blocks since it was proposed", correct: true, why: "Ages and votes are both counted in L1 blocks." },
      { text: "In sidechain blocks", why: "BIP300 only counts L1 blocks; the L1 has no view of sidechain blocks." },
    ]}/>
  </>;
}

export function Slots() {
  return <>
    <Section title="256 numbered places">
      <p>BIP300 keeps a list of sidechains on L1. Each one lives in a numbered <Term id="slot">slot</Term> from 0 to 255; the slot number is stored as a single byte. Everything that concerns a sidechain, from deposits to withdrawal votes, refers to it by this number.</p>
      <Analogy>Slots are like numbered parking spaces. A space can be empty or occupied, and over time a different car may park there.</Analogy>
    </Section>
    <Section title="What a sidechain declares">
      <p>When a sidechain is proposed, it comes with a <Term id="declaration">declaration</Term>: a title, a description and two hashes meant to identify its software, the hash of a release archive and a git commit.</p>
    </Section>
    <SpecNote refs={["bip300D1", "bip300M1"]}>The two hashes are "intended" to identify the canonical sidechain software, but they are "not enforced by BIP-300, and [are] for human purposes only". L1 never runs or checks sidechain code.</SpecNote>
    <SlotGrid/>
    <Section title="Slot is not identity">
      <p>A slot can be taken over by a new sidechain if miners vote for it (you will see how in the next concept). So the slot number alone does not identify a sidechain. The Observatory names each <Term id="instance">instance</Term> by its slot, the block where it was proposed, the block where it activated, and the hash of its declaration.</p>
    </Section>
    <GoDeeper summary="how the declaration hash is computed">
      <p>The declaration hash is SHA256d of the declaration's encoded bytes (without the length prefix), shown in display order. Miners vote for a proposal by quoting this hash, which is why it also works as the sidechain's identity.</p>
      <p>Browse every instance observed in a slot from its <Link className="text-link" href="/sidechains">sidechain page</Link>.</p>
    </GoDeeper>
    <CheckYourself question="Suppose slot #9 holds a sidechain called Thunder. If miners later activate a different sidechain in slot #9, what happens?" choices={[
      { text: "It is still Thunder, just updated", why: "The new sidechain has a different declaration and its own proposal and activation blocks: it is a new instance." },
      { text: "It is a new sidechain instance that replaced Thunder in that slot", correct: true, why: "Slots can be reused; identity comes from slot, proposal, activation and declaration together." },
      { text: "It is impossible: a used slot can never change", why: "BIP300 explicitly allows overwriting a used slot, with a much higher vote requirement." },
    ]}/>
  </>;
}
