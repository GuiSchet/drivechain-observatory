"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Blocks, Gavel, Landmark, Pickaxe, Sparkles, Vote } from "lucide-react";
import type { ReactNode } from "react";
import { getJson } from "@/lib/api";
import { apiQuery, at, object } from "@/lib/protocol";
import { groupActivity, readingTip } from "@/lib/activity";
import { blockNumber, describeActivity, formatCoinPair, outcomeOf, sidechainLabel, timeAgo } from "@/lib/explain";
import { n, useSidechainNames, weakestQuality } from "@/lib/live";
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

function proofOf(item: ProtocolItem, dataset: string | undefined): string | undefined {
  return item.evidence[0] && dataset ? `/datasets/${dataset}/events/${item.evidence[0].event_id}` : undefined;
}

/**
 * When a fact happened (its block) and, if much later, when the monitor recorded it; or, for a reading,
 * the tip it was first taken at and when it was last confirmed. In the raw log every row is one reading.
 */
function When({ item, now, log = false }: { item: ProtocolItem; now: number; log?: boolean }) {
  const tip = readingTip(item);
  if (tip !== undefined) {
    if (log) return <span>last read {timeAgo(item.observed_at, now)} · first at tip {blockNumber(tip)}</span>;
    const confirmed = item.first_observed_at && item.observed_at && item.observed_at !== item.first_observed_at;
    return <span>first read at tip {blockNumber(tip)} · {timeAgo(item.first_observed_at ?? item.observed_at, now)}{confirmed ? ` · last confirmed ${timeAgo(item.observed_at, now)}` : ""}</span>;
  }
  const happened = item.block_time ? Date.parse(item.block_time) : NaN, recorded = item.observed_at ? Date.parse(item.observed_at) : NaN;
  const late = recorded - happened > 6 * 3_600_000;
  return <span>{item.height != null ? blockNumber(item.height) : "current state"} · {timeAgo(item.block_time ?? item.observed_at, now)}{late ? ` · recorded by the monitor ${timeAgo(item.observed_at, now)}` : ""}</span>;
}

function Row({ kind, icon: rowIcon, text, meta }: { kind: string; icon: ReactNode; text: ReactNode; meta: ReactNode }) {
  return <li className={`activity-${kind}`}>
    <span className="activity-icon" aria-hidden="true">{rowIcon}</span>
    <div className="activity-body"><p>{text}</p><div className="activity-meta">{meta}</div></div>
  </li>;
}

/**
 * Plain-English activity, newest first by block; each row links to its lesson and its proof.
 * By default only changes are listed: a reading identical to the previous one is left out.
 * `withTreasury` also loads treasury readings, to show each deposit's before and after; readings
 * that match no listed deposit stay hidden.
 */
export function ActivityFeed({ slot, kind, limit = 20, paged = false, compact = false, changes = true, order = "block", withTreasury = false }: { slot?: number; kind?: string; limit?: number; paged?: boolean; compact?: boolean; changes?: boolean; order?: "block" | "observed"; withTreasury?: boolean }) {
  const names = useSidechainNames(), unit = useUnit(), now = useNow(15_000);
  const key = apiQuery({ slot, kind: withTreasury && kind ? `${kind},ctip` : kind, limit, order, changes: changes ? "true" : undefined });
  const result = useInfiniteQuery({
    queryKey: ["protocol", "activity", "feed", key], initialPageParam: "",
    queryFn: ({ pageParam }) => getJson<ProtocolPage>(`/api/v1/activity?${key}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  const items = result.data?.pages.flatMap(p => p.items) ?? [];
  const dataset = result.data?.pages[0]?.context.meta.dataset_id;
  const entries = groupActivity(items).filter(e => !(withTreasury && e.type === "item" && e.item.kind === "ctip"));
  if (result.isPending) return <p className="live-empty" role="status">Loading activity…</p>;
  if (result.isError && !items.length) return <p className="live-empty" role="status">Activity is unavailable right now; retrying automatically.</p>;
  if (!entries.length) return <p className="live-empty">No activity recorded yet{slot != null ? " for this sidechain" : ""}.</p>;
  const links = (first: ProtocolItem, all: ProtocolItem[], extra?: ReactNode) => {
    const lesson = lessonFor[first.kind], proof = proofOf(first, dataset);
    return <>
      {!compact && <ConfidenceChip quality={all.length > 1 ? weakestQuality(all) : first.quality}/>}
      {lesson && !compact && <Link href={`/learn/${lesson}`}>What is this?</Link>}
      {proof && <Link href={proof}>Proof</Link>}
      {extra}
    </>;
  };
  return <>
    <ol className={`activity-feed ${compact ? "compact" : ""}`}>{entries.map(entry => {
      if (entry.type === "bmm") {
        const first = entry.items[0];
        const committed = entry.items.filter(i => object(i.data).bmm_commitment), missing = entry.items.filter(i => !object(i.data).bmm_commitment);
        const list = (xs: ProtocolItem[]) => [...xs].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)).map(i => sidechainLabel(i.slot, names)).join(", ");
        const text = entry.items.length === 1 ? describeActivity(first, names, unit)
          : <>In {blockNumber(entry.height)}, L1 miners committed to block hashes of {committed.length ? list(committed) : "no sidechain"}{missing.length ? <>; none for {list(missing)}</> : null}.</>;
        return <Row key={entry.key} kind="bmm_commitment" icon={icon(first)} text={text} meta={<><When item={first} now={now}/>{links(first, entry.items)}</>}/>;
      }
      if (entry.type === "votes") {
        const newest = entry.items[0], oldest = entry.items[entry.items.length - 1];
        const votes = (i: ProtocolItem) => at(i.data, "bundle", "vote_count");
        const v1 = votes(oldest), v2 = votes(newest), t1 = readingTip(oldest), t2 = readingTip(newest);
        const text = entry.items.length === 1 ? describeActivity(newest, names, unit)
          : <>{sidechainLabel(newest.slot, names)}&apos;s pending withdrawal went from <strong>{n(typeof v1 === "number" ? v1 : undefined)}</strong> to <strong>{n(typeof v2 === "number" ? v2 : undefined)}</strong> votes across {entry.items.length} readings, between tips {n(t1)} and {n(t2)}. These are readings, not every vote.</>;
        return <Row key={entry.key} kind="bundle" icon={icon(newest)} text={text} meta={<><When item={newest} now={now}/>{links(newest, entry.items)}</>}/>;
      }
      const { item, treasury } = entry, reading = treasury ? proofOf(treasury.reading, dataset) : undefined;
      const [before, after] = treasury ? formatCoinPair(treasury.before.toString(), treasury.after.toString()) : [];
      const text = treasury
        ? <>{describeActivity(item, names, unit)} Its treasury went from <strong>{before}</strong> to <strong>{after}</strong>{treasury.sequence ? <> (output #{treasury.sequence})</> : null}.</>
        : describeActivity(item, names, unit);
      return <Row key={entry.key} kind={item.kind} icon={icon(item)} text={text}
        meta={<><When item={item} now={now} log={!changes}/>{links(item, [item], reading && <Link href={reading}>Treasury reading</Link>)}</>}/>;
    })}</ol>
    {paged && result.hasNextPage && <div className="pagination"><button disabled={result.isFetchingNextPage} onClick={() => { void result.fetchNextPage(); }}>{result.isFetchingNextPage ? "Loading…" : "Show older activity"}</button></div>}
  </>;
}
