"use client";

import { QueryClient, QueryClientProvider, type QueryKey } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState, useRef, useSyncExternalStore } from "react";
import { ApiFailure, browserApiBase } from "@/lib/api";
import type { Status } from "@/lib/types";
import { browserNetwork, defaultNetwork, type Network, networkFacts, rememberNetwork } from "@/lib/network";

type StreamState = "connecting" | "connected" | "reconnecting";
const StreamContext = createContext<StreamState>("connecting");
export const useStreamState = () => useContext(StreamContext);

export type LiveActivity = { id:string; hash:string; height:number; animation_eligible:boolean; events:{kind:string;slot:number;status?:string;event_id?:string}[] };
const ActivityContext=createContext<LiveActivity|null>(null);
export const useLiveActivity=()=>useContext(ActivityContext);

const fixedForThePage = () => () => {};
/** The network this page shows. The server renders the default; the browser's own choice applies after hydration. */
export function useNetwork(): Network {
  return useSyncExternalStore(fixedForThePage, () => browserNetwork ?? defaultNetwork, () => defaultNetwork);
}
export const useApiBase = () => useNetwork().apiBaseUrl;
export const useNetworkFacts = () => networkFacts(useNetwork().id);

/**
 * Retry once, and only failures a retry can fix: a 5xx or a dropped connection.
 * Not a 4xx (the API's 408 means the query itself is too slow) and not our own timeout.
 */
function retryOnce(failures: number, error: unknown): boolean {
  if (failures >= 1) return false;
  if (error instanceof ApiFailure) return error.status >= 500;
  return !(error instanceof DOMException && error.name === "TimeoutError");
}

/**
 * The cached queries a stream update can affect, by the resource names in its `changed` list.
 * Any other name (sidechains, proposals, treasury, bundles, events, activity…) is a change of the
 * protocol state, which every "protocol" query reads.
 */
const affected: Record<string, QueryKey[]> = {
  overview: [["overview"]],
  status: [["status"]],
  meta: [["meta"]],
  coverage: [["coverage"]],
  bmm: [["bmm"], ["protocol", "bmm"], ["protocol", "bmm/confirmed"], ["protocol", "bmm/commitments"], ["protocol", "network"]],
  blocks: [["blocks"], ["protocol", "blocks"], ["protocol", "network"], ["protocol", "chain-info"]],
};
const protocolState: QueryKey[] = [["protocol"], ["overview"]];
const keysFor = (resource: string) => affected[resource] ?? protocolState;

/**
 * The stream can announce several updates a second; refetch each group of queries at most this often.
 * A query already being fetched is not restarted (a slow one would otherwise never finish).
 */
const REFRESH_EVERY_MS = 10_000;

function throttledInvalidation(client: QueryClient) {
  const last = new Map<string, number>(), timers = new Map<string, ReturnType<typeof setTimeout>>();
  const run = (key: QueryKey) => {
    // A hidden tab only marks its data stale; it refetches when the reader comes back (refetchOnWindowFocus).
    const refetchType = document.visibilityState === "visible" ? "active" : "none";
    void client.invalidateQueries({ queryKey: key, refetchType }, { cancelRefetch: false });
  };
  const invalidate = (key: QueryKey) => {
    const id = JSON.stringify(key);
    if (timers.has(id)) return;
    const wait = Math.max(0, (last.get(id) ?? -Infinity) + REFRESH_EVERY_MS - Date.now());
    timers.set(id, setTimeout(() => { timers.delete(id); last.set(id, Date.now()); run(key); }, wait));
  };
  const stop = () => { for (const t of timers.values()) clearTimeout(t); timers.clear(); };
  return { invalidate, stop };
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    // Changes arrive through the stream; staleness only matters for a tab coming back into view.
    staleTime: 30_000, retry: retryOnce, refetchOnWindowFocus: true,
  } } }));
  const [activity,setActivity]=useState<LiveActivity|null>(null);
  const seen=useRef(new Set<string>());
  const [state, setState] = useState<StreamState>("connecting");
  useEffect(() => {
    // A shared ?network= link becomes the reader's choice for the next pages too.
    if (browserNetwork && new URLSearchParams(window.location.search).get("network") === browserNetwork.id) rememberNetwork(browserNetwork.id);
  }, []);
  useEffect(()=>{if(!activity)return;const timeout=setTimeout(()=>setActivity(null),2500);return()=>clearTimeout(timeout);},[activity]);
  useEffect(() => {
    const { invalidate, stop } = throttledInvalidation(client);
    // A new tip refreshes what depends on the chain even if its stream update was missed: one that landed between
    // the first fetches and the subscription (the stream then had no cursor to replay from), or during an outage.
    let tip: string | undefined;
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type !== "updated" || event.action.type !== "success" || event.query.queryKey[0] !== "status") return;
      const next = (event.query.state.data as Status | undefined)?.branch?.tip_hash ?? undefined;
      if (tip && next && next !== tip) for (const key of [...protocolState, ...affected.blocks]) invalidate(key);
      tip = next ?? tip;
    });
    let stopped = false;
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      source = new EventSource(browserApiBase + "/api/v1/stream");
      // A reconnection resumes from Last-Event-ID, so the server replays what this tab missed.
      source.onopen = () => setState("connected");
      source.onerror = () => setState("reconnecting");
      source.addEventListener("update", (message) => {
        try {
          const data = JSON.parse((message as MessageEvent<string>).data) as { changed?: unknown; activity?: unknown; dataset_id?:string; projection_generation?:string; revision?:string };
          if (!Array.isArray(data.changed)) return;
          const id=`${data.dataset_id}:${data.projection_generation}:${data.revision}`;
          if(!seen.current.has(id)) {
            seen.current.add(id);if(seen.current.size>512)seen.current.delete(seen.current.values().next().value!);
            if(document.visibilityState==="visible"&&Array.isArray(data.activity)) {
              const block=data.activity.find(a=>a?.kind==="block_observed"&&a.animation_eligible===true&&typeof a.hash==="string"&&typeof a.height==="number");
              if(block)setActivity({id,hash:block.hash,height:block.height,animation_eligible:true,events:data.activity.filter(a=>a?.animation_eligible===true&&typeof a.kind==="string"&&Number.isInteger(a.slot)).map(a=>({kind:a.kind,slot:a.slot,status:a.status,event_id:a.evidence?.[0]?.event_id}))});
            }
          }
          for (const resource of data.changed) {
            if (typeof resource === "string") for (const key of keysFor(resource)) invalidate(key);
          }
        } catch { /* A bad frame must not discard the last usable view. */ }
      });
      source.addEventListener("reset_required", () => {
        source?.close();
        setState("reconnecting");
        void client.invalidateQueries();
        // A new EventSource clears its obsolete Last-Event-ID.
        timer = setTimeout(connect, 1_000);
      });
    };
    connect();
    return () => { stopped = true; source?.close(); if (timer) clearTimeout(timer); stop(); unsubscribe(); };
  }, [client]);
  return <QueryClientProvider client={client}><StreamContext.Provider value={state}><ActivityContext.Provider value={activity}>{children}</ActivityContext.Provider></StreamContext.Provider></QueryClientProvider>;
}
