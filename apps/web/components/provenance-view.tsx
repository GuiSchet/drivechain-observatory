"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { object, short } from "@/lib/protocol";
import { timeAgo } from "@/lib/explain";
import { n } from "@/lib/live";
import type { ProtocolPage } from "@/lib/types";
import { references, ENFORCER_COMMIT } from "@/content/references";
import { useNow } from "@/components/live/basics";
import { ConfidenceChip, GoDeeper } from "@/components/learn/primitives";

function utc(iso: unknown): string {
  return typeof iso === "string" ? iso.replace("T", " ").replace(/(\.\d+)?(Z|\+00:00)$/, " UTC") : "unknown";
}

const sourceText: Record<string, string> = {
  enforcer: "the official BIP300/301 enforcer: sidechains, treasuries, withdrawals, merged-mining bids and the blocks it connects",
  node: "our Betanet node: block headers and the chain tip",
};

function useRecord(resource: "runs" | "snapshot-groups", id: string) {
  return useQuery({ queryKey: ["provenance", resource, id], queryFn: () => getJson<ProtocolPage>(`/api/v1/${resource}/${encodeURIComponent(id)}`) });
}

function Shell({ back, eyebrow, title, children, loading, failed }: { back?: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode; loading: boolean; failed: boolean }) {
  return <main className="detail-shell">
    {back ?? <Link className="text-link" href="/learn/how-we-know">← How we know</Link>}
    <div className="eyebrow">{eyebrow}</div><h1>{title}</h1>
    {failed && <p className="inline-notice" role="status">This record is unavailable or does not exist in this dataset.</p>}
    {loading && !failed && <p role="status">Loading…</p>}
    {children}
  </main>;
}

/** One monitor session: which source it read, when, with which software. */
export function RunView({ id }: { id: string }) {
  const query = useRecord("runs", id), now = useNow(30_000);
  const item = query.data?.items[0], d = object(item?.data);
  const running = d.status === "running" || (d.finished_at == null && d.status == null);
  const reviewed = d.enforcer_commit === ENFORCER_COMMIT;
  const commit = (v: unknown) => typeof v === "string" ? short(v) : "unknown";
  return <Shell eyebrow="MONITOR SESSION" title={`Monitor session ${id.slice(0, 8)}`} loading={query.isPending} failed={query.isError || (!!query.data && !item)}>
    {item && <>
      <section className="panel compact-panel block-summary">
        <h2>What it is</h2>
        <p>A monitor session is one continuous run of a monitor reader, from the moment it starts until it stops or restarts. This one reads {sourceText[String(d.source)] ?? `the source “${String(d.source)}”`}.</p>
        <p>It started {timeAgo(String(d.started_at), now)} ({utc(d.started_at)}) and {running ? <strong>is still running</strong> : <>stopped at {utc(d.finished_at)}{d.finish_reason ? ` (${String(d.finish_reason).replaceAll("_", " ")})` : ""}</>}. Its captures are numbered in order, so a missing one would show; the latest is number {n(Number(d.last_capture_seq ?? 0) || undefined)}.</p>
        <p className="scope-note">Every record says which session captured it. A restart starts a new session, and the readings it takes again appear as new sightings of the same values. <Link className="text-link" href="/learn/how-we-know">How we know</Link></p>
      </section>
      <section className="panel compact-panel">
        <h2>Software it ran</h2>
        <dl className="facts">
          <dt>Enforcer</dt><dd className="hash">{typeof d.enforcer_commit === "string" ? <a className="text-link" href={reviewed ? references.enforcer.href : `https://github.com/LayerTwo-Labs/bip300301_enforcer/commit/${d.enforcer_commit}`} target="_blank" rel="noopener noreferrer">{commit(d.enforcer_commit)}</a> : "unknown"}{reviewed && " · the build these lessons were checked against"}</dd>
          <dt>Betanet node</dt><dd className="hash">{commit(d.node_commit)}</dd>
          <dt>Monitor</dt><dd className="hash">{commit(d.monitor_commit)}</dd>
          <dt>Record format</dt><dd>contract v{String(d.event_contract_version ?? "?")}</dd>
        </dl>
      </section>
      <GoDeeper summary="the exact session record">
        <p>What this session declared it can do, and the full record as imported.</p>
        <ul className="plain-list">{(Array.isArray(d.capabilities) ? d.capabilities : []).map(c => <li key={String(c)}><code>{String(c)}</code></li>)}</ul>
        <pre tabIndex={0}>{JSON.stringify(item.data, null, 2)}</pre>
      </GoDeeper>
    </>}
  </Shell>;
}

/** A group of readings taken together, and whether the chain stayed still while they were taken. */
export function SnapshotView({ id }: { id: string }) {
  const query = useRecord("snapshot-groups", id), now = useNow(30_000);
  const item = query.data?.items[0], d = object(item?.data);
  const before = typeof d.tip_before_height === "number" ? d.tip_before_height : undefined, after = typeof d.tip_after_height === "number" ? d.tip_after_height : undefined;
  const ms = typeof d.started_at === "string" && typeof d.finished_at === "string" ? Date.parse(d.finished_at) - Date.parse(d.started_at) : undefined;
  const stable = d.consistency === "tip_matched";
  return <Shell eyebrow="READING GROUP" title={`Reading group ${id.slice(0, 8)}`} loading={query.isPending} failed={query.isError || (!!query.data && !item)}>
    {item && <>
      <section className="panel compact-panel block-summary">
        <h2>What it is</h2>
        <p>The monitor reads the current state (sidechains, treasuries, withdrawal votes) in groups. It notes the chain tip just before and just after each group, so we know whether the chain moved while it was reading.</p>
        <p>This group was taken {timeAgo(String(d.started_at), now)} ({utc(d.started_at)}){ms != null ? ` and took ${ms.toLocaleString("en-US")} ms` : ""}. The tip was {before != null ? `block ${n(before)}` : "unknown"} before and {after != null ? `block ${n(after)}` : "unknown"} after.</p>
        <p><ConfidenceChip quality={stable ? "tip_matched" : "unknown"}/> {stable
          ? "The tip did not change, so every reading in this group describes the state at that tip."
          : "The tip changed or could not be confirmed, so the readings in this group may mix two moments. They are marked unknown."}</p>
        <p className="scope-note">Even an unchanged tip does not prove the chain did not move and come back in between; it is the best check available. <Link className="text-link" href="/learn/how-we-know">How we know</Link>{typeof d.run_id === "string" && <> · <Link className="text-link" href={`/about/data/runs/${d.run_id}`}>The monitor session that took it</Link></>}</p>
      </section>
      <GoDeeper summary="the exact group record">
        <dl className="facts">
          <dt>Tip before</dt><dd className="hash">{String(d.tip_before_hash ?? "unknown")}</dd>
          <dt>Tip after</dt><dd className="hash">{String(d.tip_after_hash ?? "unknown")}</dd>
          <dt>Attempts</dt><dd>{String(d.attempts ?? "unknown")}</dd>
        </dl>
        <pre tabIndex={0}>{JSON.stringify(item.data, null, 2)}</pre>
      </GoDeeper>
    </>}
  </Shell>;
}
