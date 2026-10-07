"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { getJson } from "@/lib/api";
import type { ProtocolPage } from "@/lib/types";
import { apiQuery, at, exact, object } from "@/lib/protocol";
import { useUnit } from "@/lib/unit";

type Point = { time: string; value: string | null; evidence?: string; quality: string; absent?: boolean };
export function HistoryChart({ slot, entity, kind = "ctip", dataset, instanceId }: {slot?:number;entity?:string;kind?:"ctip"|"bundle"|"proposal";dataset?:string;instanceId?:string}) {
  // Separate observation points never interpolate protocol state between reads.
  // The server filters by kind and entity, so other activity cannot push this
  // series out of the page; it returns newest first.
  const query=apiQuery({slot,dataset,instance_id:instanceId,kind,key:entity,scope:entity?"all":undefined,limit:200});
  const data=useQuery({queryKey:["protocol","activity","chart",query],queryFn:()=>getJson<ProtocolPage>(`/api/v1/activity?${query}`)});
  const host=useRef<HTMLDivElement>(null),reduced=useReducedMotion(),unit=useUnit();
  const points:Point[]=[];
  const records=[...(data.data?.items??[])].reverse();
  for(const item of records) {
    if(!item.observed_at)continue;
    const value=kind==="ctip" ? at(item.data,"ctip","value_sats") : at(item.data,kind,"vote_count");
    const usable=item.quality==="tip_matched" || item.quality==="observed";
    points.push({time:item.observed_at,value:usable && (typeof value==="string"||typeof value==="number") ? String(value) : null,evidence:item.evidence[0]?.event_id,quality:item.quality,absent:usable && kind==="ctip" && object(item.data).ctip===null});
  }
  const signature=JSON.stringify(points);
  useEffect(()=>{
    let disposed=false;let chart:import("echarts").ECharts|undefined;let resize:ResizeObserver|undefined;
    void import("echarts").then(echarts=>{
      if(disposed || !host.current)return;
      chart=echarts.init(host.current,undefined,{renderer:"svg"});
      const rows:Point[]=JSON.parse(signature);
      chart.setOption({animation:!reduced,aria:{enabled:true},backgroundColor:"transparent",textStyle:{color:"#b4b0ab"},grid:{left:70,right:24,top:25,bottom:55},
        tooltip:{trigger:"axis",renderMode:"richText",formatter:(args:unknown)=>{const first=Array.isArray(args)?args[0]:args;const i=Number(object(first).dataIndex);const p=rows[i];return p?`Read ${p.time}\n${p.absent?"No CTIP":p.value===null?"Unknown":`${BigInt(p.value).toLocaleString("en-US")}${kind==="ctip"?` ${unit}`:" votes"}`} · ${p.quality}`:"";}},
        xAxis:{type:"category",data:rows.map(p=>p.time),name:"Observation time",nameLocation:"middle",nameGap:34,axisLabel:{color:"#b4b0ab",formatter:(value:string,index:number)=>rows[index]?.absent?`${value}\nNo CTIP`:value}},
        yAxis:{type:"value",name:kind==="ctip"?"Satoshis":"Votes",splitLine:{lineStyle:{color:"#303030"}},axisLabel:{color:"#b4b0ab"}},
        series:[{type:"scatter",data:rows.map(p=>p.value===null?null:Number(p.value)),showSymbol:true,symbolSize:6,lineStyle:{color:"#f7931a"},itemStyle:{color:"#f7931a"},markLine:{silent:false,symbol:"none",lineStyle:{type:"dotted",color:"#b4b0ab"},data:rows.flatMap((p,i)=>p.absent?[{xAxis:i,label:{formatter:"No CTIP"},tooltip:{trigger:"item",formatter:`Read ${p.time}\nNo CTIP · ${p.quality}`}}]:[])}}]});
      resize=new ResizeObserver(()=>chart?.resize());resize.observe(host.current);
    });
    return()=>{disposed=true;resize?.disconnect();chart?.dispose();};
  },[signature,reduced,kind,unit]);
  return <section className="panel compact-panel"><h2>{kind==="ctip"?"Treasury balance history":"Vote history"}</h2>
    <p>Separate observed responses, plotted by read time. Values between reads are unknown. “No CTIP” marks an observed absence with no monetary value. Geometry uses rounded numbers; tooltips and the table preserve exact integers.</p>
    {data.isError && <p className="inline-notice">History unavailable; any chart below is the last loaded view.</p>}
    {!points.length && <p>{data.isPending?"Loading history…":"No observed values in this page of activity."}</p>}
    <div ref={host} className="history-chart" role="img" aria-label={`${kind} observation chart; exact values in the following table`}/>
    <details><summary>Exact chart values ({points.length})</summary><div className="table-scroll"><table><thead><tr><th>Observation time</th><th>{kind==="ctip"?`Balance (${unit})`:"Votes"}</th><th>Interpretation</th><th>Evidence</th></tr></thead><tbody>{points.map((p,i)=><tr key={i}><td>{p.time}</td><td>{p.absent?"No CTIP":p.value===null?"Unknown":exact(p.value)}</td><td>{p.quality}</td><td>{p.evidence??"Coverage gap"}</td></tr>)}</tbody></table></div></details>
    <p className="scope-note">Chart covers up to 200 recent records of this series. {data.data?.next_cursor ? "Earlier records are available in the paginated history below." : "No earlier activity in this result."}</p>
  </section>;
}
