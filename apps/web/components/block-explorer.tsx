"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiFailure, getBlocks } from "@/lib/api";
import type { Blocks } from "@/lib/types";
import { BranchSummary } from "./branch-summary";
export function BlockExplorer({ initial }: { initial: Blocks | null }) {
  const router=useRouter();
  const [scope,setScope]=useState("selected");
  const [search,setSearch]=useState("");
  const [height,setHeight]=useState("");
  const [slot,setSlot]=useState("");
  const [pages,setPages]=useState<string[]>([]);
  const [notice,setNotice]=useState("");
  const cursor=pages.at(-1);
  const params=new URLSearchParams({scope});
  if(height)params.set("height",height);
  if(slot)params.set("slot",slot);
  if(cursor)params.set("cursor",cursor);
  const query=useQuery({queryKey:["blocks","list",scope,height,slot,cursor],queryFn:()=>getBlocks(params.toString()),initialData:scope==="selected"&&!height&&!slot&&!cursor ? initial??undefined:undefined,retry:(attempt,error)=>!(error instanceof ApiFailure && error.status===409)&&attempt<2});
  useEffect(()=>{if(query.error instanceof ApiFailure && query.error.status===409){setPages([]);setNotice("The observed branch changed. The list has restarted.");}},[query.error]);
  function submit(event:FormEvent){event.preventDefault();const value=search.trim();setPages([]);
    if(/^[0-9a-f]{64}$/i.test(value)&&query.data){router.push(`/datasets/${query.data.meta.dataset_id}/blocks/${value.toLowerCase()}`);return;}
    if(value==="" || (/^\d+$/.test(value)&&Number(value)<=2147483647)){setHeight(value);setNotice("");return;}
    setNotice("Enter a block height or a 64-character hexadecimal block hash.");
  }
  return <main className="detail-shell"><div className="eyebrow">OBSERVED L1 HISTORY</div><h1>Block explorer</h1>
    <p className="lede">Inspect the selected observed branch or every imported block. Alternative blocks and disconnections remain available as evidence.</p>
    <form className="explorer-filters" onSubmit={submit}><label>Height or block hash<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Height or full hash"/></label><button type="submit">Find block</button>
      <label>Observations<select aria-label="Observations" value={scope} onChange={e=>{setScope(e.target.value);setPages([]);}}><option value="selected">Selected observed branch</option><option value="all">All observations</option></select></label>
      <label>Slot<input type="number" min="0" max="255" value={slot} placeholder="All" onChange={e=>{setSlot(e.target.value);setPages([]);}}/></label>
    </form>
    {notice&&<p className="inline-notice" role="status">{notice}</p>}
    {query.isError&&<p className="inline-notice" role="status">{query.error instanceof ApiFailure&&query.error.status===400?"Check the selected filters.":"API unavailable. Retrying the block list."}</p>}
    {query.data&&<><BranchSummary branch={query.data.branch} dataset={query.data.meta.dataset_id}/>
      <section className="panel compact-panel table-scroll"><table><thead><tr><th>Height</th><th>Hash</th><th>Membership</th><th>Block time</th></tr></thead><tbody>{query.data.blocks.map(block=><tr key={block.hash}><td>{block.height}</td><td className="hash"><Link className="text-link" href={`/datasets/${query.data!.meta.dataset_id}/blocks/${block.hash}`}>{block.hash}</Link></td><td>{block.conflicted?"Conflicting evidence":block.membership}</td><td>{block.block_time}</td></tr>)}</tbody></table>
      {!query.data.blocks.length&&<p>{query.data.branch.tip_hash?"No blocks match these filters in the available observations.":"No branch has been selected yet. All observations may contain headers awaiting reconstruction."}</p>}</section>
      <div className="pagination"><button disabled={!pages.length} onClick={()=>setPages(p=>p.slice(0,-1))}>Previous</button><span>Page {pages.length+1}</span><button disabled={!query.data.next_cursor||query.isFetching} onClick={()=>setPages(p=>[...p,query.data!.next_cursor!])}>Next</button></div></>}
    {!query.data&&!query.isError&&<p role="status">Loading blocks…</p>}
  </main>;
}
