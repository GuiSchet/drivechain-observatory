import { RunView } from "@/components/provenance-view";
export const metadata = { title: "Monitor session · Drivechain Observatory" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <RunView id={decodeURIComponent((await params).id)}/>;
}
