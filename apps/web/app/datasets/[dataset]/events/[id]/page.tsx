import { notFound } from "next/navigation";
import { EvidenceView } from "@/components/evidence-view";
import { getEvidence } from "@/lib/api";
import { readRecord, requestNetwork } from "@/lib/network-server";
export const dynamic = "force-dynamic";
export default async function Page({ params, searchParams }: { params: Promise<{ dataset: string; id: string }>; searchParams: Promise<{ network?: string | string[] }> }) {
  const { dataset, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(dataset) || !/^\d+$/.test(id)) notFound();
  const network = await requestNetwork((await searchParams).network);
  const initial = await readRecord(network, `/datasets/${dataset}/events/${id}`, base => getEvidence(dataset, id, base));
  return <EvidenceView dataset={dataset} id={id} initial={initial}/>;
}
