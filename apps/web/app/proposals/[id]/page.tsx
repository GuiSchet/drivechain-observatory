import { EntityHistory } from "@/components/entity-history";
import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params;
  return <ResourcePage resource="sidechain-proposals" title="Proposal detail" description="This attempt is identified by its slot, description hash and proposal block." id={id}><EntityHistory resource="sidechain-proposals" id={id}/></ResourcePage>;
}
