"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBlocks, getJson } from "@/lib/api";
import { blockNumber, describeActivity, timeAgo } from "@/lib/explain";
import { activeSidechains, useObservatory, useSidechainNames } from "@/lib/live";
import { useUnit } from "@/lib/unit";
import type { ProtocolPage } from "@/lib/types";
import { ConfidenceChip } from "@/components/learn/primitives";

export function SearchResults({ q }: { q: string }) {
  const names = useSidechainNames(), unit = useUnit();
  const sidechains = activeSidechains(useObservatory().data);
  const height = /^\d{1,9}$/.test(q) ? q : undefined;
  const matches = sidechains.filter(s => q && s.title?.toLowerCase().includes(q.toLowerCase()));
  const block = useQuery({ queryKey: ["blocks", "search", height], queryFn: () => getBlocks(`height=${height}&limit=1`), enabled: !!height });
  const results = useQuery({ queryKey: ["protocol", "search", q], queryFn: () => getJson<ProtocolPage>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=50`), enabled: !!q });
  const dataset = results.data?.context.meta.dataset_id ?? block.data?.meta.dataset_id;
  const found = block.data?.blocks.find(b => String(b.height) === height);
  const items = results.data?.items ?? [];
  return <main className="page-shell"><div className="eyebrow">SEARCH</div><h1>{q ? <>Results for “{q}”</> : "Search"}</h1>
    <form action="/search" className="page-search" role="search"><input name="q" defaultValue={q} aria-label="Search" placeholder="Block height or hash, transaction id, withdrawal id, or sidechain name" required/><button type="submit">Search</button></form>
    {!q && <p className="lede">Search for a block height or hash, a transaction id, a withdrawal (M6) id, or a sidechain's name.</p>}
    {matches.map(s => <Link key={s.slot} className="search-hit" href={`/sidechains/${s.slot}`}><strong>{s.title}</strong><span>Sidechain in slot #{s.slot} · {s.description}</span></Link>)}
    {found && dataset && <Link className="search-hit" href={`/datasets/${dataset}/blocks/${found.hash}`}><strong>Block {found.height.toLocaleString("en-US")}</strong><span className="hash">{found.hash}</span></Link>}
    {q && results.isPending && <p className="live-empty" role="status">Searching…</p>}
    {results.isError && <p className="live-empty" role="status">Search is unavailable right now. Try again in a moment.</p>}
    {q && results.isSuccess && !items.length && !matches.length && !found && <p className="live-empty">Nothing matches “{q}” in the recorded data. Names must match the sidechain's declared title; hashes must be complete.</p>}
    {!!items.length && <ol className="activity-feed">{items.map(item => <li key={item.id}><div className="activity-body">
      <p>{describeActivity(item, names, unit)}</p>
      <div className="activity-meta"><span>{item.height != null ? blockNumber(item.height) : "current state"} · {timeAgo(item.block_time ?? item.observed_at)}</span><ConfidenceChip quality={item.quality}/>
        {item.evidence[0] && dataset && <Link href={`/datasets/${dataset}/events/${item.evidence[0].event_id}`}>Proof</Link>}
        {item.slot != null && <Link href={`/sidechains/${item.slot}`}>Sidechain page</Link>}</div>
    </div></li>)}</ol>}
  </main>;
}
