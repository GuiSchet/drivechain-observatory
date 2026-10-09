/** A readable name for the network the API reports, e.g. "eCash Betanet". */
export function networkLabel(id: string | null | undefined): string {
  if (process.env.NEXT_PUBLIC_NETWORK_LABEL) return process.env.NEXT_PUBLIC_NETWORK_LABEL;
  if (id === "betanet") return "eCash Betanet";
  return id ?? "Unknown network";
}
