import { SnapshotView } from "@/components/provenance-view";
import { getProvenance } from "@/lib/api";
import { readRecord, requestNetwork } from "@/lib/network-server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Reading group · Drivechain Observatory" };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ network?: string | string[]; dataset?: string | string[] }> }) {
  const id = decodeURIComponent((await params).id);
  const { network: param, dataset } = await searchParams;
  const network = await requestNetwork(param);
  const query = typeof dataset === "string" ? `?dataset=${encodeURIComponent(dataset)}` : "";
  const initial = await readRecord(network, `/about/data/snapshots/${encodeURIComponent(id)}${query}`, base => getProvenance("snapshot-groups", id, base));
  return <SnapshotView id={id} initial={initial}/>;
}
