import { EntityHistory } from "@/components/entity-history";
import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params;
  return <ResourcePage resource="bundle-attempts" title="Withdrawal attempt" description="Follow one submission through votes, expiry or an observed outcome. A repeated m6id can have more than one attempt." id={id}><EntityHistory resource="bundle-attempts" id={id}/></ResourcePage>;
}
