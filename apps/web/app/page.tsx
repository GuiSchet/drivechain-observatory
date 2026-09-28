import { ObservatoryDashboard } from "@/components/observatory-dashboard";
import { getOverview } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Home() {
  return <ObservatoryDashboard initialOverview={await getOverview().catch(() => null)}/>;
}
