"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getJson } from "@/lib/api";
import type { Observatory } from "@/lib/types";
import { apiQuery, at, exact, object, text } from "@/lib/protocol";
import { ContextNote, ProtocolCard, ProtocolList } from "./protocol-browser";
import { HistoryChart } from "./protocol-charts";
import { BmmHistory } from "./protocol-visuals";

function ObservatoryInner({ slot }: {slot?:number}) {
  const params=useSearchParams(),dataset=params.get("dataset")??undefined;
  const query=apiQuery({slot,dataset});
  const result=useQuery({queryKey:["protocol","observatory",query],queryFn:()=>getJson<Observatory>(`/api/v1/observatory?${query}`)});
  const state=object(result.data?.state),active=object(state.active),treasury=object(state.treasury);
  const rows=Object.entries(active).filter(([s])=>slot==null||Number(s)===slot);
  return <main className="detail-shell"><div className="eyebrow">SIDECHAIN LIFECYCLES</div><h1>{slot==null?"Sidechains":`Sidechain slot #${slot}`}</h1>
    <p className="lede">A slot can host different sidechain instances over time. Explore activation, proposals, treasury history and the evidence behind each state.</p>
    <p className="export-links"><Link className="text-link" href="/proposals">Activation proposals</Link><Link className="text-link" href="/explorer?resource=sidechain-instances&scope=all">All observed instances</Link><Link className="text-link" href="/pegs">Deposits and withdrawals</Link></p>
    {result.isError && <p className="inline-notice" role="status">Current state is unavailable. Any values below are the last loaded view.</p>}
    {result.isPending && <p role="status">Loading sidechain state…</p>}
    {result.data && <><ContextNote context={result.data.context}/><section className="instance-grid" aria-label="Current sidechains">
      {rows.map(([s,value])=>{const a=object(value),ctip=treasury[s],id=`${s}:${text(a.proposal_height)}:${text(a.activation_height)}:${text(a.description_hash)}`;return <article className="panel compact-panel" key={id}><span className="section-kicker">Slot #{s}</span><h2><Link className="text-link" href={`/sidechains/${s}?dataset=${result.data!.context.meta.dataset_id}`}>{text(at(value,"declaration","declaration","V0","title"),"Unnamed sidechain")}</Link></h2><p>{text(at(value,"declaration","declaration","V0","description"),"No declared description")}</p><dl className="facts"><dt>Activated</dt><dd>{text(a.activation_height)}</dd><dt>Treasury</dt><dd>{ctip===undefined?"Unknown":ctip===null?"No CTIP":`${exact(object(ctip).value_sats)} sats`}</dd><dt>Pending bundles</dt><dd>{Array.isArray(state.bundle_complete)&&state.bundle_complete.includes(Number(s))?Object.keys(object(state.bundles)).filter(k=>k.startsWith(`${s}:`)).length:"Unknown completeness"}</dd></dl><Link className="text-link" href={`/sidechain-instances/${encodeURIComponent(id)}?dataset=${result.data!.context.meta.dataset_id}`}>Instance and declaration →</Link></article>;})}
      {!rows.length && <p className="empty-state">{state.active_complete===true ? "No active sidechains were returned in the latest response for this selection." : "No usable recent active-sidechain response is available for this selection."}</p>}
    </section></>}
    {slot!=null && <><HistoryChart slot={slot} dataset={dataset}/><BmmHistory slot={slot} dataset={dataset}/><ProtocolList resource="ctip/history" query={{slot,dataset}} heading="Treasury outputs"/><ProtocolList resource="deposits" query={{slot,dataset}} heading="Deposits"/><ProtocolList resource="withdrawal-bundles" query={{slot,dataset}} heading="Withdrawal attempts"/></>}
    <ProtocolList resource="sidechain-proposals" query={{slot,dataset}} heading="Activation proposals"/>
    <ProtocolList resource="sidechain-instances" query={{slot,dataset}} heading="Instance history"/>
    {result.data && <section className="panel compact-panel"><h2>Latest monitor snapshots</h2><p>Each snapshot retains its own capture boundary. Matching tip reads do not prove atomicity across RPCs or exclude a brief reorg.</p>{result.data.observations.map(item=><ProtocolCard key={item.id} item={item} context={result.data!.context}/>)}</section>}
    {slot!=null && <ProtocolList resource="activity" query={{slot,dataset}} heading="Activity story"/>}
  </main>;
}
export function ObservatoryView(props: {slot?:number}) {return <Suspense fallback={<main className="detail-shell">Loading sidechains…</main>}><ObservatoryInner {...props}/></Suspense>;}
