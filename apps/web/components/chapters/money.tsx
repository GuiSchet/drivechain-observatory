"use client";
import { Section } from "@/components/learn/chapter-layout";
import { Analogy, CheckYourself, GoDeeper, SpecNote, Term } from "@/components/learn/primitives";
import { BmmDiagram, TreasuryDiagram, VoteDiagram } from "@/components/learn/diagrams";
import { ActivationTimeline, DepositFeed, DepositStory, ParamsPanel, ProposalsNow, TreasuryBars, TreasuryHistory, WithdrawalOutcomes, WithdrawalVotes } from "@/components/live/money";
import { BmmBids, BmmCommitments, ConfirmedFees } from "@/components/live/bmm";
import { ActivityFeed } from "@/components/live/activity";
import { LivePanel } from "@/components/learn/primitives";
import { n, useNetworkParams } from "@/lib/live";

export function CreatingASidechain() {
  const { params } = useNetworkParams();
  return <>
    <Section title="Step 1: someone proposes it">
      <p>A new sidechain starts as a proposal. A miner writes an <Term id="m1">M1</Term> message into the <Term id="coinbase">coinbase transaction</Term> of a block they find. The message carries the sidechain's declaration and the slot it wants. A new proposal starts with zero votes.</p>
      <p>Only miners write coinbase transactions, so a sidechain's developers ask miners to include their proposal.</p>
    </Section>
    <Section title="Step 2: miners vote, block by block">
      <p>In each later block, the miner can vote for the proposal with an <Term id="m2">M2</Term> message that quotes the proposal's declaration hash. One block, at most one vote. A block that does not vote for it simply doesn't add one.</p>
      <Analogy>It is like a show of hands that lasts for weeks: every block is one hand, and only blocks that raise it count.</Analogy>
    </Section>
    <VoteDiagram threshold={params.unusedThreshold} maxAge={params.unusedMaxAge}/>
    <Section title="Step 3: activate or expire">
      <p>The proposal activates when its votes go above the <Term id="threshold">threshold</Term> before it gets too old. If it runs out of time, it is dropped. Taking an empty slot needs fewer votes than replacing a sidechain that is already active: replacing one should be hard.</p>
    </Section>
    <ParamsPanel show={["activation"]}/>
    <ProposalsNow/>
    <ActivationTimeline/>
    <SpecNote variant="betanet" refs={["bip300M2", "spec300Constants", "enforcerBetanet", "enforcerThresholdRule"]}>
      The documents disagree on how many votes an empty slot needs. The BIP300 text says a proposal fails after 1,008 blocks without a vote out of 2,016 (a 50% majority). The LayerTwo Labs specification and the enforcer's mainnet setting require 1,815 of 2,016. Betanet uses the value in the panel above. The enforcer also requires strictly <em>more</em> votes than the threshold.
    </SpecNote>
    <GoDeeper summary="what the messages look like">
      <p>Both are outputs of the coinbase transaction that start with <code>OP_RETURN</code>. M1 has the header <code>D5E0C4AF</code> followed by the slot number, a version, the title, the description and the two hashes. M2 has the header <code>D6E1C5BF</code> followed by the 32-byte declaration hash. A block may contain at most one M1 and one M2.</p>
      <p>A vote only counts from the block after the proposal. That is why a sidechain that got a vote in every block activates exactly {n(params.unusedThreshold != null ? params.unusedThreshold + 1 : undefined)} blocks after it was proposed on Betanet, as the timeline above shows.</p>
    </GoDeeper>
    <CheckYourself question={`On Betanet, a proposal for an empty slot has exactly ${n(params.unusedThreshold)} votes and is still young enough. Does it activate?`} choices={[
      { text: "Yes, it reached the threshold", why: "Reaching it is not enough: the enforcer requires strictly more votes than the threshold." },
      { text: "No, it needs at least one more vote", correct: true, why: "The rule is votes > threshold, so it needs one more vote while it is still within the maximum age." },
      { text: "It depends on the sidechain's own nodes", why: "Activation is decided entirely on L1 by counting miner votes." },
    ]}/>
  </>;
}

export function Deposits() {
  return <>
    <Section title="One treasury per sidechain">
      <p>All coins locked for a sidechain sit in a single L1 output, its <Term id="ctip">treasury output</Term> (BIP300 calls it the CTIP). It is marked with a special opcode, <Term id="op-drivechain">OP_DRIVECHAIN</Term>, and the sidechain's slot number.</p>
      <Analogy>The treasury is one big jar per sidechain. Each deposit pours the old jar and your coins into a new, larger jar.</Analogy>
    </Section>
    <Section title="Depositing (M5)">
      <p>A <Term id="m5">deposit</Term> is an ordinary L1 transaction. It spends the current treasury output together with your coins and creates a new treasury output holding more than before. Right after it, an output records the sidechain address that should receive the coins.</p>
      <p>No vote is needed: once the transaction is in a block, the deposit is done on L1. The amount deposited is exactly how much the treasury grew.</p>
    </Section>
    <TreasuryDiagram/>
    <SpecNote refs={["bip300M5", "spec300Treasury"]}>A deposit is valid if it has exactly one OP_DRIVECHAIN output, which becomes the new treasury output, and that output holds more coins than the old one. Deposits and withdrawals never create extra treasury outputs.</SpecNote>
    <DepositStory/>
    <TreasuryBars/>
    <DepositFeed/>
    <TreasuryHistory/>
    <SpecNote variant="betanet" refs={["bip300OpDrivechain", "enforcerOpDrivechain"]}>BIP300 turns <code>OP_NOP5</code> into OP_DRIVECHAIN. Betanet's node uses <code>OP_NOP8</code> for it instead. The rules are the same; only the opcode number differs.</SpecNote>
    <GoDeeper summary="what L1 does not know">
      <p>L1 checks that the treasury grew and that the address output is present. Crediting the coins on the sidechain is the sidechain's job: its nodes read the deposit from L1. The Observatory does not watch sidechains, so a deposit here shows the L1 side only.</p>
      <p>The treasury script is <code>OP_DRIVECHAIN &lt;slot&gt; OP_TRUE</code>. Anyone may spend it, but only in a transaction that follows the deposit or withdrawal rules.</p>
    </GoDeeper>
    <CheckYourself question="When you deposit, what does L1 itself check?" choices={[
      { text: "That miners have voted to accept your deposit", why: "Deposits need no vote; only withdrawals do." },
      { text: "That the single treasury output is replaced by a new one holding more coins", correct: true, why: "That is the M5 rule: one OP_DRIVECHAIN output, with more coins than before." },
      { text: "That the sidechain credited your address", why: "L1 never looks inside a sidechain. Crediting is done by the sidechain's own nodes." },
    ]}/>
  </>;
}

export function Withdrawals() {
  const { params } = useNetworkParams();
  return <>
    <Section title="Withdrawals travel in bundles">
      <p>To move coins back to L1, sidechain users request withdrawals on the sidechain. The sidechain periodically combines many requests into one <Term id="bundle">withdrawal bundle</Term>: a single L1 transaction that pays everyone. A bundle pays all of its withdrawals or none of them.</p>
    </Section>
    <Section title="Propose (M3), then vote (M4)">
      <p>A miner puts the bundle up for a vote with an <Term id="m3">M3</Term> message. Miners vote on its <Term id="m6id">M6 id</Term>, an identifier of the payout transaction, not on the transaction itself. Being proposed counts as its first vote.</p>
      <p>From then on, each block carries an <Term id="m4">M4</Term> vote for every sidechain that has bundles pending. For each one, the miner can:</p>
      <ul className="lesson-list">
        <li><strong>Upvote one bundle.</strong> It gains a vote; the sidechain's other pending bundles each lose one.</li>
        <li><strong>Abstain.</strong> Nothing changes. A block without an M4 counts as abstaining.</li>
        <li><strong>Raise an alarm.</strong> Every pending bundle of that sidechain loses a vote.</li>
      </ul>
      <p>Votes never drop below zero.</p>
    </Section>
    <VoteDiagram threshold={params.withdrawalThreshold} maxAge={params.withdrawalMaxAge}/>
    <Section title="Pay out (M6), or expire">
      <p>Once a bundle has more votes than the threshold, the payout transaction (<Term id="m6">M6</Term>) can be included in a block. It spends the treasury, pays the withdrawals, and returns the rest to a new treasury output. A bundle that grows too old without passing is dropped and pays nothing.</p>
      <Analogy>It is a public countdown. Everyone can watch the votes for months before a single coin leaves, so a dishonest withdrawal cannot happen quietly.</Analogy>
    </Section>
    <ParamsPanel show={["withdrawal"]}/>
    <WithdrawalVotes/>
    <WithdrawalOutcomes/>
    <SpecNote refs={["bip300D2", "bip300M3", "bip300M4", "bip300M6"]}>BIP300 describes this as a slow, transparent and auditable process: miners ACK the bundle's hash "over 3-6 months". The BIP's withdrawal list says a bundle succeeds at the threshold "or greater"; the enforcer Betanet runs requires strictly more.</SpecNote>
    <GoDeeper summary="how the M6 id hides the treasury input">
      <p>When voting starts, the treasury output the payout will spend usually does not exist yet: more deposits may replace it. So the M6 id is computed from a "blinded" copy of the transaction with no inputs, and with the treasury output replaced by an output that records the total fee. The real payout must match it.</p>
      <p>Each M4 can be encoded in several compact versions, such as "repeat the previous block's votes". The enforcer decodes them all to the same upvote, abstain and alarm choices.</p>
    </GoDeeper>
    <CheckYourself question="A sidechain has two pending bundles, A and B. In this block the miner upvotes A. What happens to B?" choices={[
      { text: "Nothing, B keeps its votes", why: "That would be an abstain. Upvoting one bundle counts against the others of the same sidechain." },
      { text: "B loses one vote (unless it is already at zero)", correct: true, why: "An upvote for A is also a downvote for every other pending bundle of that sidechain." },
      { text: "B is removed immediately", why: "Not immediately: a bundle is dropped only once it can no longer pass in time." },
    ]}/>
  </>;
}

export function MergedMining() {
  return <>
    <Section title="Who makes sidechain blocks?">
      <p>A sidechain needs someone to produce its blocks. With <Term id="bmm">blind merged mining</Term> (BIP301), L1 miners secure sidechain blocks and collect their fees without running any sidechain software.</p>
      <p>The work is split. A sidechain user, who does run the sidechain, builds the next sidechain block. They then offer L1 miners a payment if the next L1 block commits to that sidechain block.</p>
    </Section>
    <BmmDiagram/>
    <Section title="Bid and accept">
      <ul className="lesson-list">
        <li><strong><Term id="bmm-request">BMM Request</Term>.</strong> An L1 transaction from the sidechain user: "I pay this <Term id="bid">bid</Term> if your block includes my sidechain block hash (h*)". It names the L1 block it builds on, so it is only valid in the very next block.</li>
        <li><strong><Term id="bmm-accept">BMM Accept</Term>.</strong> The miner writes one h* per sidechain into the coinbase, and can then collect the matching request's payment in the same block.</li>
      </ul>
      <Analogy>It is an auction held every block: sidechain users bid for the right to make the next sidechain block, and the miner picks one winner per sidechain.</Analogy>
    </Section>
    <BmmBids/>
    <SpecNote refs={["bip301Example", "bip301Request", "spec301M7", "spec301M8"]}>Only one BMM Request per sidechain can enter each L1 block, and it must match the block's BMM Accept. BIP301 names the two messages "BMM Accept" and "BMM Request"; the LayerTwo Labs specification numbers them M7 and M8.</SpecNote>
    <BmmCommitments/>
    <ConfirmedFees/>
    <LivePanel title="Recent commitments, in words"><ActivityFeed kind="bmm_commitment" limit={5}/></LivePanel>
    <GoDeeper summary="what a sample of bids can and cannot tell you">
      <p>The bids you see are the ones the monitor found when it last looked. Requests come and go between looks, so an empty sample does not prove nobody was bidding, and a bid that disappears was not necessarily paid. A paid bid is confirmed separately, from the block itself.</p>
    </GoDeeper>
    <CheckYourself question="Why is it called blind merged mining?" choices={[
      { text: "Miners can't see the bids", why: "Bids are ordinary L1 transactions that miners see and choose from." },
      { text: "Miners commit to a sidechain block without looking at its contents", correct: true, why: "They only include its hash; building and checking the block is up to sidechain users." },
      { text: "Nobody knows which miner found the block", why: "L1 blocks are public. The blindness is about the sidechain block." },
    ]}/>
  </>;
}
