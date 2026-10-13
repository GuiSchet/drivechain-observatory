"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiBaseUrl, getJson } from "@/lib/api";
import { apiQuery, label } from "@/lib/protocol";
import { readingTip } from "@/lib/activity";
import { describeActivity, sidechainLabel } from "@/lib/explain";
import { n, proofHref, useSidechainNames } from "@/lib/live";
import { utc } from "@/lib/stats";
import type { ProtocolPage } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { ConfidenceChip, CopyText } from "@/components/learn/primitives";

/** One kind of activity as a table, with the same records as the plain-English feed and the API call behind it. */
export function ActivityTable({ kind, changes = true, order = "block", limit = 60 }: { kind?: string; changes?: boolean; order?: "block" | "observed"; limit?: number }) {
  const names = useSidechainNames(), unit = useUnit();
  const key = apiQuery({ kind, limit, order, changes: changes ? "true" : undefined });
  const result = useInfiniteQuery({
    queryKey: ["protocol", "activity", "table", key], initialPageParam: "",
    queryFn: ({ pageParam }) => getJson<ProtocolPage>(`/api/v1/activity?${key}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  const items = result.data?.pages.flatMap(p => p.items) ?? [], dataset = result.data?.pages[0]?.context.meta.dataset_id;
  const exportQuery = apiQuery({ resource: "activity", kind, order, changes: changes ? "true" : undefined, format: "csv" });
  return <>
    <div className="api-strip">
      <CopyText value={`${apiBaseUrl}/api/v1/activity?${key}`} label="Copy API URL" className="code-line"/>
      <a className="text-link" href={`${apiBaseUrl}/api/v1/export?${exportQuery}`}>Download CSV</a>
    </div>
    {result.isPending ? <p className="live-empty" role="status">Loading activity…</p>
      : result.isError && !items.length ? <p className="live-empty" role="status">Activity is unavailable right now; retrying automatically.</p>
      : !items.length ? <p className="live-empty">No activity recorded yet.</p>
      : <div className="table-scroll"><table className="data-table">
        <thead><tr><th className="num">Block</th><th>Time (UTC)</th><th>Kind</th><th>Sidechain</th><th>Record</th><th>Quality</th><th/></tr></thead>
        <tbody>{items.map(i => {
          const tip = readingTip(i), proof = proofHref(i, dataset);
          return <tr key={i.id}>
            <td className="num nowrap">{i.height != null ? (dataset && i.hash ? <Link href={`/datasets/${dataset}/blocks/${i.hash}`}>{n(i.height)}</Link> : n(i.height)) : tip != null ? `tip ${n(tip)}` : "—"}</td>
            <td className="nowrap">{utc(i.height != null ? i.block_time ?? i.observed_at : i.first_observed_at ?? i.observed_at)}</td>
            <td className="nowrap">{label(i.kind)}</td>
            <td className="nowrap">{i.slot != null ? <Link href={`/sidechains/${i.slot}`}>{sidechainLabel(i.slot, names)}</Link> : "—"}</td>
            <td>{describeActivity(i, names, unit)}</td>
            <td><ConfidenceChip quality={i.quality}/></td>
            <td>{proof && <Link className="proof-link" href={proof}>evidence</Link>}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    {result.hasNextPage && <div className="pagination"><button disabled={result.isFetchingNextPage} onClick={() => { void result.fetchNextPage(); }}>{result.isFetchingNextPage ? "Loading…" : "Show older activity"}</button></div>}
  </>;
}
