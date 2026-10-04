"use client";
import { ProtocolList } from "./protocol-browser";
import { BranchSummary } from "./branch-summary";
import { useQuery } from "@tanstack/react-query";
import { getCoverage, getMeta, getStatus } from "@/lib/api";
import type { Coverage, Meta, Status } from "@/lib/types";
export function DataProvenance({ meta, coverage, status }: { meta: Meta | null; coverage: Coverage | null; status: Status | null }) {
  const metadata = useQuery({ queryKey: ["meta"], queryFn: getMeta, initialData: meta ?? undefined });
  const ranges = useQuery({ queryKey: ["coverage"], queryFn: getCoverage, initialData: coverage ?? undefined, refetchInterval: 5_000 });
  const health = useQuery({ queryKey: ["status"], queryFn: getStatus, initialData: status ?? undefined, refetchInterval: 5_000 });
  const quality = ranges.data?.observation_quality as Record<string, unknown> | undefined;
  return <main className="detail-shell"><div className="eyebrow">ENFORCER-DERIVED OBSERVATIONS</div><h1>About the data</h1>
    <p className="lede">Observatory keeps a local copy of the monitor’s evidence. Public browsing reads this copy. Every view has a dataset, observation time and coverage limit.</p>
    {(metadata.isError || ranges.isError || health.isError) && <p className="inline-notice" role="status">Some data is unavailable. Retrying; previously loaded values may be stale.</p>}
    <section className="panel compact-panel"><h2>Identity and provenance</h2><dl className="facts">
      <dt>Network</dt><dd>{metadata.data?.dataset.network_id ?? "Unknown"}</dd><dt>Dataset</dt><dd className="hash">{metadata.data?.dataset.dataset_id ?? "Awaiting data"}</dd>
      <dt>Source contract / SQL schema</dt><dd>{metadata.data?.current_run?.event_contract_version ?? "Unknown"} / {metadata.data?.source_schema_version ?? "Unknown"}</dd>
      <dt>Monitor build</dt><dd className="hash">{metadata.data?.current_run?.monitor_commit ?? "Unknown"}</dd>
      <dt>Enforcer build</dt><dd className="hash">{metadata.data?.current_run?.enforcer_commit ?? "Unknown"}</dd><dt>Node build</dt><dd className="hash">{metadata.data?.current_run?.node_commit ?? "Unknown"}</dd>
      <dt>Activation checkpoint</dt><dd className="hash">{metadata.data?.dataset.activation_height} · {metadata.data?.dataset.activation_block_hash}</dd>
      <dt>Local coverage</dt><dd>{ranges.data?.local_status.replaceAll("_", " ") ?? "Unknown"}</dd>
    </dl></section>
    {health.data && <BranchSummary branch={health.data.branch} dataset={health.data.meta.dataset_id}/>}
    <section className="panel compact-panel"><h2>Independent worker health</h2>
      {health.data?.extractors.flatMap((extractor) => extractor.workers.map((worker) => <div className="worker" key={extractor.run_id + worker.worker}>
        <strong>{worker.worker.replaceAll("_", " ")}: {worker.state}</strong><span>Last success: {worker.last_success_at ?? "Not observed"}</span>
        <span>Consecutive failures: {worker.consecutive_failures}</span>{worker.last_error && <span className="error-text">{worker.last_error}</span>}
      </div>))}
      {!health.data?.extractors.length && <p>Worker telemetry is not yet available.</p>}
    </section>
    <section className="panel compact-panel table-scroll"><h2>Reported source coverage</h2><table><thead><tr><th>Stream</th><th>Slot</th><th>Contract</th><th>Start</th><th>Covered / target</th><th>Source status</th><th>Local verification</th></tr></thead>
      <tbody>{ranges.data?.streams.map((row) => <tr key={row.revision_id}><td>{row.stream}</td><td>{row.slot ?? "Global"}</td><td>v{row.event_contract_version}</td><td>{row.start_height ?? "Unknown"}</td><td>{row.covered_height ?? "Unknown"} / {row.target_height ?? "Unknown"}</td><td>{row.source_status}</td><td>{row.verification?.status ?? "Pending"}{row.verification?.verified_from_height != null && ` · ${row.verification.verified_from_height}–${row.verification.verified_through_height}`}{row.verification?.first_gap_height != null && ` · first gap ${row.verification.first_gap_height}`}</td></tr>)}</tbody></table>
      {!ranges.data?.streams.length && <p>No coverage ranges have been imported.</p>}
      <p>A completed source range does not certify a selected branch in Observatory. Snapshot history contains only the observations actually recorded.</p>
    </section>
    <section className="panel compact-panel"><h2>Import and projection progress</h2><dl className="facts">
      {health.data?.cursors.map((cursor) => <div className="fact-row" key={cursor.stream}><dt>{cursor.stream.replaceAll("_", " ")}</dt><dd>{cursor.imported_through} / {cursor.source_high_water ?? "Unknown"} source ID</dd></div>)}
      {health.data?.progress.map((progress) => <div className="fact-row" key={progress.name}><dt>{progress.name} projection</dt><dd>Through {progress.processed_event_id ?? "not yet available"}{progress.error_event_id && ` · blocked at event ${progress.error_event_id}`}</dd></div>)}
    </dl><p>IDs are checkpoints, not row counts. Gaps between IDs do not measure missing activity.</p></section>
    <section className="panel compact-panel"><h2>What this observatory can establish</h2><p>Data comes from the enforcer’s observations. The branch verdict is limited to the evidence and contiguous range shown above. A deposit observed on L1 does not demonstrate credit on L2, and a successful stream connection does not establish source freshness.</p></section>
    <section className="panel compact-panel"><h2>Observation quality</h2><dl className="facts">
      <dt>Snapshot groups in the last 24 hours</dt><dd>{String(quality?.snapshot_groups ?? "Unknown")}</dd>
      <dt>Groups read while state changed</dt><dd>{String(quality?.changed_groups ?? "Unknown")}</dd>
      <dt>Recorded failures in the last 24 hours</dt><dd>{String(quality?.failures ?? "Unknown")}</dd>
      <dt>Blocks with conflicting evidence</dt><dd>{String(quality?.conflicted_blocks ?? "Unknown")}</dd>
    </dl><p>Only stable capture groups can establish state at a block. Historical backfill repairs coverage; it cannot recreate live transitions missed during an interruption.</p></section>
    <ProtocolList resource="observation-failures" heading="Recorded observation interruptions"/>
    <ProtocolList resource="chain-info" heading="Observed protocol parameters"/>
    <ProtocolList resource="runs" heading="Source runs"/>
    <ProtocolList resource="snapshot-groups" heading="Snapshot capture groups"/>
  </main>;
}
