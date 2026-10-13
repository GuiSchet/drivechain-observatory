"use client";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getBlocks, getJson } from "@/lib/api";
import { apiQuery, at, object } from "@/lib/protocol";
import { readingTip, treasuryChange, type TreasuryChange } from "@/lib/activity";
import { blockNumber, describeActivity, formatCoinPair, formatCoins, formatSats, sidechainLabel, timeAgo } from "@/lib/explain";
import { n, useBmmMetrics, useSidechainNames } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import type { ProtocolItem, ProtocolPage } from "@/lib/types";
import { useLiveActivity } from "@/components/providers";
import { Term } from "@/components/learn/primitives";
import { useNow } from "./basics";

// Everything except merged mining, which comes per block from /bmm (it also knows observed absences).
const FEED = "deposit,bundle_outcome,bundle,ctip,instance,proposal";

export type Bucket = { deposits: { item: ProtocolItem; treasury?: TreasuryChange }[]; outcomes: ProtocolItem[]; readings: ProtocolItem[] };

/** The height an activity row belongs to: its block, or the tip a reading was first taken at. */
function heightOf(item: ProtocolItem): number | undefined {
  return item.height ?? readingTip(item);
}

/**
 * What the block timeline and the block table both read: blocks newest first, the activity recorded in or read at
 * each one, and the merged-mining cells of the last 144 blocks.
 */
export function useTimeline() {
  const blocks = useInfiniteQuery({
    queryKey: ["protocol", "blocks", "timeline"], initialPageParam: "",
    queryFn: ({ pageParam }) => getBlocks(`limit=15${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  const feedKey = apiQuery({ kind: FEED, changes: "true", order: "block", limit: 200 });
  const feed = useInfiniteQuery({
    queryKey: ["protocol", "activity", "timeline", feedKey], initialPageParam: "",
    queryFn: ({ pageParam }) => getJson<ProtocolPage>(`/api/v1/activity?${feedKey}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  // Every slot, following the API's pages of 16 slots.
  const bmm = useBmmMetrics(144);

  const list = blocks.data?.pages.flatMap(p => p.blocks) ?? [];
  const items = feed.data?.pages.flatMap(p => p.items) ?? [];
  const dataset = feed.data?.pages[0]?.context.meta.dataset_id ?? blocks.data?.pages[0]?.meta.dataset_id;
  // Below the oldest loaded height the feed may be incomplete, so those blocks wait for the next page.
  const heights = items.map(heightOf).filter((h): h is number => h != null);
  const complete = feed.hasNextPage && heights.length ? Math.min(...heights) + 1 : -Infinity;
  const shown = list.filter(b => b.height >= complete);

  // Deposits carry the treasury reading of the output they created; that reading is not listed again.
  const ctipByTxid = new Map(items.filter(i => i.kind === "ctip").map(i => [String(at(i.data, "ctip", "txid")), i]));
  const used = new Set<string>(), buckets = new Map<number, Bucket>();
  const bucket = (h: number) => buckets.get(h) ?? (buckets.set(h, { deposits: [], outcomes: [], readings: [] }), buckets.get(h)!);
  for (const item of items) {
    const h = heightOf(item);
    if (h == null || item.kind !== "deposit") continue;
    const treasury = treasuryChange(item, ctipByTxid.get(String(at(item.data, "outpoint", "txid"))));
    if (treasury) used.add(treasury.reading.id);
    bucket(h).deposits.push({ item, treasury });
  }
  for (const item of items) {
    const h = heightOf(item);
    if (h == null || item.kind === "deposit" || used.has(item.id)) continue;
    if (item.kind === "bundle_outcome") bucket(h).outcomes.push(item); else bucket(h).readings.push(item);
  }
  // The previous reading of the same entity, to say how a value changed.
  const previous = (item: ProtocolItem) => items.find(i => i.entity_id === item.entity_id && i.kind === item.kind && (heightOf(i) ?? 0) < (heightOf(item) ?? 0));

  const cells = new Map<number, { slot: number; state: string }[]>();
  for (const row of bmm.data?.slots ?? []) for (const c of row.cells) cells.set(c.height, [...(cells.get(c.height) ?? []), { slot: row.slot, state: c.state }]);
  const proof = (i: ProtocolItem) => i.evidence[0] && dataset ? `/datasets/${dataset}/events/${i.evidence[0].event_id}` : undefined;
  const loadMore = () => {
    if (blocks.hasNextPage) void blocks.fetchNextPage();
    // Load more activity once the next blocks would fall below what the feed covers.
    if (feed.hasNextPage && list.length && list[list.length - 1].height - 15 < complete) void feed.fetchNextPage();
  };
  return {
    shown, buckets, cells, previous, proof, dataset, loadMore,
    pending: blocks.isPending || feed.isPending,
    error: (blocks.isError && !list.length) || (feed.isError && !items.length),
    more: blocks.hasNextPage || feed.hasNextPage,
    loading: blocks.isFetchingNextPage || feed.isFetchingNextPage,
  };
}

/**
 * Live activity block by block, newest first. Each block says what it contained (facts observed in that block)
 * and what the readings taken while it was the newest block found had changed.
 */
export function BlockTimeline() {
  const names = useSidechainNames(), unit = useUnit(), now = useNow(15_000), live = useLiveActivity();
  const { shown, buckets, cells, previous, proof, dataset, loadMore, pending, error, more, loading } = useTimeline();
  const P = ({ item }: { item: ProtocolItem }) => proof(item) ? <> <Link className="tl-proof" href={proof(item)!}>evidence</Link></> : null;

  if (pending) return <p className="live-empty" role="status">Loading the latest blocks…</p>;
  if (error) return <p className="live-empty" role="status">Live activity is unavailable right now; retrying automatically.</p>;

  return <>
    <ol className="timeline-blocks">{shown.map((b, index) => {
      const at_ = buckets.get(b.height), slots = cells.get(b.height) ?? [];
      const committed = slots.filter(c => c.state === "present"), observed = slots.filter(c => c.state !== "unknown_eligibility");
      const label = (xs: { slot: number }[]) => xs.map(c => sidechainLabel(c.slot, names)).join(", ");
      const href = dataset ? `/datasets/${dataset}/blocks/${b.hash}` : undefined;
      return <li key={b.hash} className={live?.hash === b.hash ? "fresh-block" : ""}>
        <div className="tl-head">
          {href ? <Link href={href}><strong>Block {n(b.height)}</strong></Link> : <strong>Block {n(b.height)}</strong>}
          <span>mined {timeAgo(b.block_time, now)}</span>
          {index === 0 && <span className="tl-tag">newest</span>}
        </div>
        <ul className="tl-facts">
          {observed.length ? <li className="tl-bmm">{committed.length
            ? <><Term id="bmm">Merged mining</Term>: L1 committed to block hashes of <strong>{committed.length}</strong> of {observed.length} sidechains ({label(committed)}).</>
            : <><Term id="bmm">Merged mining</Term>: no sidechain got a commitment in this block.</>}</li> : null}
          {at_?.deposits.map(({ item, treasury }) => {
            const [before, after] = treasury ? formatCoinPair(treasury.before.toString(), treasury.after.toString()) : [];
            return <li key={item.id} className="tl-deposit"><strong><Term id="m5">Deposit</Term>:</strong> {formatCoins(object(item.data).value_sats)} ({formatSats(object(item.data).value_sats, unit)}) into {sidechainLabel(item.slot, names)}{treasury ? <>; its treasury went from {before} to {after}</> : null}.<P item={item}/></li>;
          })}
          {at_?.outcomes.map(item => <li key={item.id} className="tl-withdrawal"><strong><Term id="bundle">Withdrawal</Term>:</strong> {describeActivity(item, names, unit)}<P item={item}/></li>)}
        </ul>
        {!!at_?.readings.length && <div className="tl-readings">
          <span className="tl-sub">Read while this was the newest block:</span>
          <ul className="tl-facts">{at_.readings.map(item => {
            if (item.kind === "bundle") {
              const votes = at(item.data, "bundle", "vote_count"), prev = previous(item), before = prev ? at(prev.data, "bundle", "vote_count") : undefined;
              const delta = typeof votes === "number" && typeof before === "number" ? votes - before : undefined;
              return <li key={item.id}>{sidechainLabel(item.slot, names)}&apos;s pending withdrawal has <strong>{typeof votes === "number" ? n(votes) : "an unknown number of"} votes</strong>{delta != null && prev ? <> ({delta >= 0 ? "+" : ""}{n(delta)} since the reading at {blockNumber(heightOf(prev))})</> : null}.<P item={item}/></li>;
            }
            return <li key={item.id}>{describeActivity(item, names, unit)}<P item={item}/></li>;
          })}</ul>
        </div>}
        {!observed.length && !at_ && <p className="tl-quiet">Nothing recorded for this block yet.</p>}
      </li>;
    })}</ol>
    {more && <div className="pagination"><button disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Show older blocks"}</button></div>}
  </>;
}
