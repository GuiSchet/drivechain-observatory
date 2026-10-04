"use client";
import { ProtocolList } from "./protocol-browser";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiFailure, getBlock } from "@/lib/api";
import type { Block } from "@/lib/types";
import { BranchSummary } from "./branch-summary";
export function BlockDetail({dataset,hash,initial}:{dataset:string;hash:string;initial:Block|null}) {
  const query=useQuery({queryKey:["blocks","detail",dataset,hash],queryFn:()=>getBlock(dataset,hash),initialData:initial??undefined,retry:(n,e)=>!(e instanceof ApiFailure&&e.status===404)&&n<2});
  const data=query.data;
  const groups=new Map<string,NonNullable<Block["facts"]>>();
  for(const fact of data?.facts??[]){const name=fact.slot==null?"Global observations":`Slot #${fact.slot}`;groups.set(name,[...(groups.get(name)??[]),fact]);}
  return <main className="detail-shell"><Link className="text-link" href="/blocks">← Block explorer</Link><div className="eyebrow">PERMANENT BLOCK REFERENCE</div><h1>{data?`Block ${data.block.height}`:"Block detail"}</h1>
    <p className="hash">{hash}</p>
    {query.isError&&<p className="inline-notice" role="status">{query.error instanceof ApiFailure&&query.error.status===404?"This block header has not been imported for this dataset. A tip or disconnect can arrive before its header.":"API unavailable. Any values below are the last loaded view."}</p>}
    {data&&<><section className="panel compact-panel"><h2>Header and membership</h2><dl className="facts">
      <dt>Membership</dt><dd>{data.block.membership}{data.block.conflicted&&" · conflicting evidence"}</dd>
      <dt>Parent</dt><dd className="hash"><Link className="text-link" href={`/datasets/${dataset}/blocks/${data.block.parent_hash}`}>{data.block.parent_hash}</Link></dd>
      <dt>Block work</dt><dd className="hash">{data.block.block_work ?? "unknown"}</dd><dt>Accumulated work</dt><dd className="hash">{data.block.chain_work}</dd><dt>Block time</dt><dd>{data.block.block_time}</dd>
      <dt>First fact observed</dt><dd>{data.block.first_observed_at}</dd><dt>Last fact observed</dt><dd>{data.block.last_observed_at}</dd>
    </dl></section><BranchSummary branch={data.branch} dataset={dataset}/>
    {[...groups].map(([name,facts])=><section className="panel compact-panel" key={name}><h2>{name}</h2><ul className="evidence-list">{facts.map(f=><li key={f.event_id}><Link className="text-link" href={`/datasets/${dataset}/events/${f.event_id}`}>{f.kind.replaceAll("_"," ")} · event {f.event_id}</Link><span>Contract v{f.contract} · observed {f.observed_at} · ingested {f.ingested_at}</span>{f.interpretation_error&&<span className="error-text">{f.interpretation_error}</span>}</li>)}</ul></section>)}
    {data.facts_truncated&&<p className="inline-notice">Showing the latest 200 facts for this block.</p>}
    <section className="panel compact-panel table-scroll"><h2>Connections and disconnections</h2><p>A disconnection is an observation, not a permanent exclusion of this block.</p><table><thead><tr><th>Observation</th><th>Kind / slot</th><th>Method</th><th>Time</th><th>Run / sequence</th></tr></thead><tbody>{data.observations.map(o=><tr key={o.observation_id}><td><Link className="text-link" href={`/datasets/${dataset}/events/${o.event_id}`}>#{o.observation_id}</Link></td><td>{o.kind.replaceAll("_"," ")} / {o.slot??"global"}</td><td>{o.capture_method}</td><td>{o.observed_at}</td><td className="hash">{o.run_id} / {o.capture_seq}</td></tr>)}</tbody></table>{!data.observations.length&&<p>No occurrences have been imported yet.</p>}{data.observations_truncated&&<p>Showing the latest 200 occurrences.</p>}</section></>}
    <ProtocolList resource="activity" query={{dataset,hash,scope:"all"}} heading="Protocol activity in this block"/>
    <ProtocolList resource="protocol-messages" query={{dataset,hash,scope:"all"}} heading="Coinbase messages"/>
    <ProtocolList resource="events" query={{dataset,hash,scope:"all"}} heading="All block evidence"/>
    {!data&&!query.isError&&<p role="status">Loading block evidence…</p>}
  </main>;
}
