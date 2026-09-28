import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params;
  return <ResourcePage resource="snapshot-groups" title="Snapshot group" description="The source capture boundary, before and after tips, consistency and attempts." id={id}/>;
}
