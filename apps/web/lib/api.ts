import type { Overview, Sidechains, Status, Meta, Coverage, Auctions, Evidence, Blocks, Block } from "@/lib/types";

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8080";

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiBaseUrl + path, {
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
export const getEvidence = (dataset: string, id: string) => getJson<Evidence>(`/api/v1/datasets/${encodeURIComponent(dataset)}/events/${encodeURIComponent(id)}`);

export class ApiFailure extends Error {
  constructor(public status: number) { super("Observatory API returned " + status); }
}
export const getBlocks = (query = "") => getJson<Blocks>("/api/v1/blocks" + (query ? "?" + query : ""));
export const getBlock = (dataset: string, hash: string) => getJson<Block>(`/api/v1/blocks/${encodeURIComponent(hash)}?dataset=${encodeURIComponent(dataset)}`);
