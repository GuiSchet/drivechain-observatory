import Link from "next/link";
import type { Branch } from "@/lib/types";
const basis: Record<string,string> = {
  awaiting_reconstruction: "Waiting for a coherent local reconstruction.",
  observed_tip: "Selected from an explicit monitor tip observation.",
  observed_tip_contiguous_range: "An explicit observed tip is connected throughout the verified range.",
  missing_parent: "An earlier parent is missing. The available segment is retained.",
  tip_header_missing: "The tip was observed, but its header has not arrived yet.",
  live_extension: "A live observation extends the selected branch; awaiting a tip confirmation.",
  conflicting_live_observation: "A live connection or disconnection conflicts with the selection. Awaiting further evidence.",
  inconsistent_headers: "Header, height, work or checkpoint evidence conflicts.",
  header_interpretation_error: "Some chain evidence could not be interpreted; completeness is not established.",
};
export function BranchSummary({ branch, dataset }: { branch: Branch; dataset: string }) {
  return <section className="panel compact-panel branch-panel" aria-label="Observed branch">
    <h2>Observed branch · {branch.status}</h2><p>{basis[branch.basis] ?? branch.basis.replaceAll("_", " ")}</p>
    <dl className="facts"><dt>Selected tip</dt><dd>{branch.tip_hash ? <Link className="text-link hash" href={`/datasets/${dataset}/blocks/${branch.tip_hash}`}>{branch.tip_height} · {branch.tip_hash}</Link> : "No selection yet"}</dd>
      <dt>Node tip</dt><dd className="hash">{branch.node_tip_hash ?? "Unknown"}</dd><dt>Source agreement</dt><dd>{branch.joint_source_status || "Unknown"}</dd><dt>Verified lower boundary</dt><dd>{branch.verified_from_height ?? "Not established"}</dd>
      <dt>Activation checkpoint</dt><dd>{branch.checkpoint_status}</dd>
      <dt>Selection evidence</dt><dd>{branch.evidence_type?.replaceAll("_", " ") ?? "None"}{branch.evidence_id && ` #${branch.evidence_id}`} · revision {branch.revision}</dd>
      {branch.missing_parent && <><dt>Missing parent</dt><dd className="hash">{branch.missing_parent}</dd></>}
    </dl><p className="scope-note">Resolved means coherent within the stated observations and range. It does not establish independent consensus finality.</p>
  </section>;
}
