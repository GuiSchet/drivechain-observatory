import { array, object, short } from "./protocol";
import { blockNumber, formatCoins, formatSats, sidechainLabel, type SidechainNames } from "./explain";

/** A recorded event, said in words: a title, a few sentences, and what it points to. */
export type EvidenceSummary = {
  title: string;
  lines: string[];
  block?: { hash: string; height: number };
  slot?: number;
  lesson: string;
  /** A state reading rather than a fact about one block. */
  reading: boolean;
};

const num = (v: unknown) => typeof v === "number" ? v : undefined;
const str = (v: unknown) => typeof v === "string" ? v : undefined;

/** The single `{ Variant: body }` inside the monitor envelope. */
function variant(payload: unknown): [string, Record<string, unknown>] | undefined {
  const source = object(object(payload).monitor_event);
  const event = object(object(source.Enforcer ?? source.Node).event);
  const key = Object.keys(event)[0];
  return key ? [key, object(event[key])] : undefined;
}

function bundleState(body: Record<string, unknown>): string {
  const inner = object(body.event ?? body.state ?? body);
  const state = Object.keys(inner).find(k => ["Submitted", "Succeeded", "Failed"].includes(k));
  return state === "Succeeded" ? "paid out" : state === "Failed" ? "failed; nothing was paid" : state === "Submitted" ? "put up for a miner vote" : "an event was recorded";
}

export function summarizeEvidence(kind: string, payloadJson: string, names: SidechainNames, unit: string): EvidenceSummary {
  let payload: unknown;
  try { payload = JSON.parse(payloadJson); } catch { payload = undefined; }
  const anchored = object(object(payload).observed_at_block);
  const block = str(anchored.hash) && num(anchored.height) != null ? { hash: str(anchored.hash)!, height: num(anchored.height)! } : undefined;
  const v = variant(payload);
  const fallback: EvidenceSummary = { title: `Record of kind “${kind.replaceAll("_", " ")}”`, lines: ["This record has no plain-language summary yet. The exact record is below."], block, lesson: "how-we-know", reading: !block };
  if (!v) return fallback;
  const [name, body] = v, header = object(body.header);
  const height = num(header.height), slot = num(body.sidechain_number), who = sidechainLabel(slot, names);
  switch (name) {
    case "BlockConnected": {
      const events = array(body.events).map(e => object(object(e).event ?? e));
      const deposits = events.map(e => object(e.Deposit)).filter(d => Object.keys(d).length);
      const others = events.filter(e => !e.Deposit);
      const lines = [
        `This is the enforcer's report of ${blockNumber(height)} for ${who}: everything that block contained for this sidechain.`,
        body.bmm_commitment ? `Merged mining: the block commits to the sidechain block hash ${short(String(body.bmm_commitment))}. L1 records only this hash; it does not check the sidechain block.` : "Merged mining: the block has no commitment for this sidechain.",
        deposits.length ? `Deposits: ${deposits.map(d => `${formatCoins(d.value_sats)} (${formatSats(d.value_sats, unit)}), creating treasury output #${String(d.sequence_number ?? "?")}`).join("; ")}.` : "Deposits: none.",
        others.length ? `Withdrawals: ${others.map(e => { const [k, b] = Object.entries(e)[0] ?? ["event", {}]; const m6 = str(object(b).m6id); return `bundle ${m6 ? short(m6) : k} ${bundleState(object(b))}`; }).join("; ")}.` : "Withdrawals: no withdrawal events.",
      ];
      return { title: `Enforcer report for ${who}, ${blockNumber(height)}`, lines, block, slot, lesson: deposits.length ? "deposits" : others.length ? "withdrawals" : "merged-mining", reading: false };
    }
    case "BlockDisconnected":
      return { title: `Enforcer notice: ${blockNumber(height)} was removed`, lines: [`The enforcer reported that ${blockNumber(height)} left the chain in a reorganization. The block stays on record so it can be inspected.`], block, slot, lesson: "blocks", reading: false };
    case "MainchainTransition": {
      const added = body.action === 1;
      const lines = [added ? `The enforcer's live stream announced that ${blockNumber(height)} was added to the chain.` : `The enforcer's live stream announced a change at ${blockNumber(height)} (action ${String(body.action)}).`];
      if (body.gap_start != null) lines.push("This notice came right after the live stream restarted, so changes in between were not seen live.");
      return { title: `Live notice: ${blockNumber(height)} ${added ? "added" : "changed"}`, lines, block, lesson: "blocks", reading: false };
    }
    case "ChainTip":
      return { title: `Tip reading: ${blockNumber(height)}`, lines: [`Our Betanet node reported ${blockNumber(height)} as the newest block of its chain at the moment of this reading.`], block, lesson: "blocks", reading: false };
    case "MainchainBlock":
      return { title: `Block header: ${blockNumber(height)}`, lines: [`The header of ${blockNumber(height)} as our Betanet node reported it: its hash, its parent and its proof of work. Only the header is kept; the record's fingerprint covers the whole block.`], block, lesson: "blocks", reading: false };
    case "ChainInfo": {
      const c = object(body.bip300_constants), n = (k: string) => num(c[k])?.toLocaleString("en-US") ?? "unknown";
      return { title: "The network's BIP300 rules", lines: [
        `Drivechain rules apply from block ${n("activation_height")}.`,
        `A new sidechain in an empty slot needs more than ${n("unused_sidechain_slot_activation_threshold")} votes within ${n("unused_sidechain_slot_proposal_max_age")} blocks; replacing one needs more than ${n("used_sidechain_slot_activation_threshold")} within ${n("used_sidechain_slot_proposal_max_age")}.`,
        `A withdrawal bundle needs more than ${n("withdrawal_bundle_inclusion_threshold")} votes within ${n("withdrawal_bundle_max_age")} blocks.`,
      ], block, lesson: "creating-a-sidechain", reading: !block };
    }
    case "ActiveSidechains": {
      const list = array(body.sidechains).map(s => object(s));
      const titles = list.map(s => str(object(object(object(s.declaration).declaration).V0).title) ?? "unnamed");
      return { title: "Reading: which sidechains are active", lines: [`At the moment of this reading, ${list.length} sidechains were active: ${titles.join(", ")}.`, "It is a reading of current state, not a fact about one block."], lesson: "slots", reading: true };
    }
    case "SidechainProposals": {
      const list = array(body.proposals);
      return { title: "Reading: sidechain proposals", lines: [list.length ? `${list.length} proposals were being voted on at the moment of this reading.` : "No sidechain proposal was being voted on at the moment of this reading."], lesson: "creating-a-sidechain", reading: true };
    }
    case "Ctip": {
      const ctip = body.ctip === null ? null : object(body.ctip);
      return { title: `Reading: ${who}'s treasury`, slot, lesson: "deposits", reading: true, lines: [ctip
        ? `At the moment of this reading, ${who}'s treasury was output #${String(ctip.sequence_number ?? "?")}, holding ${formatCoins(ctip.value_sats)} (${formatSats(ctip.value_sats, unit)}). It was created by transaction ${short(String(ctip.txid ?? "unknown"))}.`
        : `At the moment of this reading, ${who} had no treasury output: nothing had been deposited yet.`] };
    }
    case "WithdrawalBundleProposals": {
      const list = array(body.proposals).map(p => object(p));
      return { title: `Reading: ${who}'s pending withdrawals`, slot, lesson: "withdrawals", reading: true, lines: list.length
        ? list.map(p => `Bundle ${short(String(p.m6id ?? "unknown"))}: ${num(p.vote_count)?.toLocaleString("en-US") ?? "unknown"} votes, proposed in ${blockNumber(num(p.proposal_height))}.`).concat("These are the votes at the moment of this reading, not every vote in between.")
        : [`No withdrawal bundle of ${who} was being voted on at the moment of this reading.`] };
    }
    case "BmmRequests": {
      const list = array(body.requests).map(r => object(r));
      return { title: "Sample of open merged-mining bids", lesson: "merged-mining", reading: true, lines: [list.length
        ? `The monitor saw ${list.length} open bids: ${list.map(r => `${sidechainLabel(num(r.sidechain_number), names)} ${formatSats(r.bid_sats, unit)}`).join(", ")}.`
        : "The monitor saw no open bids in this sample. That does not prove there were none.", "Each bid can only be accepted in the block right after the one it names."] };
    }
    default:
      return fallback;
  }
}

export const captureText: Record<string, string> = {
  live: "live, as it happened",
  backfill: "catch-up read",
  poll: "scheduled reading",
};
