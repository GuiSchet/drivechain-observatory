import { BlockExplorer } from "@/components/block-explorer";
import { getBlocks } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <BlockExplorer initial={await getBlocks().catch(()=>null)}/>;
}
