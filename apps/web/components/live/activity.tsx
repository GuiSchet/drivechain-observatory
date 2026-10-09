"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Blocks, Gavel, Landmark, Pickaxe, Sparkles, Vote } from "lucide-react";
import type { ReactNode } from "react";
import { getJson } from "@/lib/api";
import { apiQuery } from "@/lib/protocol";
import { blockNumber, describeActivity, outcomeOf, timeAgo } from "@/lib/explain";
import { useSidechainNames } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import type { ProtocolItem, ProtocolPage } from "@/lib/types";
import { ConfidenceChip } from "@/components/learn/primitives";
import { useNow } from "./basics";

const lessonFor: Record<string, string> = {
  deposit: "deposits", ctip: "deposits", bundle: "withdrawals", bundle_outcome: "withdrawals",
  bmm_commitment: "merged-mining", slot_block: "merged-mining", bid: "merged-mining", auction_sample: "merged-mining", confirmed_bmm_fee: "merged-mining",
  instance: "slots", proposal: "creating-a-sidechain", parameters: "creating-a-sidechain",
};

function icon(item: ProtocolItem): ReactNode {
  switch (item.kind) {
    case "deposit": return <ArrowDownToLine size={16}/>;
    case "bundle_outcome": return outcomeOf(item) === "Succeeded" ? <ArrowUpFromLine size={16}/> : <Gavel size={16}/>;
    case "bundle": return <Vote size={16}/>;
    case "ctip": return <Landmark size={16}/>;
    case "bmm_commitment": case "slot_block": case "bid": case "confirmed_bmm_fee": return <Pickaxe size={16}/>;
    case "instance": case "proposal": return <Sparkles size={16}/>;
    default: return <Blocks size={16}/>;
  }
}

/** Plain-English activity, newest first; each row links to its lesson and its proof. */
export function ActivityFeed({ slot, kind, limit = 20, paged = false, compact = false }: { slot?: number; kind?: string; limit?: number; paged?: boolean; compact?: boolean }) {
  const names = useSidechainNames(), unit = useUnit(), now = useNow(15_000);
  const key = apiQuery({ slot, kind, limit });
  const result = useInfiniteQuery({
    queryKey: ["protocol", "activity", "feed", key], initialPageParam: "",
    queryFn: ({ pageParam }) => getJson<ProtocolPage>(`/api/v1/activity?${key}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  const items = result.data?.pages.flatMap(p => p.items) ?? [];
  const dataset = result.data?.pages[0]?.context.meta.dataset_id;
  if (result.isPending) return <p className="live-empty" role="status">Loading activity…</p>;
  if (result.isError && !items.length) return <p className="live-empty" role="status">Activity is unavailable right now; retrying automatically.</p>;
  if (!items.length) return <p className="live-empty">No activity recorded yet{slot != null ? " for this sidechain" : ""}.</p>;
  return <>
    <ol className={`activity-feed ${compact ? "compact" : ""}`}>{items.map(item => {
      const lesson = lessonFor[item.kind], proof = item.evidence[0] && dataset ? `/datasets/${dataset}/events/${item.evidence[0].event_id}` : undefined;
      const when = item.block_time ?? item.observed_at;
      return <li key={item.id} className={`activity-${item.kind}`}>
        <span className="activity-icon" aria-hidden="true">{icon(item)}</span>
        <div className="activity-body">
          <p>{describeActivity(item, names, unit)}</p>
          <div className="activity-meta">
            <span>{item.height != null ? blockNumber(item.height) : "current state"} · {timeAgo(when, now)}</span>
            {!compact && <ConfidenceChip quality={item.quality}/>}
            {lesson && !compact && <Link href={`/learn/${lesson}`}>What is this?</Link>}
            {proof && <Link href={proof}>Proof</Link>}
          </div>
        </div>
      </li>;
    })}</ol>
    {paged && result.hasNextPage && <div className="pagination"><button disabled={result.isFetchingNextPage} onClick={() => { void result.fetchNextPage(); }}>{result.isFetchingNextPage ? "Loading…" : "Show older activity"}</button></div>}
  </>;
}
