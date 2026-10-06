"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { ApiFailure, apiBaseUrl, getJson } from "@/lib/api";
import type { ProtocolContext, ProtocolItem, ProtocolPage } from "@/lib/types";
import { apiQuery, array, at, detailHref, exact, label, number, object, short, text, title } from "@/lib/protocol";

export function Quality({ value }: { value: string }) { return <span className={`quality quality-${value}`}>{label(value)}</span>; }
export function CopyValue({ value }: { value: string }) {
  const [copied,setCopied] = useState(false);
  return <span className="copy-value"><span className="hash">{value}</span><button aria-label={`Copy ${value}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copied" : "Copy"}</button></span>;
}
export function ContextNote({ context }: { context: ProtocolContext }) {
  return <aside className="context-note" aria-label="Reconstruction context"><Quality value={context.state}/><span>At {context.anchor_height == null ? "unknown height" : `block ${context.anchor_height.toLocaleString("en-US")}`}</span><span>Branch {context.branch.status}</span>
    {!context.semantics_supported && <strong>{context.semantics_issue ?? "Historical protocol effects are not exposed by the official API."} Derived thresholds are unavailable.</strong>}
    <Link className="text-link" href="/about/data">Coverage and provenance</Link>
    {context.families.filter(f => f.first_error_event_id).map(f => <span className="error-text" key={f.family}>{f.family}: interpretation stopped at <Link className="text-link" href={`/datasets/${context.meta.dataset_id}/events/${f.first_error_event_id}`}>event {f.first_error_event_id}</Link></span>)}
  </aside>;
}
function Value({ value, name }: { value: unknown; name: string }) {
  if (value === null || value === undefined) return <>Unknown</>;
  if (name.endsWith("sats")) return <>{exact(value)} sats</>;
  const v = text(value);
  return v.length > 45 ? <CopyValue value={v}/> : <>{v}</>;
}
function DataFields({ value, omit = [] }: { value: unknown; omit?: string[] }) {
  return <dl className="facts">{Object.entries(object(value)).filter(([k,v]) => !omit.includes(k) && (v === null || typeof v !== "object")).map(([k,v]) => <div className="fact-row" key={k}><dt>{label(k)}</dt><dd><Value name={k} value={v}/></dd></div>)}</dl>;
}
function VoteWindow({ item, context }: { item: ProtocolItem; context: ProtocolContext }) {
  const d = object(item.data), state = object(d.bundle ?? d.proposal);
  const votes = number(state.vote_count), required = number(d.required_votes), maxAge = number(d.max_age), proposed = number(state.proposal_height);
  const current = item.membership === "selected" && item.is_current===true && d.status === "pending" && ["available", "partial"].includes(context.state);
  const age = proposed != null && context.anchor_height != null && current ? context.anchor_height - proposed : undefined;
  const left = age != null && maxAge != null ? Math.max(0,maxAge - age) : undefined;
  const needed = votes != null && required != null ? Math.max(0,required-votes) : undefined;
  return <div className="vote-window"><strong>{votes ?? "Unknown"} votes{required != null && ` / ${required} required`}</strong>
    {votes != null && required != null && <meter aria-label="Votes relative to required threshold" min={0} max={Math.max(1,required)} value={Math.min(votes,required)}/>}
    <p>{age == null ? "Age at the current tip is unavailable." : `Age ${age} blocks.`} {left != null && `${left} future voting opportunities before the age limit.`} {needed != null && `${needed} additional votes required.`}</p>
    {item.kind === "bundle" && left != null && needed != null && <p>Theoretical margin: {left-needed} blocks. Votes may decrease; this is not a success probability.</p>}
  </div>;
}
export function ProtocolCard({ item, context, expanded = false }: { item: ProtocolItem; context: ProtocolContext; expanded?: boolean }) {
  const d = object(item.data), href = detailHref(item), dataset = context.meta.dataset_id;
  const entity = object(d.sidechain ?? d.proposal ?? d.bundle);
  const declaration = at(entity,"declaration","declaration","V0");
  return <article className="protocol-card">
    <div className="record-heading"><div><span className="section-kicker">{label(item.kind)}{item.slot != null && <> · <Link href={`/sidechains/${item.slot}`}>slot #{item.slot}</Link></>}</span><h3>{href ? <Link className="text-link" href={`${href}?dataset=${dataset}`}>{title(item)}</Link> : title(item)}</h3></div><div className="badges"><Quality value={item.quality}/><Quality value={item.membership}/>{["instance","proposal","bundle"].includes(item.kind)&&<Quality value={item.is_current===true?"current":item.is_current===false?"historical":"current_state_unknown"}/>}{typeof d.status === "string" && <Quality value={d.status}/>}</div></div>
    <div className="record-times">{item.hash && <Link className="text-link" href={`/datasets/${dataset}/blocks/${item.hash}`}>Block {item.height ?? short(item.hash)}</Link>}{item.block_time && <span>Block time: <time>{item.block_time}</time></span>}{item.observed_at && <span>Observed: <time>{item.observed_at}</time></span>}</div>
    {item.issue && <p className="inline-notice" role="status">{item.issue}</p>}
    {declaration != null && <><p>{text(object(declaration).description, "No declared description")}</p><DataFields value={declaration} omit={["title","description"]}/></>}
    {(item.kind === "proposal" || item.kind === "bundle") && <VoteWindow item={item} context={context}/>}
    {Object.keys(entity).length > 0 && <DataFields value={entity} omit={["raw_description","vote_count"]}/>}
    {item.kind === "ctip" && (d.ctip === null ? <p>This response reported no treasury output during its observation window.</p> : <DataFields value={d.ctip}/>)}
    {item.kind === "deposit" && <DataFields value={d.outpoint}/>}
    <DataFields value={d} omit={["raw_description","raw_script_pubkey","status","max_age","required_votes","transaction"]}/>
    {d.message != null && Object.entries(object(d.message)).map(([name,value])=><section key={name}><h4>{name} · {object(d).accepted===true?"Accepted":"Not accepted"}</h4><DataFields value={value}/>{array(object(value).effects).map((effect,i)=><details key={i}><summary>Resolved effect · slot {text(object(effect).sidechain_number)}</summary><pre>{JSON.stringify(effect,null,2)}</pre></details>)}</section>)}
    {d.transition != null && <DataFields value={d.transition} omit={["transaction"]}/>}
    {(item.kind === "confirmed_bmm" || item.kind === "confirmed_bmm_fee") && <p>Confirmed fee: {d.fee_sats == null ? "unknown; the sampled bid is a separate observation" : `${exact(d.fee_sats)} sats`}.</p>}
    {d.requests != null && <div className="table-scroll"><table><caption>Sampled requests ({array(d.requests).length})</caption><thead><tr><th>Slot</th><th>Critical hash</th><th>Bid</th></tr></thead><tbody>{array(d.requests).map((request,i) => { const r=object(request); return <tr key={i}><td>{text(r.sidechain_number)}</td><td className="hash">{text(r.critical_hash)}</td><td>{exact(r.bid_sats)} sats</td></tr>; })}</tbody></table>{!array(d.requests).length && <p>This poll observed no requests.</p>}</div>}
    {(d.run_id || d.snapshot_group_id) ? <p className="evidence-links">{typeof d.run_id === "string" && <Link className="text-link" href={`/about/data/runs/${d.run_id}?dataset=${dataset}`}>Source run</Link>}{typeof d.snapshot_group_id === "string" && <Link className="text-link" href={`/about/data/snapshots/${d.snapshot_group_id}?dataset=${dataset}`}>Snapshot group</Link>}</p> : null}
    {!!item.evidence.length && <div className="evidence-links">{item.evidence.map((ref,i) => <Link className="text-link" key={`${ref.event_id}:${ref.ordinal}:${i}`} href={`/datasets/${dataset}/events/${ref.event_id}`}>Evidence #{ref.event_id}:{ref.ordinal}{ref.observation_id && ` · occurrence ${ref.observation_id}`}</Link>)}</div>}
    <details open={expanded || undefined}><summary>All interpreted fields</summary><pre tabIndex={0}>{JSON.stringify(item.data,null,2)}</pre></details>
  </article>;
}
export function ProtocolList({ resource, query = {}, heading, limit = 25, compact = false, details = false }: { resource: string; query?: Record<string,string|number|undefined>; heading?: string; limit?: number; compact?: boolean; details?: boolean }) {
  const key=apiQuery({...query,limit});
  const result=useInfiniteQuery({queryKey:["protocol",resource,key],initialPageParam:"",queryFn:({pageParam})=>getJson<ProtocolPage>(`/api/v1/${resource}?${key}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),getNextPageParam:page=>page.next_cursor??undefined,retry:(n,e)=>!(e instanceof ApiFailure && [400,404,409].includes(e.status))&&n<2});
  const context=result.data?.pages[0]?.context;
  const items=result.data?.pages.flatMap(p=>p.items)??[];
  return <section className={compact ? "protocol-section" : "panel compact-panel protocol-section"} aria-label={heading??resource}>
    {heading && <h2>{heading}</h2>}{context && !compact && <ContextNote context={context}/>}
    {result.isPending && <p role="status">Loading observations…</p>}
    {result.isError && <div className="inline-notice" role="status"><p>{result.error instanceof ApiFailure && result.error.status===409 ? "The branch or published build changed. Restart this list to use its new consistent view." : result.error instanceof ApiFailure && result.error.status===404 ? "No matching record has been imported in this dataset." : "This view is unavailable. Previously loaded values may be stale."}</p><button onClick={()=>{void result.refetch();}}>Reload observations</button></div>}
    {!result.isPending && !result.isError && !items.length && <p className="empty-state">{context?.state==="catching_up" ? "Observed data is catching up with the selected branch." : "No matching records in the imported coverage."}</p>}
    {context && items.map(item=><ProtocolCard key={item.id} item={item} context={context} expanded={details}/>)}
    {result.hasNextPage && <div className="pagination"><button disabled={result.isFetchingNextPage} onClick={()=>{void result.fetchNextPage();}}>{result.isFetchingNextPage ? "Loading…" : "Load more observations"}</button></div>}
    {!!items.length && <p className="scope-note">{items.length} records loaded. {result.hasNextPage ? "More records are available." : "End of this result."}</p>}
  </section>;
}
function ResourcePageInner({ resource: defaultResource, title: pageTitle, description, id, children }: {resource:string;title:string;description:string;id?:string;children?:ReactNode}) {
  const params=useSearchParams(),router=useRouter(),pathname=usePathname();
  const resource=defaultResource==="explorer" ? params.get("resource")??"events" : defaultResource;
  const q:Record<string,string>={};for(const key of ["dataset","slot","kind","scope","q","from_height","to_height","from_time","to_time","time_basis"]) {const v=params.get(key);if(v)q[key]=v;}
  if(id){if(resource==="withdrawal-bundles")q.q=id;else q.key=id;q.scope??="all";}
  const update=(form:FormData)=>{const next=new URLSearchParams();if(params.get("dataset"))next.set("dataset",params.get("dataset")!);for(const [k,v] of form)if(typeof v==="string"&&v)next.set(k,v);router.push(`${pathname}?${next.toString()}`);};
  const exportQuery=apiQuery({...q,resource});
  return <main className="detail-shell"><div className="eyebrow">BIP300 / BIP301 OBSERVATORY</div><h1>{pageTitle}</h1><p className="lede">{description}</p>
    {!id && <form key={params.toString()} className="explorer-filters" action={update}>
      {defaultResource==="explorer" && <label>Resource<select name="resource" defaultValue={resource}>{["events","search","protocol-messages","activity","deposits","withdrawal-bundles","sidechain-proposals","sidechain-instances","observations","bmm/history","bmm/confirmed"].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>}
      <label>Hash, identifier or exact name<input name="q" defaultValue={q.q} placeholder="Transaction, m6id, description hash…"/></label>
      <label>Slot<input name="slot" type="number" min={0} max={255} defaultValue={q.slot}/></label>
      <label>Branch scope<select name="scope" defaultValue={q.scope??"selected"}><option value="selected">Selected branch</option><option value="all">All observed branches</option></select></label>
      <label>From height<input name="from_height" type="number" min={0} defaultValue={q.from_height}/></label><label>To height<input name="to_height" type="number" min={0} defaultValue={q.to_height}/></label>
      <label>Kind<input name="kind" defaultValue={q.kind} placeholder="Optional event kind"/></label>
      <label>Time basis<select name="time_basis" defaultValue={q.time_basis??"block"}><option value="block">Block time</option><option value="observation">Observation time</option><option value="ingestion">Ingestion time</option></select></label>
      <label>From time (UTC)<input name="from_time" defaultValue={q.from_time} placeholder="2026-09-25T00:00:00Z"/></label><label>To time (UTC)<input name="to_time" defaultValue={q.to_time} placeholder="2026-09-26T00:00:00Z"/></label>
      <button type="submit">Apply filters</button>
    </form>}
    {!resource.startsWith("runs") && !resource.startsWith("snapshot-groups") && !resource.startsWith("observation-failures") && <p className="export-links"><a className="text-link" href={`${apiBaseUrl}/api/v1/export?${exportQuery}&format=json`}>Export JSON</a><a className="text-link" href={`${apiBaseUrl}/api/v1/export?${exportQuery}&format=csv`}>Export CSV</a><span>Up to 10,000 records; the export reports truncation.</span></p>}
    {resource==="search" && !q.q ? <p>Enter a hash, height, slot or exact sidechain name to search.</p> : <ProtocolList key={`${resource}:${apiQuery(q)}`} resource={resource} query={q} limit={50} details={!!id}/>}
    {children}
  </main>;
}
export function ResourcePage(props: Parameters<typeof ResourcePageInner>[0]) { return <Suspense fallback={<main className="detail-shell"><p>Loading explorer…</p></main>}><ResourcePageInner {...props}/></Suspense>; }
