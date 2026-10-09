import { SnapshotView } from "@/components/provenance-view";
export const metadata = { title: "Reading group · Drivechain Observatory" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <SnapshotView id={decodeURIComponent((await params).id)}/>;
}
