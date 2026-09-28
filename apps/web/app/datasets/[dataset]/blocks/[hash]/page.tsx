import { notFound } from "next/navigation";
import { BlockDetail } from "@/components/block-detail";
import { getBlock } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Page({params}:{params:Promise<{dataset:string;hash:string}>}) {
  const {dataset,hash}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(dataset)||!/^[0-9a-f]{64}$/i.test(hash))notFound();
  return <BlockDetail dataset={dataset} hash={hash.toLowerCase()} initial={await getBlock(dataset,hash).catch(()=>null)}/>;
}
