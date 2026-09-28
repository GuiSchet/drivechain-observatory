"use client";
import { ProtocolList } from "./protocol-browser";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiBaseUrl, getEvidence } from "@/lib/api";
import type { Evidence } from "@/lib/types";
export function EvidenceView({ dataset, id, initial }: { dataset: string; id: string; initial: Evidence | null }) {
  const query = useQuery({ queryKey: ["events", dataset, id], queryFn: () => getEvidence(dataset, id), initialData: initial ?? undefined });
  const [copy, setCopy] = useState("Copy exact JSON");
  return <main className="detail-shell"><div className="eyebrow">PERMANENT EVIDENCE</div><h1>Event {id}</h1><p className="hash">Dataset {dataset}</p>
    {query.isError && <p role="status">This evidence is unavailable or does not exist in the requested dataset.</p>}
    {query.data && <><section className="panel compact-panel"><dl className="facts"><dt>Kind / contract</dt><dd>{query.data.kind} / v{query.data.event_contract_version}</dd><dt>Fact SHA-256</dt><dd className="hash">{query.data.fact_sha256 ?? "Not yet imported"}</dd><dt>Interpretation</dt><dd>{query.data.interpretation_error ?? "No interpretation error recorded"}</dd></dl>
      <button onClick={async () => { try { await navigator.clipboard.writeText(query.data!.payload_json); setCopy("Copied"); } catch { setCopy("Copy unavailable; select the text below"); } }}>{copy}</button>{" "}
      <a className="text-link" href={`${apiBaseUrl}/api/v1/datasets/${encodeURIComponent(dataset)}/events/${encodeURIComponent(id)}/raw`}>Open raw JSON</a>
      <pre tabIndex={0}>{query.data.payload_json}</pre><p>JSON is rendered as exact text so large integers keep every digit.</p></section>
      <ProtocolList resource={`datasets/${dataset}/events/${id}/occurrences`} query={{dataset}} heading="Recorded occurrences"/></>}
  </main>;
}
