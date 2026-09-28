"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { apiQuery, number, object } from "@/lib/protocol";
import type { ProtocolPage } from "@/lib/types";
import { HistoryChart } from "./protocol-charts";
import { ProtocolList } from "./protocol-browser";
function Inner({resource,id}:{resource:string;id:string}) {
  const params=useSearchParams(),dataset=params.get("dataset")??undefined;
  const query=apiQuery({dataset,key:id,scope:"all"});
  const result=useQuery({queryKey:["protocol",resource,"entity",query],queryFn:()=>getJson<ProtocolPage>(`/api/v1/${resource}?${query}`)});
  const item=result.data?.items[0];if(!item)return null;
  const canonical=item.entity_id??id,d=object(item.data),instance=object(d.sidechain),start=number(instance.activation_height),end=number(d.ended_height),last=number(d.last_active_height);
  return <>{item.membership==="selected" && <HistoryChart slot={item.slot??undefined} entity={item.kind==="instance"?undefined:canonical} kind={item.kind==="instance"?"ctip":item.kind==="proposal"?"proposal":"bundle"} dataset={dataset} fromHeight={start} toHeight={end!=null?end-1:item.is_current===true?undefined:last}/>}
    {item.kind==="instance" ? <ProtocolList resource={`sidechain-instances/${encodeURIComponent(canonical)}/ctip`} query={{dataset}} heading="Treasury during this instance"/> : <ProtocolList resource="activity" query={{dataset,key:canonical,scope:"all"}} heading="Attempt history"/>}</>;
}
export function EntityHistory(props:Parameters<typeof Inner>[0]) {return <Suspense fallback={<p>Loading history…</p>}><Inner {...props}/></Suspense>;}
