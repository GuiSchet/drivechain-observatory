import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params;
  return <ResourcePage resource="runs" title="Monitor run" description="Pinned builds, configuration, contract and capabilities for this source execution." id={id}/>;
}
