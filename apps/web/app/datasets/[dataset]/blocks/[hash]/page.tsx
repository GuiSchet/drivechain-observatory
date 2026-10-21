import { notFound } from "next/navigation";
import { BlockDetail } from "@/components/block-detail";
import { getBlock } from "@/lib/api";
import { readRecord, requestNetwork } from "@/lib/network-server";
export const dynamic = "force-dynamic";
export default async function Page({params,searchParams}:{params:Promise<{dataset:string;hash:string}>;searchParams:Promise<{network?:string|string[]}>}) {
  const {dataset,hash}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(dataset)||!/^[0-9a-f]{64}$/i.test(hash))notFound();
  const network=await requestNetwork((await searchParams).network);
  const initial=await readRecord(network,`/datasets/${dataset}/blocks/${hash.toLowerCase()}`,base=>getBlock(dataset,hash,base));
  return <BlockDetail dataset={dataset} hash={hash.toLowerCase()} initial={initial}/>;
}
