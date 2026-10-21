import type { Overview, Sidechains, Status, Meta, Coverage, Auctions, Evidence, Blocks, Block, ProtocolPage } from "@/lib/types";
import { browserNetwork, defaultNetwork } from "@/lib/network";

/**
 * The API the browser reads: the page's network, fixed for the page's life
 * (switching networks reloads). Server code passes the request's base instead.
 */
export const browserApiBase = (browserNetwork ?? defaultNetwork).apiBaseUrl;

export async function getJson<T>(path: string, base = browserApiBase): Promise<T> {
  const response = await fetch(base + path, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiFailure(response.status);
  }
  return (await response.json()) as T;
}

export function getOverview(): Promise<Overview> {
  return getJson<Overview>("/api/v1/overview");
}

export function getSidechains(): Promise<Sidechains> {
  return getJson<Sidechains>("/api/v1/sidechains");
}


export const getStatus = () => getJson<Status>("/api/v1/status");
export const getMeta = () => getJson<Meta>("/api/v1/meta");
export const getCoverage = () => getJson<Coverage>("/api/v1/coverage");
export const getAuctions = () => getJson<Auctions>("/api/v1/bmm/auctions");
export const getEvidence = (dataset: string, id: string, base?: string) => getJson<Evidence>(`/api/v1/datasets/${encodeURIComponent(dataset)}/events/${encodeURIComponent(id)}`, base);

export class ApiFailure extends Error {
  constructor(public status: number) { super("Observatory API returned " + status); }
}
export const getBlocks = (query = "") => getJson<Blocks>("/api/v1/blocks" + (query ? "?" + query : ""));
export const getBlock = (dataset: string, hash: string, base?: string) => getJson<Block>(`/api/v1/blocks/${encodeURIComponent(hash)}?dataset=${encodeURIComponent(dataset)}`, base);
export const getProvenance = (resource: "runs" | "snapshot-groups", id: string, base?: string) => getJson<ProtocolPage>(`/api/v1/${resource}/${encodeURIComponent(id)}`, base);
