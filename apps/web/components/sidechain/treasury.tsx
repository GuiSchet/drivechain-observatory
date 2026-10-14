"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { apiQuery, at, object } from "@/lib/protocol";
import { depositAddress, formatCoins, formatSats } from "@/lib/explain";
import { n, proofHref } from "@/lib/live";
import { utc } from "@/lib/stats";
import type { ProtocolPage, SidechainStats } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { CopyHash, GoDeeper, LivePanel, Method, Stat } from "@/components/learn/primitives";
import { ActivityFeed } from "@/components/live/activity";
import { BlockChart } from "@/components/live/block-chart";
import { TreasuryHistory } from "@/components/live/money";

const coins = (y: number) => formatCoins(BigInt(Math.round(y * 1e8)).toString(), true);

/** The treasury balance after each change recorded in a block, from deposits and paid withdrawals. */
function BalanceChart({ stats }: { stats: SidechainStats }) {
  const unit = useUnit();
  const steps = stats.treasury.steps.filter(s => s.height != null);
  const points = steps.map(s => ({
    x: s.height!, y: s.value_after_sats != null ? Number(s.value_after_sats) / 1e8 : null,
    label: <>Block {n(s.height)}: {s.change === "deposit" ? <>deposit of {formatSats(s.delta_sats, unit)}</> : "withdrawal paid"}{s.sequence != null ? ` · output #${s.sequence}` : ""} → <strong>{s.value_after_sats != null ? formatSats(s.value_after_sats, unit) : "balance unknown"}</strong></>,
  }));
  if (!points.some(p => p.y != null)) return null;
  // The balance holds until the newest block.
  const anchor = stats.context.anchor_height;
  if (anchor != null && !points.some(p => p.x >= anchor)) points.push({ x: anchor, y: null, label: <>Block {n(anchor)}: the newest block; no change since</> });
  return <BlockChart mode="step" label="Treasury balance after each deposit and withdrawal" points={points} yFormat={coins}
    note={<>Each step is a deposit or a paid withdrawal recorded in an L1 block. The balance after it comes from a treasury reading of that output, or adds the deposit to the previous known balance; a withdrawal&apos;s balance is shown only when its output was read.</>}/>;
}

/** Every deposit as a table: the exact values a technical reader wants to copy. */
function DepositTable({ slot, stats }: { slot: number; stats?: SidechainStats }) {
  const unit = useUnit();
  const [sort, setSort] = useState<"height" | "amount">("height");
  const key = apiQuery({ slot, order: "block", limit: 200 });
  const result = useInfiniteQuery({
    queryKey: ["protocol", "deposits", "table", key], initialPageParam: "",
    queryFn: ({ pageParam }) => getJson<ProtocolPage>(`/api/v1/deposits?${key}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.next_cursor ?? undefined,
  });
  const items = useMemo(() => result.data?.pages.flatMap(p => p.items) ?? [], [result.data]);
  const dataset = result.data?.pages[0]?.context.meta.dataset_id;
  const after = new Map((stats?.treasury.steps ?? []).filter(s => s.change === "deposit").map(s => [s.sequence, s.value_after_sats]));
  const rows = [...items].sort((a, b) => sort === "amount"
    ? (BigInt(String(object(b.data).value_sats ?? 0)) > BigInt(String(object(a.data).value_sats ?? 0)) ? 1 : -1)
    : (b.height ?? 0) - (a.height ?? 0));
  if (result.isPending) return <p className="live-empty" role="status">Loading deposits…</p>;
  if (result.isError && !items.length) return <p className="live-empty" role="status">Deposits are unavailable right now; retrying automatically.</p>;
  if (!items.length) return <p className="live-empty">No deposit has been recorded for this sidechain.</p>;
  const header = (label: string, by: "height" | "amount") => <button type="button" className="th-sort" aria-pressed={sort === by} onClick={() => setSort(by)}>{label}{sort === by ? " ↓" : ""}</button>;
  return <>
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>{header("Block", "height")}</th><th>Block time</th><th>Transaction</th><th className="num">{header("Amount", "amount")}</th><th className="num">Output</th><th className="num">Treasury after</th><th>Sidechain address</th><th/></tr></thead>
      <tbody>{rows.map(i => {
        const d = object(i.data), txid = at(i.data, "outpoint", "txid"), vout = at(i.data, "outpoint", "vout"), seq = d.sequence_number;
        const address = depositAddress(d.address), proof = proofHref(i, dataset);
        return <tr key={i.id}>
          <td>{dataset && i.hash ? <Link href={`/datasets/${dataset}/blocks/${i.hash}`}>{n(i.height)}</Link> : n(i.height)}</td>
          <td className="nowrap">{utc(i.block_time)}</td>
          <td><CopyHash value={typeof txid === "string" ? txid : undefined}/>{vout != null ? <span className="muted">:{String(vout)}</span> : null}</td>
          <td className="num">{formatSats(d.value_sats, unit)}</td>
          <td className="num">{seq != null ? `#${String(seq)}` : "—"}</td>
          <td className="num">{after.get(seq != null ? String(seq) : null) ? formatSats(after.get(String(seq)), unit) : "—"}</td>
          <td>{address ? <CopyHash value={address}/> : <CopyHash value={typeof d.address === "string" ? d.address : undefined}/>}</td>
          <td>{proof && <Link className="proof-link" href={proof}>evidence</Link>}</td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="live-note">{n(items.length)} deposits loaded{sort === "amount" ? ", sorted by amount" : ", newest block first"}. Addresses are shown as text when their bytes are printable.</p>
    {result.hasNextPage && <div className="pagination"><button disabled={result.isFetchingNextPage} onClick={() => { void result.fetchNextPage(); }}>{result.isFetchingNextPage ? "Loading…" : "Load more deposits"}</button></div>}
  </>;
}

export function TreasurySection({ slot, name, stats, failed = false, technical }: { slot: number; name: string; stats?: SidechainStats; failed?: boolean; technical: boolean }) {
  const unit = useUnit(), d = stats?.deposits;
  return <>
    <LivePanel title={`${name}'s treasury, block by block`} status={{ pending: !stats, error: failed, empty: !!stats && !stats.treasury.steps.length, emptyText: "Nothing has been deposited into this sidechain yet." }}>
      {d && <div className="stat-grid">
        <Stat label="Deposits" value={n(d.count)} hint={d.last_30d ? `${n(d.last_30d)} in the last 30 days, ${n(d.last_7d)} in the last 7` : "none in the last 30 days"}/>
        <Stat label="Deposited in total" value={formatCoins(d.total_sats, !technical)} hint={formatSats(d.total_sats, unit)}/>
        <Stat label="Typical deposit" value={d.median_sats ? formatCoins(d.median_sats, !technical) : "—"} hint={d.median_sats ? <>median · {formatSats(d.median_sats, unit)}</> : undefined}
          method={<Method source="Every deposit recorded in a block for this slot." how="The middle amount when all deposits are sorted." limits="A few large deposits do not move it, which is why it is shown next to the total."/>}/>
        <Stat label="Largest deposit" value={d.max_sats ? formatCoins(d.max_sats, !technical) : "—"} hint={d.max_sats ? formatSats(d.max_sats, unit) : undefined}/>
      </div>}
      {stats && <BalanceChart stats={stats}/>}
    </LivePanel>
    <LivePanel title={`Deposits into ${name}`}>
      {technical ? <DepositTable slot={slot} stats={stats}/> : <ActivityFeed kind="deposit" slot={slot} limit={12} paged withTreasury/>}
    </LivePanel>
    <GoDeeper summary="every treasury reading the monitor took">
      <TreasuryHistory fixedSlot={slot}/>
    </GoDeeper>
  </>;
}
