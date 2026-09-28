import { ResourcePage } from "@/components/protocol-browser";
import { ProtocolList } from "@/components/protocol-browser";
export default function Page() {
  return <ResourcePage resource="withdrawal-bundles" title="Pegs and withdrawals" description="Track withdrawal attempts, decreasing votes, payout and fees separately. Each attempt keeps its own identity and evidence."><ProtocolList resource="deposits" heading="Observed deposits" limit={10}/></ResourcePage>;
}
