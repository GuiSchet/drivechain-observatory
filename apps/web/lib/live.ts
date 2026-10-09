"use client";
import { useQuery } from "@tanstack/react-query";
import { getJson, getOverview, getStatus } from "./api";
import { object, at } from "./protocol";
import { declarationOf, type SidechainNames } from "./explain";
import type { Observatory, ProtocolItem, ProtocolPage } from "./types";

// Query keys starting with "protocol" are refreshed by the live stream.

export function useOverview() {
  return useQuery({ queryKey: ["overview"], queryFn: getOverview });
}

export function useStatus() {
  return useQuery({ queryKey: ["status"], queryFn: getStatus, refetchInterval: 5_000 });
}

/** Height ranges whose global transitions the monitor did not observe (subscription gaps), from /coverage. */
export function useCoverageGaps(): [number, number][] {
  const coverage = useQuery({ queryKey: ["protocol", "coverage"], queryFn: () => getJson<{ transition_gaps?: { gap_start_height?: number | null; gap_end_height?: number | null }[] }>("/api/v1/coverage") });
  return (coverage.data?.transition_gaps ?? []).flatMap(g => typeof g.gap_start_height === "number" && typeof g.gap_end_height === "number" ? [[g.gap_start_height, g.gap_end_height] as [number, number]] : []);
}

export function useObservatory() {
  return useQuery({ queryKey: ["protocol", "observatory", ""], queryFn: () => getJson<Observatory>("/api/v1/observatory") });
}

export function useProtocolPage(resource: string, query = "", enabled = true) {
  return useQuery({ queryKey: ["protocol", resource, query], queryFn: () => getJson<ProtocolPage>(`/api/v1/${resource}${query ? "?" + query : ""}`), enabled });
}

export type ActiveSidechain = { slot: number; title?: string; description?: string; proposalHeight?: number; activationHeight?: number; voteCount?: number; descriptionHash?: string };

/** The latest official "active sidechains" response, sorted by slot. */
export function activeSidechains(data: Observatory | undefined): ActiveSidechain[] {
  return Object.entries(object(object(data?.state).active)).map(([slot, value]) => {
    const v = object(value), num = (x: unknown) => typeof x === "number" ? x : undefined;
    const decl = declarationOf(v);
    return { slot: Number(slot), title: decl.title, description: decl.description, proposalHeight: num(v.proposal_height), activationHeight: num(v.activation_height), voteCount: num(v.vote_count), descriptionHash: typeof v.description_hash === "string" ? v.description_hash : undefined };
  }).sort((a, b) => a.slot - b.slot);
}

export function useSidechainNames(): SidechainNames {
  const result = useObservatory();
  return Object.fromEntries(activeSidechains(result.data).filter(s => s.title).map(s => [String(s.slot), s.title!]));
}

export type NetworkParams = {
  activationHeight?: number;
  unusedThreshold?: number; unusedMaxAge?: number;
  usedThreshold?: number; usedMaxAge?: number;
  withdrawalThreshold?: number; withdrawalMaxAge?: number;
  item?: ProtocolItem; dataset?: string;
};

/** BIP300 parameters exactly as the enforcer reported them; nothing is hard-coded. */
export function useNetworkParams() {
  const result = useQuery({ queryKey: ["protocol", "chain-info", "params"], queryFn: () => getJson<ProtocolPage>("/api/v1/chain-info?limit=1") });
  const item = result.data?.items.find(i => i.kind === "parameters");
  const c = object(at(item?.data, "bip300_constants")), num = (x: unknown) => typeof x === "number" ? x : undefined;
  const params: NetworkParams = {
    activationHeight: num(c.activation_height),
    unusedThreshold: num(c.unused_sidechain_slot_activation_threshold), unusedMaxAge: num(c.unused_sidechain_slot_proposal_max_age),
    usedThreshold: num(c.used_sidechain_slot_activation_threshold), usedMaxAge: num(c.used_sidechain_slot_proposal_max_age),
    withdrawalThreshold: num(c.withdrawal_bundle_inclusion_threshold), withdrawalMaxAge: num(c.withdrawal_bundle_max_age),
    item, dataset: result.data?.context.meta.dataset_id,
  };
  return { ...result, params };
}

export function n(value: number | null | undefined): string {
  return value == null ? "unknown" : value.toLocaleString("en-US");
}

export function proofHref(item: ProtocolItem | undefined, dataset: string | undefined): string | undefined {
  const event = item?.evidence[0]?.event_id;
  return event && dataset ? `/datasets/${dataset}/events/${event}` : undefined;
}

/** The weakest quality among several separate readings: a total is only as certain as its least certain part. */
export function weakestQuality(items: (ProtocolItem | undefined)[]): string | null {
  if (!items.length || items.some(i => !i)) return null;
  const qualities = items.map(i => i!.quality);
  if (qualities.every(q => q === "observed")) return "observed";
  if (qualities.every(q => q === "observed" || q === "tip_matched")) return "tip_matched";
  return qualities.find(q => q !== "observed" && q !== "tip_matched") ?? null;
}

/** The latest official read of one snapshot kind (and slot), with its quality and evidence. */
export function snapshotOf(data: Observatory | undefined, kind: string, slot?: number): ProtocolItem | undefined {
  return data?.observations.find(o => o.kind === kind && (slot == null || o.slot === slot));
}
