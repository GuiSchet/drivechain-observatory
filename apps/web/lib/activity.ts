import type { ProtocolItem } from "./types";
import { at, object } from "./protocol";
import { sats } from "./explain";

/** A treasury before and after one deposit. `after` is a separate reading of the output the deposit created. */
export type TreasuryChange = { before: bigint; after: bigint; sequence?: string; reading: ProtocolItem };

export type ActivityEntry =
  | { type: "item"; key: string; item: ProtocolItem; treasury?: TreasuryChange }
  /** Commitments recorded in one L1 block, one per sidechain. */
  | { type: "bmm"; key: string; height: number | null | undefined; items: ProtocolItem[] }
  /** Consecutive vote readings of one withdrawal bundle, newest first. */
  | { type: "votes"; key: string; items: ProtocolItem[] };

/** The txid of the treasury output a ctip reading reports. */
function ctipTxid(item: ProtocolItem): string | undefined {
  const txid = at(item.data, "ctip", "txid");
  return item.kind === "ctip" && typeof txid === "string" ? txid : undefined;
}

/** The treasury output a deposit created: the enforcer reports `value` as new treasury minus old. */
export function treasuryChange(deposit: ProtocolItem, reading: ProtocolItem | undefined): TreasuryChange | undefined {
  if (!reading) return undefined;
  const ctip = object(object(reading.data).ctip);
  const after = sats(ctip.value_sats), value = sats(object(deposit.data).value_sats);
  if (after === undefined || value === undefined || value > after) return undefined;
  return { before: after - value, after, sequence: typeof ctip.sequence_number === "string" ? ctip.sequence_number : undefined, reading };
}

/** The tip a state reading was first taken at; null for facts anchored to a block. */
export function readingTip(item: ProtocolItem): number | undefined {
  const tip = at(item.data, "observation_window", "reference_tip_height");
  return item.height == null && typeof tip === "number" ? tip : undefined;
}

/**
 * Turns a page of activity into what a learner reads: a deposit carries the treasury reading it created,
 * commitments of one block form one row, and consecutive vote readings of one bundle form one row.
 */
export function groupActivity(items: ProtocolItem[]): ActivityEntry[] {
  const readings = new Map<string, ProtocolItem>();
  for (const item of items) { const txid = ctipTxid(item); if (txid && !readings.has(txid)) readings.set(txid, item); }
  const used = new Set<string>(), entries: ActivityEntry[] = [];
  for (const item of items) {
    if (item.kind !== "deposit") continue;
    const txid = at(item.data, "outpoint", "txid"), reading = typeof txid === "string" ? readings.get(txid) : undefined;
    if (reading && treasuryChange(item, reading)) used.add(reading.id);
  }
  for (const item of items) {
    if (used.has(item.id)) continue;
    const last = entries[entries.length - 1];
    if (item.kind === "bmm_commitment") {
      if (last?.type === "bmm" && last.height === item.height) last.items.push(item);
      else entries.push({ type: "bmm", key: item.id, height: item.height, items: [item] });
    } else if (item.kind === "bundle" && item.entity_id) {
      if (last?.type === "votes" && last.items[0].entity_id === item.entity_id) last.items.push(item);
      else entries.push({ type: "votes", key: item.id, items: [item] });
    } else {
      const txid = item.kind === "deposit" ? at(item.data, "outpoint", "txid") : undefined;
      const treasury = typeof txid === "string" ? treasuryChange(item, readings.get(txid)) : undefined;
      entries.push({ type: "item", key: item.id, item, treasury });
    }
  }
  return entries;
}
