"use client";
import { useNetworkFacts } from "@/components/providers";

/** The name of the network the reader is looking at, for copy rendered on the server. */
export function NetworkName({ full = false }: { full?: boolean }) {
  const facts = useNetworkFacts();
  return <>{full ? facts.fullName : facts.name}</>;
}
