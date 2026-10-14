"use client";
import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl, getCoverage, getMeta } from "@/lib/api";
import { object } from "@/lib/protocol";
import { short, timeAgo } from "@/lib/explain";
import { activeSidechains, n, useObservatory, useProtocolPage, useStatus } from "@/lib/live";
import { references, ENFORCER_COMMIT } from "@/content/references";
import { GoDeeper, LivePanel, Stat } from "@/components/learn/primitives";
import { useNow } from "./basics";

const workerText: Record<string, string> = {
  bmm_requests: "Reads the open merged-mining bids",
  enforcer_state: "Reads sidechains, proposals, treasuries and withdrawals",
  mainchain_events: "Follows blocks as the enforcer connects them",
  mainchain_tip: "Reads the current chain tip",
  node_history: "Reads block headers from the node",
};
const stateText: Record<string, string> = {
  healthy: "working", stale: "no success in the last few seconds", retrying: "retrying after a failure", degraded: "reporting an error",
};

export function TrustStatus() {
  const status = useStatus(), now = useNow();
  const s = status.data;
  const workers = s?.extractors.flatMap(e => e.workers.map(w => ({ ...w, source: e.source }))) ?? [];
  return <LivePanel title="Is the monitor keeping up?" status={{ pending: status.isPending, error: status.isError && !s }}>
    <div className="stat-grid">
      <Stat label="Sync" value={s ? s.sync_mode.replaceAll("_", " ") : "Unknown"} hint={s?.sync_stale ? "behind: data may be stale" : "up to date with the monitor"}/>
      <Stat label="Monitor reachable" value={s ? (s.source_reachable ? "Yes" : "No") : "Unknown"} hint={s?.last_source_contact_at ? `last contact ${timeAgo(s.last_source_contact_at, now)}` : undefined}/>
      <Stat label="Chain branch" value={s?.branch.status ?? "Unknown"} hint={s?.branch.joint_source_status === "matched" ? "node and enforcer agree on the tip" : s ? `node and enforcer: ${s.branch.joint_source_status || "unknown"}` : undefined}/>
      <Stat label="Verified since block" value={n(s?.branch.verified_from_height)} hint="from here to the tip, every block links to its parent"/>
    </div>
    {!!workers.length && <ul className="worker-list">{workers.map(w => <li key={w.source + w.worker} className={`worker-${w.state}`}>
      <span className="status-dot"/><span><strong>{workerText[w.worker] ?? w.worker.replaceAll("_", " ")}</strong><small>{w.source} · {stateText[w.state] ?? w.state}{w.last_success_at ? ` · last success ${timeAgo(w.last_success_at, now)}` : ""}</small></span>
    </li>)}</ul>}
    <p className="live-note">Readers that run only when something changes, such as a new block, show "no success in the last few seconds" between blocks; that is normal.</p>
  </LivePanel>;
}

export function QualitySummary() {
  const coverage = useQuery({ queryKey: ["coverage"], queryFn: getCoverage, refetchInterval: 30_000 });
  const errors = useProtocolPage("protocol-messages", "limit=50");
  const q = object(coverage.data?.observation_quality), c = object(q.consistency);
  const matched = Number(c.tip_matched ?? 0), unknown = Number(c.unknown ?? 0), total = matched + unknown;
  // Each (re)subscription leaves a boundary; only one that spans heights hides chain changes.
  const gaps = (coverage.data?.transition_gaps ?? []) as { gap_start_height?: number | null; gap_end_height?: number | null }[];
  const skipped = gaps.filter(g => typeof g.gap_start_height === "number" && typeof g.gap_end_height === "number" && g.gap_end_height > g.gap_start_height);
  const errorCount = errors.data?.items.length ?? 0;
  return <LivePanel title="How good is the data?" status={{ pending: coverage.isPending, error: coverage.isError && !coverage.data }}>
    <div className="stat-grid">
      <Stat label={`Readings in the last ${String(q.window_hours ?? 24)} hours`} value={n(total)} hint={total ? `${n(matched)} at a stable tip, ${n(unknown)} unknown (${((unknown / total) * 100).toFixed(1)}%)` : undefined}/>
      <Stat label="Facts that could not be interpreted" value={errors.isPending ? "…" : errorCount >= 50 ? "50+" : String(errorCount)} hint="each one stops interpretation instead of being skipped"/>
      <Stat label="Conflicting records" value={String(q.import_conflicts ?? "Unknown")} hint="a changed record stops the import"/>
      <Stat label="Blocks missed by the live event stream" value={n(skipped.reduce((sum, g) => sum + g.gap_end_height! - g.gap_start_height!, 0))}
        hint={`the live stream restarted ${n(gaps.length)} times; ${skipped.length ? `${n(skipped.length)} restarts skipped blocks, whose chain changes are unknown` : "no restart skipped a block"}. Per-block facts such as deposits are still filled in by a catch-up read.`}/>
    </div>
  </LivePanel>;
}

export function Builds() {
  const meta = useQuery({ queryKey: ["meta"], queryFn: getMeta, staleTime: 60_000 });
  const run = meta.data?.current_run;
  const reviewed = run?.enforcer_commit === ENFORCER_COMMIT;
  return <LivePanel title="Exactly which software produced this data" status={{ pending: meta.isPending, error: meta.isError && !meta.data }}>
    <dl className="mini-facts">
      <dt>Network</dt><dd>{meta.data?.dataset.network_id ?? "Unknown"}, enforcing from block {n(meta.data?.dataset.activation_height)}</dd>
      <dt>Enforcer</dt><dd className="hash">{run?.enforcer_commit ? <a className="text-link" href={reviewed ? references.enforcer.href : `https://github.com/LayerTwo-Labs/bip300301_enforcer/commit/${run.enforcer_commit}`} target="_blank" rel="noopener noreferrer">{short(run.enforcer_commit)}</a> : "Unknown"}{reviewed && " · the build these lessons were checked against"}</dd>
      <dt>Node</dt><dd className="hash">{run?.node_commit ? short(run.node_commit) : "Unknown"}</dd>
      <dt>Monitor</dt><dd className="hash">{run?.monitor_commit ? short(run.monitor_commit) : "Unknown"}</dd>
      <dt>Dataset</dt><dd className="hash">{meta.data?.dataset.dataset_id ?? "Unknown"}</dd>
    </dl>
  </LivePanel>;
}

const exports: [string, string][] = [["activity", "All activity"], ["deposits", "Deposits"], ["withdrawal-bundles", "Withdrawals"], ["ctip/history", "Treasury readings"], ["bmm/commitments", "Merged-mining commitments"], ["events", "Raw events"]];
const datasetFiles: [string, string][] = [
  ["sidechain.csv", "The sidechain in the slot and any proposal for it, with miner approvals."],
  ["deposits.csv", "Every deposit: block, transaction, amount and sidechain address."],
  ["treasury.csv", "Every reading of the treasury output, with the tip it was read at."],
  ["withdrawals.csv", "Each change in a withdrawal's votes, the votes needed and its expiry, and each outcome."],
  ["bmm_commitments.csv", "Every block: whether it committed to a sidechain block, and to which."],
  ["bmm_bids.csv", "Every bid seen, and whether the next block committed to the block it paid for."],
  ["manifest.json", "Row counts, the SHA-256 of each file, what every column means, and the limits of the data."],
];
/** The address of one sidechain's complete dataset. */
export function datasetHref(slot: number, format: "zip" | "json" = "zip"): string {
  return `${apiBaseUrl}/api/v1/sidechains/${slot}/dataset${format === "json" ? "?format=json" : ""}`;
}
function DatasetLinks({ slot, label }: { slot: number; label: string }) {
  return <li><span>{label}</span><a href={datasetHref(slot)}>ZIP of CSV</a><a href={datasetHref(slot, "json")}>JSON</a></li>;
}
function DatasetContents() {
  return <GoDeeper summary="what is in the download">
    <dl className="mini-facts">{datasetFiles.map(([file, text]) => <Fragment key={file}><dt className="hash">{file}</dt><dd>{text}</dd></Fragment>)}</dl>
    <p>All files are read from the same moment of the data, so they agree with each other. Amounts are exact satoshis. Each row names the evidence it came from.</p>
  </GoDeeper>;
}
/** Everything recorded for one slot, as one download. */
export function SidechainDownload({ slot, name }: { slot: number; name: string }) {
  return <LivePanel title={`Take ${name}'s data with you`}>
    <p className="live-lede">Everything this site records for slot #{slot}, complete from the start of the network, in files any spreadsheet opens.</p>
    <ul className="download-list"><DatasetLinks slot={slot} label={`All of ${name}'s records`}/></ul>
    <DatasetContents/>
  </LivePanel>;
}
export function Downloads() {
  const sidechains = activeSidechains(useObservatory().data);
  const [slot, setSlot] = useState<number>();
  const chosen = sidechains.find(s => s.slot === slot) ?? sidechains[0];
  return <LivePanel title="Take the data with you">
    <p className="live-lede">Download everything the Observatory has recorded for one sidechain, from one moment of the data. Block records (deposits, withdrawal outcomes, merged-mining commitments) start at activation; readings (treasury values, vote counts, bids) start when the monitor began reading them, and gaps are listed in the coverage report:</p>
    {chosen && <ul className="download-list">
      <li><span className="picker"><label htmlFor="dataset-slot">Sidechain </label><select id="dataset-slot" value={chosen.slot} onChange={e => setSlot(Number(e.target.value))}>{sidechains.map(s => <option key={s.slot} value={s.slot}>#{s.slot} {s.title ?? "Unnamed"}</option>)}</select></span>
        <a href={datasetHref(chosen.slot)}>ZIP of CSV</a><a href={datasetHref(chosen.slot, "json")}>JSON</a></li>
    </ul>}
    <DatasetContents/>
    <p className="live-lede">Or download one list across all sidechains, up to 10,000 records per file. The file says if it was cut short; the longest lists already are, so use the sidechain downloads for everything recorded.</p>
    <ul className="download-list">{exports.map(([resource, label]) => <li key={resource}><span>{label}</span>
      <a href={`${apiBaseUrl}/api/v1/export?resource=${encodeURIComponent(resource)}&format=csv`}>CSV</a>
      <a href={`${apiBaseUrl}/api/v1/export?resource=${encodeURIComponent(resource)}&format=json`}>JSON</a></li>)}</ul>
    <p className="live-note">Developers can use the same API directly: <a className="text-link" href={`${apiBaseUrl}/docs`} target="_blank" rel="noopener noreferrer">API reference</a>.</p>
  </LivePanel>;
}
