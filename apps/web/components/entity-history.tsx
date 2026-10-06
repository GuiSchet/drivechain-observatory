"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { apiQuery } from "@/lib/protocol";
import type { ProtocolPage } from "@/lib/types";
import { HistoryChart } from "./protocol-charts";
import { ProtocolList } from "./protocol-browser";
function Inner({resource,id}:{resource:string;id:string}) {
  const params=useSearchParams(),dataset=params.get("dataset")??undefined;
  const query=apiQuery({dataset,key:id,scope:"all"});
  const result=useQuery({queryKey:["protocol",resource,"entity",query],queryFn:()=>getJson<ProtocolPage>(`/api/v1/${resource}?${query}`)});
  const item=result.data?.items[0];if(!item)return null;
  const canonical=item.entity_id??id;
  return <><HistoryChart slot={item.slot??undefined} entity={item.kind==="instance"?undefined:canonical} instanceId={item.kind==="instance"?canonical:undefined} kind={item.kind==="instance"?"ctip":item.kind==="proposal"?"proposal":"bundle"} dataset={dataset}/>
    {item.kind==="instance" ? <ProtocolList resource={`sidechain-instances/${encodeURIComponent(canonical)}/ctip`} query={{dataset}} heading="Treasury observations for this instance"/> : <ProtocolList resource="activity" query={{dataset,key:canonical,scope:"all"}} heading="Attempt history"/>}</>;
}
export function EntityHistory(props:Parameters<typeof Inner>[0]) {return <Suspense fallback={<p>Loading history…</p>}><Inner {...props}/></Suspense>;}
