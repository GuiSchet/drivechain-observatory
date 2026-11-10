import type { Overview, Sidechains, Status, Meta, Coverage, Auctions, Evidence, Blocks, Block, ProtocolPage } from "@/lib/types";
import { browserNetwork, defaultNetwork } from "@/lib/network";

/**
 * The API the browser reads: the page's network, fixed for the page's life
 * (switching networks reloads). Server code passes the request's base instead.
 */
export const browserApiBase = (browserNetwork ?? defaultNetwork).apiBaseUrl;

const TIMEOUT_MS = 8_000;

/** Our timeout, joined with the caller's signal (React Query aborts a fetch nobody is waiting for any more). */
function deadline(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (!signal) return timeout;
  return typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function getJson<T>(path: string, base = browserApiBase, signal?: AbortSignal): Promise<T> {
  const response = await fetch(base + path, {
    // The browser revalidates every time (a 304 once the API sends validators); the server never caches.
    cache: typeof window === "undefined" ? "no-store" : "no-cache",
    signal: deadline(signal),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiFailure(response.status);
  }
  return (await response.json()) as T;
}

/** Also a queryFn: React Query passes its context, whose `signal` aborts the fetch. */
export function getOverview({ signal }: { signal?: AbortSignal } = {}): Promise<Overview> {
  return getJson<Overview>("/api/v1/overview", undefined, signal);
}

export function getSidechains(): Promise<Sidechains> {
  return getJson<Sidechains>("/api/v1/sidechains");
}


type Signal = { signal?: AbortSignal };
export const getStatus = ({ signal }: Signal = {}) => getJson<Status>("/api/v1/status", undefined, signal);
export const getMeta = ({ signal }: Signal = {}) => getJson<Meta>("/api/v1/meta", undefined, signal);
export const getCoverage = ({ signal }: Signal = {}) => getJson<Coverage>("/api/v1/coverage", undefined, signal);
export const getAuctions = ({ signal }: Signal = {}) => getJson<Auctions>("/api/v1/bmm/auctions", undefined, signal);
export const getEvidence = (dataset: string, id: string, base?: string) => getJson<Evidence>(`/api/v1/datasets/${encodeURIComponent(dataset)}/events/${encodeURIComponent(id)}`, base);

export class ApiFailure extends Error {
  constructor(public status: number) { super("Observatory API returned " + status); }
}
export const getBlocks = (query = "", signal?: AbortSignal) => getJson<Blocks>("/api/v1/blocks" + (query ? "?" + query : ""), undefined, signal);
export const getBlock = (dataset: string, hash: string, base?: string) => getJson<Block>(`/api/v1/blocks/${encodeURIComponent(hash)}?dataset=${encodeURIComponent(dataset)}`, base);
export const getProvenance = (resource: "runs" | "snapshot-groups", id: string, base?: string) => getJson<ProtocolPage>(`/api/v1/${resource}/${encodeURIComponent(id)}`, base);
