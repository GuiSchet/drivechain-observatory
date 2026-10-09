import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// What each recorded event kind is, and which lesson explains it.
const kinds: Record<string, [string, string]> = {
  block_connected: ["The enforcer's report of one L1 block for one sidechain slot: its deposits, withdrawal events and merged-mining commitment.", "deposits"],
  block_disconnected: ["The enforcer's report that a block was removed from the chain by a reorganization.", "blocks"],
  mainchain_transition: ["A change of the chain tip, as the enforcer's live event stream reported it.", "blocks"],
  mainchain_block: ["A block header read from the Betanet node.", "blocks"],
  chain_tip: ["A reading of the chain tip.", "blocks"],
  chain_info: ["The network parameters the enforcer reported, including the BIP300 thresholds.", "creating-a-sidechain"],
  active_sidechains: ["A reading of which sidechains are active.", "slots"],
  sidechain_proposals: ["A reading of the sidechain proposals being voted on.", "creating-a-sidechain"],
  ctip: ["A reading of one sidechain's treasury output.", "deposits"],
  withdrawal_bundle_proposals: ["A reading of one sidechain's withdrawal bundles and their votes.", "withdrawals"],
  bmm_requests: ["A sample of the open merged-mining bids.", "merged-mining"],
  confirmed_bmm_fees: ["Fees of merged-mining bids that were confirmed in a block.", "merged-mining"],
};

export function ProofIntro({ kind, what }: { kind?: string; what: "event" | "block" }) {
  const [text, lesson] = what === "block" ? ["One L1 block, with every fact the monitor recorded about it.", "blocks"] : kinds[kind ?? ""] ?? ["A record captured by the monitor.", "how-we-know"];
  return <aside className="proof-intro">
    <ShieldCheck size={20} aria-hidden="true"/>
    <div><strong>You are looking at a proof.</strong> {text} It is shown exactly as recorded, so anyone can check the values used on the rest of the site. <Link className="text-link" href={`/learn/${lesson}`}>Learn what it means</Link> · <Link className="text-link" href="/learn/how-we-know">How we know</Link></div>
  </aside>;
}
