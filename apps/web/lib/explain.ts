import type { ProtocolItem } from "./types";
import { at, exact, object, short, text } from "./protocol";

/** How a value was established, in the three words a learner needs. */
export type Confidence = "observed" | "read" | "unknown";

export function confidenceOf(quality: string | null | undefined): Confidence {
  if (quality === "observed") return "observed";
  if (quality === "tip_matched") return "read";
  return "unknown";
}

export const confidenceText: Record<Confidence, { label: string; detail: string }> = {
  observed: { label: "Observed in a block", detail: "The official sources reported this for a specific L1 block." },
  read: { label: "Read at a stable tip", detail: "A reading of current state, taken while the chain tip stayed the same before and after. It shows the state at that moment, not the history of how it got there." },
  unknown: { label: "Unknown", detail: "This value is missing, conflicting, or was read while the chain moved. Nothing is guessed to fill the gap." },
};

/** One coin is 100,000,000 sats on this Bitcoin-derived chain. */
const SATS_PER_COIN = BigInt(100_000_000);

export function sats(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}

/** Exact sats, e.g. "1,000,000,000 sats". */
export function formatSats(value: unknown, unit = "sats"): string {
  const v = sats(value);
  return v === undefined ? "Unknown" : `${v.toLocaleString("en-US")} ${unit}`;
}

/** Whole coins, e.g. "10 coins" or "0.00115 coins". Exact unless `approx`, which keeps two decimals and says so. */
export function formatCoins(value: unknown, approx = false): string {
  const v = sats(value);
  if (v === undefined) return "Unknown";
  if (approx && v >= SATS_PER_COIN && v % BigInt(1_000_000) !== BigInt(0)) {
    const hundredths = (v + BigInt(500_000)) / BigInt(1_000_000);
    return `≈ ${(hundredths / BigInt(100)).toLocaleString("en-US")}.${(hundredths % BigInt(100)).toString().padStart(2, "0")} coins`;
  }
  const whole = v / SATS_PER_COIN, fraction = (v % SATS_PER_COIN).toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? "." + fraction : ""} ${whole === BigInt(1) && !fraction ? "coin" : "coins"}`;
}

/** Two amounts in whole coins, rounded only while rounding still shows the difference between them. */
export function formatCoinPair(a: unknown, b: unknown): [string, string] {
  const x = formatCoins(a, true), y = formatCoins(b, true);
  return x === y ? [formatCoins(a), formatCoins(b)] : [x, y];
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "time unknown";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "time unknown";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function blockNumber(height: number | null | undefined): string {
  return height == null ? "an unknown block" : `block ${height.toLocaleString("en-US")}`;
}

export type SidechainNames = Record<string, string>;

/** "Thunder (#9)", or "slot #9" when the name was not observed. */
export function sidechainLabel(slot: number | null | undefined, names: SidechainNames): string {
  if (slot == null) return "an unknown sidechain";
  const name = names[String(slot)];
  return name ? `${name} (#${slot})` : `slot #${slot}`;
}

export function declarationOf(value: unknown): { title?: string; description?: string; hash1?: string; hash2?: string } {
  const v0 = object(at(value, "declaration", "declaration", "V0"));
  const str = (x: unknown) => typeof x === "string" ? x : undefined;
  return { title: str(v0.title), description: str(v0.description), hash1: str(v0.hash_id_1), hash2: str(v0.hash_id_2) };
}

/** Decodes a deposit's raw address bytes when they are printable text. */
export function depositAddress(hex: unknown): string | undefined {
  if (typeof hex !== "string" || !/^([0-9a-f]{2})+$/i.test(hex)) return undefined;
  const chars = hex.match(/../g)!.map(b => parseInt(b, 16));
  return chars.every(c => c >= 0x21 && c <= 0x7e) ? String.fromCharCode(...chars) : undefined;
}

export function outcomeOf(item: ProtocolItem): "Submitted" | "Succeeded" | "Failed" | undefined {
  const state = Object.keys(object(object(item.data).state))[0];
  return state === "Submitted" || state === "Succeeded" || state === "Failed" ? state : undefined;
}

/** A one-sentence, plain-English description of an activity record. */
export function describeActivity(item: ProtocolItem, names: SidechainNames, unit = "sats"): string {
  const d = object(item.data), who = sidechainLabel(item.slot, names);
  switch (item.kind) {
    case "deposit": return `${formatCoins(d.value_sats)} (${formatSats(d.value_sats, unit)}) deposited into ${who}.`;
    case "bundle_outcome": {
      const outcome = outcomeOf(item);
      if (outcome === "Submitted") return `A withdrawal bundle for ${who} was put up for a miner vote.`;
      if (outcome === "Succeeded") return `A withdrawal bundle from ${who} was paid out on L1.`;
      if (outcome === "Failed") return `A withdrawal bundle for ${who} failed; nothing was paid.`;
      return `A withdrawal bundle event was recorded for ${who}.`;
    }
    case "bundle": {
      const votes = at(d, "bundle", "vote_count");
      return `${who} has a pending withdrawal with ${typeof votes === "number" ? votes.toLocaleString("en-US") : "an unknown number of"} votes.`;
    }
    case "ctip_snapshot":
    case "ctip": {
      if (d.ctip === null) return `${who} has no treasury output yet.`;
      const value = at(d, "ctip", "value_sats"), seq = at(d, "ctip", "sequence_number");
      return `${who}'s treasury holds ${formatCoins(value)} (${formatSats(value, unit)})${typeof seq === "string" || typeof seq === "number" ? ` in output #${seq}` : ""}.`;
    }
    case "bmm_commitment":
    case "slot_block": return d.bmm_commitment ? `The miner committed to a ${who} block (blind merged mining).` : `No merged-mining commitment for ${who} in this block.`;
    case "instance": {
      const sc = object(d.sidechain ?? d), since = sc.activation_height;
      return `${declarationOf(sc).title ?? who} is active in slot #${item.slot ?? "?"}${typeof since === "number" ? `, since ${blockNumber(since)}` : ""}.`;
    }
    case "proposal": return `${declarationOf(object(d.proposal)).title ?? "A sidechain"} is proposed for slot #${item.slot ?? "?"}.`;
    case "confirmed_bmm_fee": return d.fee_sats == null ? `A merged-mining payment for ${who} was confirmed; its fee is unknown.` : `A merged-mining payment of ${formatSats(d.fee_sats, unit)} for ${who} was confirmed.`;
    case "bid": return `Someone bid ${formatSats(d.bid_sats, unit)} for the right to make the next ${who} block.`;
    case "auction":
    case "auction_sample": return "The monitor sampled the open merged-mining bids.";
    case "tip":
    case "chain_tip": return `The chain tip was observed at ${blockNumber(item.height)}.`;
    case "mainchain_transition": return `The enforcer reported a change of the chain at ${blockNumber(item.height)}.`;
    case "block_connected": return `${blockNumber(item.height)} was added to the chain.`;
    case "block_disconnected": return `${blockNumber(item.height)} was removed from the chain by a reorganization.`;
    case "parameters": return "The enforcer reported the network's BIP300 parameters.";
    default: return `${item.kind.replaceAll("_", " ")} recorded.`;
  }
}

export { exact, short, text };
