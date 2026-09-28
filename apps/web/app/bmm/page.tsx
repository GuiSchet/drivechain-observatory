import { BmmAuctions } from "@/components/bmm-auctions";
import { getAuctions } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Page() {
  return <BmmAuctions initial={await getAuctions().catch(() => null)} />;
}
