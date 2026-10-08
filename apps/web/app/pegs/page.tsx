import { ResourcePage } from "@/components/protocol-browser";
import { ProtocolList } from "@/components/protocol-browser";
export default function Page() {
  return <ResourcePage resource="withdrawal-bundles" title="Pegs and withdrawals" description="Inspect official pending-bundle responses, observed votes and deposits. State between reads and unreported outcomes remain unknown."><ProtocolList resource="deposits" heading="Observed deposits" limit={10}/></ResourcePage>;
}
