"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { getBlocks, getJson } from "@/lib/api";
import type { BmmMetrics, Observatory, ProtocolPage } from "@/lib/types";
import { apiQuery, at, label, object, short, text, title } from "@/lib/protocol";
import { ContextNote } from "./protocol-browser";
import { useLiveActivity } from "./providers";

export function BmmHistory({slot,dataset}:{slot?:number;dataset?:string}) {
  const [window,setWindow]=useState(144),[start,setStart]=useState(0),[selected,setSelected]=useState<{slot:number;height:number;state:string;hash:string|null;commitment?:string|null;event?:string}>();
  const query=apiQuery({slot,dataset,window_blocks:window,start_slot:start});
  const result=useQuery({queryKey:["protocol","bmm","metrics",query],queryFn:()=>getJson<BmmMetrics>(`/api/v1/bmm?${query}`)});
  const percent=(v:number|null|undefined)=>v==null?"Unknown":`${(v*100).toFixed(1)}%`;
  return <section className="panel compact-panel"><div className="panel-heading"><div><span className="section-kicker">BIP301 · COVERED BLOCKS</span><h2>BMM commitment history</h2></div><label className="window-control">Window <select value={window} onChange={e=>{setWindow(Number(e.target.value));setSelected(undefined);}}>{[24,144,1008].map(n=><option key={n} value={n}>{n} blocks</option>)}</select></label></div>
    <p>Rate = commitments / covered eligible blocks. Coverage = covered / eligible blocks. Unknown eligibility and missing observations are separate from an observed absence.</p>
    {result.data && <ContextNote context={result.data.context}/>}{result.isError && <p className="inline-notice">Heatmap unavailable; retained cells may be stale.</p>}
    <div className="heatmap-legend">{["present","observed_absent","uncovered","inactive","unknown_eligibility"].map(s=><span key={s}><i className={`heat-cell ${s}`}/>{label(s)}</span>)}</div>
    <div className="table-scroll"><table className="heatmap-table"><thead><tr><th>Slot</th><th>Rate / coverage</th><th>Oldest → latest · select a block for evidence</th></tr></thead><tbody>{result.data?.slots.map(row=><tr key={row.slot}><th><Link className="text-link" href={`/sidechains/${row.slot}`}>#{row.slot}</Link><small>Streak {row.consecutive_present}</small></th><td>{percent(row.rate)} / {percent(row.coverage)}<small>{row.present} present / {row.covered} covered / {row.eligible??"?"} eligible</small></td><td><div className="heat-row" style={{gridTemplateColumns:`repeat(${Math.min(144,row.cells.length)||1}, minmax(7px,1fr))`}}>{[...row.cells].reverse().map(cell=><button key={cell.height} className={`heat-cell ${cell.state}`} aria-label={`Slot ${row.slot}, block ${cell.height}: ${label(cell.state)}`} title={`#${cell.height} · ${label(cell.state)}`} onClick={()=>setSelected({slot:row.slot,...cell,hash:cell.hash??null,event:cell.evidence[0]?.event_id})}/>)}</div></td></tr>)}</tbody></table></div>
    {!result.isPending&&!result.data?.slots.length && <p>No slot observations in this window.</p>}
    {selected && <div className="selected-cell" role="status"><strong>Slot #{selected.slot} · block {selected.height} · {label(selected.state)}</strong><p className="hash">Commitment: {selected.commitment??"Not established"}</p>{selected.hash && <Link className="text-link" href={`/datasets/${result.data?.context.meta.dataset_id}/blocks/${selected.hash}`}>Block evidence</Link>}{selected.event && <> · <Link className="text-link" href={`/datasets/${result.data?.context.meta.dataset_id}/events/${selected.event}`}>Commitment observation</Link></>}</div>}
    {slot==null && <div className="pagination"><button disabled={start===0} onClick={()=>{setStart(0);setSelected(undefined);}}>First slots</button><button disabled={result.data?.next_slot==null} onClick={()=>{setStart(result.data?.next_slot??0);setSelected(undefined);}}>Next slots</button></div>}
  </section>;
}
export function LiveVisuals() {
  const [slot,setSlot]=useState(""),[paused,setPaused]=useState(false);
  const reduced=useReducedMotion(),live=useLiveActivity();
  const blocks=useQuery({queryKey:["blocks","river"],queryFn:()=>getBlocks("limit=24")});
  const state=useQuery({queryKey:["protocol","observatory","map"],queryFn:()=>getJson<Observatory>("/api/v1/observatory")});
  const story=useQuery({queryKey:["protocol","activity","story",slot],queryFn:()=>getJson<ProtocolPage>(`/api/v1/activity?${apiQuery({slot,limit:12})}`)});
  const active=Object.entries(object(object(state.data?.state).active));
  const visible=active.filter(([s])=>!slot||s===slot).slice(0,8);
  const pulse=!paused&&!reduced&&live?.animation_eligible===true;
  return <div className="live-visuals"><section className="panel compact-panel"><div className="panel-heading"><div><span className="section-kicker">ONE BLOCK · ALL SLOTS</span><h2>Block river</h2></div><Link className="text-link" href="/blocks">Explore blocks →</Link></div>
    <p>The latest selected L1 blocks, once per block. Historical imports appear without a live pulse.</p>
    <div className="block-river" aria-label="Recent selected blocks">{blocks.data?.blocks.map(b=><Link key={b.hash} href={`/datasets/${blocks.data!.meta.dataset_id}/blocks/${b.hash}`} className={`river-block ${pulse&&live.hash===b.hash?"fresh-block":""}`}><span>L1</span><strong>{b.height.toLocaleString("en-US")}</strong><small>{short(b.hash)}</small><small>{b.membership}</small></Link>)}</div>
    {blocks.isError && <p className="inline-notice">Block history unavailable.</p>}{!blocks.isPending&&!blocks.data?.blocks.length && <p>No selected block headers imported yet.</p>}
  </section>
    <div className="visual-grid"><section className="panel compact-panel"><div className="panel-heading"><div><span className="section-kicker">OBSERVED L1 RELATIONSHIPS</span><h2>Drivechain map</h2></div><button aria-pressed={paused} onClick={()=>setPaused(v=>!v)}>{paused?"Enable live motion":"Pause motion"}</button></div>
      <label className="window-control">Slot <select value={slot} onChange={e=>setSlot(e.target.value)}><option value="">All active slots</option>{active.map(([s])=><option key={s} value={s}>#{s}</option>)}</select></label>
      <svg className="drivechain-map" viewBox="0 0 500 310" role="img" aria-label={`L1 connected to ${visible.length} observed sidechain instances`}>
        {visible.map(([s],i)=>{const x=65+(i%4)*123,y=i<4?55:260;return <path key={`line-${s}`} d={`M250 155 Q${x} 155 ${x} ${y}`} fill="none" stroke="#655035" strokeWidth="2"/>;})}
        {pulse&&visible.map(([s],i)=>{const event=live.events.find(e=>e.slot===Number(s)&&(e.kind==="deposit"||e.kind==="bmm_commitment"||(e.kind==="bundle"&&e.status==="succeeded")));if(!event)return null;const x=65+(i%4)*123,y=i<4?55:260;return <path key={`${live.id}:${s}`} className={`map-flow ${event.kind==="bundle"?"withdrawal":"deposit"}`} d={`M250 155 Q${x} 155 ${x} ${y}`} fill="none" stroke={event.kind==="bmm_commitment"?"#80e5a0":"#ffc77d"} strokeWidth="3" strokeDasharray="8 18"><title>{label(event.kind)} observed for slot {s}</title></path>;})}
        <g key={pulse?live.id:"idle"} className={pulse?"map-live-pulse":""}><circle cx="250" cy="155" r="37" fill="#291c0e" stroke="#f7931a" strokeWidth="2"/><text x="250" y="161" fill="#f7931a" textAnchor="middle">L1</text></g>
        {visible.map(([s,a],i)=>{const x=65+(i%4)*123,y=i<4?55:260;return <a href={`/sidechains/${s}`} key={s} aria-label={`Open sidechain slot ${s}`}><circle cx={x} cy={y} r="27" fill="#181818" stroke="#b09a75"/><text x={x} y={y+5} textAnchor="middle" fill="#f5f2ed">#{s}</text><title>{text(at(a,"declaration","declaration","V0","title"),`Slot ${s}`)}</title></a>;})}
      </svg>
      <p>{visible.length ? "Lines show observed active instances. Live pulses indicate a new L1 extension. Orange flows show observed deposits or paid withdrawals; green flows show BMM commitments. They do not establish L2 execution." : "No active instance can currently be drawn from the imported evidence."} {!slot&&active.length>8&&`${active.length-8} additional slots; choose a slot to inspect it.`}</p>
      <ul className="map-instances">{visible.map(([s,a])=><li key={s}><Link className="text-link" href={`/sidechains/${s}`}>#{s} · {text(at(a,"declaration","declaration","V0","title"),"Unnamed sidechain")}</Link></li>)}</ul>
    </section><section className="panel compact-panel"><div className="panel-heading"><div><span className="section-kicker">EVIDENCE IN ORDER</span><h2>Activity story</h2></div><Link className="text-link" href={`/explorer?resource=activity${slot?`&slot=${slot}`:""}`}>Full history →</Link></div>
      <ol className="activity-story">{story.data?.items.map(item=><li key={item.id}><span className="story-dot"/><Link className="text-link" href={item.evidence[0]?`/datasets/${story.data!.context.meta.dataset_id}/events/${item.evidence[0].event_id}`:`/datasets/${story.data!.context.meta.dataset_id}/blocks/${item.hash}`}>{title(item)}</Link><small>Block {item.height} · {item.quality}{item.slot!=null&&` · slot #${item.slot}`}</small>{object(item.data).status!=null&&<span>{label(text(object(item.data).status))}</span>}</li>)}</ol>
      {!story.data?.items.length && <p>{story.isPending?"Loading activity…":"No activity in the imported coverage."}</p>}
    </section></div>
  </div>;
}
