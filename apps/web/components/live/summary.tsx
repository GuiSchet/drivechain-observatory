"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBlocks, getJson } from "@/lib/api";
import { apiQuery } from "@/lib/protocol";
import { formatCoins, formatSats, outcomeOf, sats } from "@/lib/explain";
import { n, weakestQuality } from "@/lib/live";
import type { BmmMetrics, ProtocolItem, ProtocolPage } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { LivePanel, Stat } from "@/components/learn/primitives";

const DAY = 24 * 3_600_000;

/** Every block-anchored fact of these kinds with a block time inside the window, following cursors. */
async function factsSince(kind: string, from: string): Promise<{ items: ProtocolItem[]; complete: boolean }> {
  const items: ProtocolItem[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const query = apiQuery({ kind, time_basis: "block", from_time: from, order: "block", limit: 200, cursor });
    const result = await getJson<ProtocolPage>(`/api/v1/activity?${query}`);
    items.push(...result.items);
    cursor = result.next_cursor ?? undefined;
    if (!cursor) return { items, complete: true };
  }
  return { items, complete: false };
}

/**
 * What the monitor observed in L1 blocks of the last 24 hours, by block time. Only facts recorded
 * for a block count here; readings of state are not events and are left out. The footer states which
 * blocks the window covers and whether our node has all of them.
 */
export function DaySummary() {
  const unit = useUnit();
  // Rounded to the minute so the query key stays stable between renders.
  const from = useMemo(() => new Date(Math.floor((Date.now() - DAY) / 60_000) * 60_000).toISOString(), []);
  const deposits = useQuery({ queryKey: ["protocol", "summary", "deposits", from], queryFn: () => factsSince("deposit", from) });
  const outcomes = useQuery({ queryKey: ["protocol", "summary", "outcomes", from], queryFn: () => factsSince("bundle_outcome", from) });
  const blocks = useQuery({ queryKey: ["protocol", "summary", "blocks"], queryFn: () => getBlocks("limit=200") });
  const bmm = useQuery({ queryKey: ["protocol", "bmm", "metrics", "window_blocks=144"], queryFn: () => getJson<BmmMetrics>("/api/v1/bmm?window_blocks=144") });

  const inWindow = (blocks.data?.blocks ?? []).filter(b => b.block_time && b.block_time >= from);
  const low = inWindow.length ? Math.min(...inWindow.map(b => b.height)) : undefined, high = inWindow.length ? Math.max(...inWindow.map(b => b.height)) : undefined;
  const missing = low != null && high != null ? high - low + 1 - new Set(inWindow.map(b => b.height)).size : undefined;
  const dep = deposits.data?.items ?? [], out = outcomes.data?.items ?? [];
  const total = dep.reduce((sum, i) => sum + (sats((i.data as Record<string, unknown>).value_sats) ?? BigInt(0)), BigInt(0));
  const paid = out.filter(i => outcomeOf(i) === "Succeeded").length, failed = out.filter(i => outcomeOf(i) === "Failed").length;
  const committed = new Set<number>(), observedCells = new Set<number>();
  for (const row of bmm.data?.slots ?? []) for (const cell of row.cells) {
    if (low == null || cell.height < low) continue;
    if (cell.state !== "unknown_eligibility") observedCells.add(cell.height);
    if (cell.state === "present") committed.add(cell.height);
  }
  const partial = deposits.data?.complete === false || outcomes.data?.complete === false;
  const at = (s: number) => partial ? `at least ${n(s)}` : n(s);
  return <LivePanel title="The last 24 hours on Betanet"
    status={{ pending: deposits.isPending || outcomes.isPending || blocks.isPending, error: (deposits.isError || outcomes.isError) && !deposits.data }}
    footer={low != null && high != null
      ? <>Counted by block time over blocks {n(low)}–{n(high)} ({n(inWindow.length)} blocks{missing ? `, ${n(missing)} missing from our node` : ", all of them on our node"}). These are facts recorded for those blocks; readings of state are not counted. <Link href="/live">See them in Live →</Link></>
      : "No block in the last 24 hours has been imported yet."}>
    <div className="stat-grid">
      <Stat label="Deposits" value={at(dep.length)} hint={dep.length ? <>{formatCoins(total.toString(), true)} in total · {formatSats(total.toString(), unit)}</> : "none in these blocks"}
        quality={dep.length ? weakestQuality(dep) : undefined}/>
      <Stat label="Withdrawals paid out" value={at(paid)} hint={failed ? `${n(failed)} failed` : <Link href="/learn/withdrawals">how they are paid →</Link>}
        quality={out.length ? weakestQuality(out) : undefined}/>
      <Stat label="Blocks with a BMM commitment" value={observedCells.size ? `${n(committed.size)} of ${n(observedCells.size)}` : "unknown"}
        hint="blocks where L1 committed to at least one sidechain block hash" quality={observedCells.size ? "observed" : undefined}/>
    </div>
  </LivePanel>;
}
