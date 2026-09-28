import type { ProtocolItem } from "./types";

export type ObjectValue = Record<string, unknown>;
export function object(value: unknown): ObjectValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
}
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
export function at(value: unknown, ...keys: string[]): unknown { return keys.reduce((v, k) => object(v)[k], value); }
export function text(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : fallback;
}
export function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
export function exact(value: unknown): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return "Unknown";
  return BigInt(value).toLocaleString("en-US");
}
export function short(value: string): string { return value.length > 28 ? value.slice(0, 12) + "…" + value.slice(-10) : value; }
export function label(value: string): string { return value.replaceAll("_", " "); }
export function title(item: ProtocolItem): string {
  const d = item.data;
  if (item.kind === "instance" || item.kind === "proposal") {
    const sidechain = object(d)[item.kind === "instance" ? "sidechain" : "proposal"];
    return text(at(sidechain, "declaration", "declaration", "V0", "title"), `Sidechain #${item.slot ?? "?"}`);
  }
  if (item.kind === "bundle") return `Withdrawal · ${short(text(at(d, "bundle", "m6id"), text(object(d).m6id)))}`;
  if (item.kind === "deposit") return `Deposit · ${exact(object(d).value_sats)} sats`;
  if (item.kind === "ctip") return object(d).ctip === null ? "No CTIP observed" : `Treasury · ${exact(at(d, "ctip", "value_sats"))} sats`;
  return label(item.kind);
}
export function detailHref(item: ProtocolItem): string | undefined {
  const id = encodeURIComponent(item.entity_id ?? item.id);
  return ({ instance: `/sidechain-instances/${id}`, proposal: `/proposals/${id}`, bundle: `/bundle-attempts/${id}`, run: `/about/data/runs/${id}`, snapshot_group: `/about/data/snapshots/${id}` } as Record<string,string>)[item.kind];
}
export function apiQuery(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [k,v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
  return params.toString();
}
