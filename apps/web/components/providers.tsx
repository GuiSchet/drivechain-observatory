"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState, useRef } from "react";
import { apiBaseUrl } from "@/lib/api";

type StreamState = "connecting" | "connected" | "reconnecting";
const StreamContext = createContext<StreamState>("connecting");
export const useStreamState = () => useContext(StreamContext);

export type LiveActivity = { id:string; hash:string; height:number; animation_eligible:boolean; events:{kind:string;slot:number;status?:string;event_id?:string}[] };
const ActivityContext=createContext<LiveActivity|null>(null);
export const useLiveActivity=()=>useContext(ActivityContext);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: {
    staleTime: 5_000, retry: 2, refetchOnWindowFocus: true,
  } } }));
  const [activity,setActivity]=useState<LiveActivity|null>(null);
  const seen=useRef(new Set<string>());
  const [state, setState] = useState<StreamState>("connecting");
  useEffect(()=>{if(!activity)return;const timeout=setTimeout(()=>setActivity(null),2500);return()=>clearTimeout(timeout);},[activity]);
  useEffect(() => {
    let stopped = false;
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      source = new EventSource(apiBaseUrl + "/api/v1/stream");
      source.onopen = () => {
        setState("connected");
        // Refetch after subscription to close the SSR/snapshot-to-stream race.
        void client.invalidateQueries();
      };
      source.onerror = () => setState("reconnecting");
      source.addEventListener("update", (message) => {
        try {
          const data = JSON.parse((message as MessageEvent<string>).data) as { changed?: unknown; activity?: unknown; dataset_id?:string; projection_generation?:string; revision?:string };
          if (!Array.isArray(data.changed)) return;
          void client.invalidateQueries({queryKey:["protocol"]});
          const id=`${data.dataset_id}:${data.projection_generation}:${data.revision}`;
          if(!seen.current.has(id)) {
            seen.current.add(id);if(seen.current.size>512)seen.current.delete(seen.current.values().next().value!);
            if(document.visibilityState==="visible"&&Array.isArray(data.activity)) {
              const block=data.activity.find(a=>a?.kind==="block_observed"&&a.animation_eligible===true&&typeof a.hash==="string"&&typeof a.height==="number");
              if(block)setActivity({id,hash:block.hash,height:block.height,animation_eligible:true,events:data.activity.filter(a=>a?.animation_eligible===true&&typeof a.kind==="string"&&Number.isInteger(a.slot)).map(a=>({kind:a.kind,slot:a.slot,status:a.status,event_id:a.evidence?.[0]?.event_id}))});
            }
          }
          for (const resource of data.changed) {
            if (typeof resource === "string") void client.invalidateQueries({ queryKey: [resource] });
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
    return () => { stopped = true; source?.close(); if (timer) clearTimeout(timer); };
  }, [client]);
  return <QueryClientProvider client={client}><StreamContext.Provider value={state}><ActivityContext.Provider value={activity}>{children}</ActivityContext.Provider></StreamContext.Provider></QueryClientProvider>;
}
