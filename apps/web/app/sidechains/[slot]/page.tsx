import { notFound } from "next/navigation";
import { SidechainStory } from "@/components/sidechains";
export default async function Page({ params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!/^\d+$/.test(slot) || Number(slot) > 255) notFound();
  return <SidechainStory slot={Number(slot)}/>;
}
