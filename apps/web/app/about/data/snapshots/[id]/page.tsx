import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const id=decodeURIComponent((await params).id);
  return <ResourcePage resource="snapshot-groups" title="Snapshot group" description="The source capture boundary, before and after tips, consistency and attempts." id={id}/>;
}
