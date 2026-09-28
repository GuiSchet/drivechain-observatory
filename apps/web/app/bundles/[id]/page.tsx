import { ResourcePage } from "@/components/protocol-browser";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params;
  return <ResourcePage resource="withdrawal-bundles" title="Withdrawal bundle" description="Observed attempts for this withdrawal bundle." id={id}/>;
}
