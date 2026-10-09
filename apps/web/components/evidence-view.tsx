"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl, getEvidence } from "@/lib/api";
import type { Evidence } from "@/lib/types";
import { captureText, summarizeEvidence } from "@/lib/evidence";
import { timeAgo } from "@/lib/explain";
import { useSidechainNames } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import { useNow } from "@/components/live/basics";
import { GoDeeper } from "@/components/learn/primitives";
import { ProofIntro } from "./proof-intro";

function utc(iso: string | null | undefined): string {
  return iso ? iso.replace("T", " ").replace(/(\.\d+)?(Z|\+00:00)$/, " UTC") : "unknown";
}

/** One recorded event: what it says in words first, then when it was seen, then the exact record. */
export function EvidenceView({ dataset, id, initial }: { dataset: string; id: string; initial: Evidence | null }) {
  const query = useQuery({ queryKey: ["events", dataset, id], queryFn: () => getEvidence(dataset, id), initialData: initial ?? undefined });
  const names = useSidechainNames(), unit = useUnit(), now = useNow(30_000);
  const [copy, setCopy] = useState("Copy exact JSON");
  const e = query.data;
  const s = e ? summarizeEvidence(e.kind, e.payload_json, names, unit) : undefined;
  const seen = [...(e?.occurrences ?? [])].sort((a, b) => b.observed_at.localeCompare(a.observed_at));
  const first = seen[seen.length - 1], last = seen[0];
  return <main className="detail-shell">
    {s?.block ? <Link className="text-link" href={`/datasets/${dataset}/blocks/${s.block.hash}`}>← Block {s.block.height.toLocaleString("en-US")}</Link> : <Link className="text-link" href="/live">← Live activity</Link>}
    <div className="eyebrow">{s?.reading ? "A READING" : "A RECORDED FACT"} · RECORD {id}</div>
    <h1>{s?.title ?? `Record ${id}`}</h1>
    {query.isError && <p className="inline-notice" role="status">This record is unavailable or does not exist in this dataset.</p>}
    {!e && !query.isError && <p role="status">Loading the record…</p>}
    {e && s && <>
      <section className="panel compact-panel block-summary">
        <h2>What it says</h2>
        {s.lines.map((line, i) => <p key={i}>{line}</p>)}
        {e.interpretation_error && <p className="error-text">This record could not be interpreted: {e.interpretation_error}</p>}
        <p className="scope-note">
          {s.reading ? "A reading shows the state at one moment; it does not say how the state got there. " : "A fact about one L1 block, as the official sources reported it. "}
          {s.block && <><Link className="text-link" href={`/datasets/${dataset}/blocks/${s.block.hash}`}>Everything in block {s.block.height.toLocaleString("en-US")}</Link> · </>}
          {s.slot != null && <><Link className="text-link" href={`/sidechains/${s.slot}`}>The sidechain&apos;s page</Link> · </>}
          <Link className="text-link" href={`/learn/${s.lesson}`}>Learn what it means</Link>
        </p>
      </section>

      <section className="panel compact-panel">
        <h2>When the monitor recorded it</h2>
        <p>{seen.length === 1 ? <>Recorded once, {timeAgo(first.observed_at, now)} ({utc(first.observed_at)}), {captureText[first.capture_method] ?? first.capture_method}.</>
          : seen.length ? <>Recorded {seen.length.toLocaleString("en-US")} times{e.occurrences_truncated ? " or more" : ""}: first {timeAgo(first.observed_at, now)} ({utc(first.observed_at)}), last {timeAgo(last.observed_at, now)}. The content was identical every time; each sighting is evidence that it was confirmed again.</>
          : "No sighting has been imported yet."}</p>
        {seen.length > 1 && <div className="table-scroll"><table className="friendly-table">
          <thead><tr><th>When</th><th>How</th><th>Monitor session</th>{seen.some(o => o.snapshot_group_id) && <th>Reading group</th>}</tr></thead>
          <tbody>{seen.slice(0, 50).map(o => <tr key={o.observation_id}>
            <td>{utc(o.observed_at)}</td><td>{captureText[o.capture_method] ?? o.capture_method}</td>
            <td><Link className="text-link" href={`/about/data/runs/${o.run_id}?dataset=${dataset}`}>{o.run_id.slice(0, 8)}</Link></td>
            {seen.some(x => x.snapshot_group_id) && <td>{o.snapshot_group_id ? <Link className="text-link" href={`/about/data/snapshots/${o.snapshot_group_id}?dataset=${dataset}`}>{o.snapshot_group_id.slice(0, 8)}</Link> : "—"}</td>}
          </tr>)}</tbody>
        </table></div>}
        {seen.length > 50 && <p className="scope-note">Showing the latest 50 sightings.</p>}
      </section>

      <GoDeeper summary="the exact record">
        <ProofIntro what="event" kind={e.kind}/>
        <dl className="facts">
          <dt>Record type</dt><dd><code>{e.kind}</code>, monitor contract v{e.event_contract_version}</dd>
          <dt>Fingerprint (SHA-256)</dt><dd><span className="hash">{e.fact_sha256 ?? "not imported yet"}</span><br/><small className="muted">Changing a single byte of the record would change this fingerprint.</small></dd>
        </dl>
        {e.raw_block_omitted && <p className="inline-notice">Only the block header is kept here. The fingerprint above is the source&apos;s hash of the full block.</p>}
        <p>
          <button onClick={async () => { try { await navigator.clipboard.writeText(e.payload_json); setCopy("Copied"); } catch { setCopy("Copy unavailable; select the text below"); } }}>{copy}</button>{" "}
          <a className="text-link" href={`${apiBaseUrl}/api/v1/datasets/${encodeURIComponent(dataset)}/events/${encodeURIComponent(id)}/raw`}>Open raw JSON</a>
        </p>
        <pre tabIndex={0}>{e.payload_json}</pre>
        <p className="scope-note">The JSON is shown as exact text, so large numbers keep every digit.</p>
      </GoDeeper>
    </>}
  </main>;
}
