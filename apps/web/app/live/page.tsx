import { LiveActivity } from "@/components/live-activity";
export const metadata = { title: "Live activity · Drivechain Observatory", description: "Everything happening on eCash Betanet's drivechains, in plain words." };
export default async function Page({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  return <LiveActivity kind={kind}/>;
}
