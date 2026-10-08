import { EntityHistory } from "@/components/entity-history";
import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const id=decodeURIComponent((await params).id);
  return <ResourcePage resource="sidechain-instances" title="Sidechain instance" description="A sidechain instance combines its slot, proposal, activation height and description hash." id={id}><EntityHistory resource="sidechain-instances" id={id}/></ResourcePage>;
}
