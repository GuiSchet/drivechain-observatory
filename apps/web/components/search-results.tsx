"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBlocks, getJson } from "@/lib/api";
import { object } from "@/lib/protocol";
import { blockNumber, describeActivity, formatSats, sidechainLabel, timeAgo } from "@/lib/explain";
import { activeSidechains, useObservatory, useSidechainNames } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import type { ProtocolItem, ProtocolPage } from "@/lib/types";
import { ConfidenceChip, GoDeeper } from "@/components/learn/primitives";
import { useNow } from "@/components/live/basics";

// What a block page already explains in full: shown there, not repeated here.
const blockParts = new Set(["slot_block", "bmm_commitment", "tip", "chain_tip", "mainchain_transition", "block_connected", "block_disconnected"]);
const bidKinds = new Set(["bid", "auction", "auction_sample"]);

export function SearchResults({ q }: { q: string }) {
  const names = useSidechainNames(), unit = useUnit(), now = useNow(30_000);
  const sidechains = activeSidechains(useObservatory().data);
  const height = /^\d{1,9}$/.test(q) ? q : undefined;
  const matches = sidechains.filter(s => q && s.title?.toLowerCase().includes(q.toLowerCase()));
  const block = useQuery({ queryKey: ["blocks", "search", height], queryFn: () => getBlocks(`height=${height}&limit=1`), enabled: !!height });
  const results = useQuery({ queryKey: ["protocol", "search", q], queryFn: () => getJson<ProtocolPage>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=200`), enabled: !!q });
  const dataset = results.data?.context.meta.dataset_id ?? block.data?.meta.dataset_id;
  const found = block.data?.blocks.find(b => String(b.height) === height);
  const items = results.data?.items ?? [];
  const events = items.filter(i => !bidKinds.has(i.kind) && !(found && blockParts.has(i.kind)));
  // The same bid shows up in every sample taken while it was open; keep one per transaction.
  const bids = [...new Map(items.filter(i => i.kind === "bid").map(i => [String(object(i.data).txid ?? i.id), i])).values()];
  const proof = (i: ProtocolItem) => i.evidence[0] && dataset ? `/datasets/${dataset}/events/${i.evidence[0].event_id}` : undefined;
  const nothing = q && results.isSuccess && !events.length && !bids.length && !matches.length && !found;
  return <main className="page-shell"><div className="eyebrow">SEARCH</div><h1>{q ? <>Results for “{q}”</> : "Search"}</h1>
    <form action="/search" className="page-search" role="search"><input name="q" defaultValue={q} aria-label="Search" placeholder="Block height or hash, transaction id, withdrawal id, or sidechain name" required/><button type="submit">Search</button></form>
    {!q && <p className="lede">Search for a block height or hash, a transaction id, a withdrawal (M6) id, or a sidechain&apos;s name. Hashes and ids must be complete.</p>}
    {matches.map(s => <Link key={s.slot} className="search-hit" href={`/sidechains/${s.slot}`}><strong>{s.title}</strong><span>Sidechain in slot #{s.slot} · {s.description}</span></Link>)}
    {found && dataset && <Link className="search-hit" href={`/datasets/${dataset}/blocks/${found.hash}`}><strong>Block {found.height.toLocaleString("en-US")}</strong><span>Mined {timeAgo(found.block_time, now)}. Open it to see what it contained for each sidechain: merged-mining commitments, deposits and withdrawals.</span></Link>}
    {q && results.isPending && <p className="live-empty" role="status">Searching…</p>}
    {results.isError && <p className="live-empty" role="status">Search is unavailable right now. Try again in a moment.</p>}
    {nothing && <p className="live-empty">Nothing matches “{q}” in the recorded data. Names must match the sidechain&apos;s declared title; hashes and ids must be complete.</p>}
    {!!events.length && <>
      {found && <h2 className="story-h2">Also recorded at this height</h2>}
      <ol className="activity-feed">{events.map(item => <li key={item.id}><div className="activity-body">
        <p>{describeActivity(item, names, unit)}</p>
        <div className="activity-meta"><span>{item.height != null ? blockNumber(item.height) : "a reading of current state"} · {timeAgo(item.block_time ?? item.observed_at, now)}</span><ConfidenceChip quality={item.quality}/>
          {proof(item) && <Link href={proof(item)!}>Proof</Link>}
          {item.slot != null && <Link href={`/sidechains/${item.slot}`}>Sidechain page</Link>}</div>
      </div></li>)}</ol>
    </>}
    {!!bids.length && <GoDeeper summary={`${bids.length} merged-mining ${bids.length === 1 ? "bid" : "bids"} seen while this was the newest block`}>
      <p>These bids named this block as their parent, so they competed to be included in the <strong>next</strong> block{height ? ` (${blockNumber(Number(height) + 1)})` : ""}. A bid seen here was not necessarily paid. <Link className="text-link" href="/learn/merged-mining">How bids work</Link></p>
      <ul className="plain-list">{bids.map(b => <li key={b.id}>{sidechainLabel(b.slot, names)}: {formatSats(object(b.data).bid_sats, unit)} {proof(b) && <Link className="text-link" href={proof(b)!}>proof</Link>}</li>)}</ul>
    </GoDeeper>}
  </main>;
}
