import { EntityHistory } from "@/components/entity-history";
import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params;
  return <ResourcePage resource="bundle-attempts" title="Withdrawal attempt" description="Inspect official responses for this submission and their evidence. Expiry and outcomes are not inferred between observations." id={id}><EntityHistory resource="bundle-attempts" id={id}/></ResourcePage>;
}
