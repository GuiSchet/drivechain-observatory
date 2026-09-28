import { DataProvenance } from "@/components/data-provenance";
import { getMeta, getCoverage, getStatus } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Page() {
  const [meta, coverage, status] = await Promise.all([getMeta().catch(() => null), getCoverage().catch(() => null), getStatus().catch(() => null)]);
  return <DataProvenance meta={meta} coverage={coverage} status={status}/>;
}
