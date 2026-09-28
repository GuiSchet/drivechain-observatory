import { notFound } from "next/navigation";
import { EvidenceView } from "@/components/evidence-view";
import { getEvidence } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ dataset: string; id: string }> }) {
  const { dataset, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(dataset) || !/^\d+$/.test(id)) notFound();
  return <EvidenceView dataset={dataset} id={id} initial={await getEvidence(dataset, id).catch(() => null)}/>;
}
