"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { formatCoins, formatSats } from "@/lib/explain";
import { n } from "@/lib/live";
import type { Summary } from "@/lib/types";
import { useUnit } from "@/lib/unit";
import { LivePanel, Stat } from "@/components/learn/primitives";

type SummaryView = Summary & { updating: boolean };
/** While the API catches up with a new block it counts nothing; that is not zero, so the last count stays. */
function useDaySummary(hours: number) {
  const client = useQueryClient(), summaryKey = ["protocol", "summary", `hours=${hours}`];
  return useQuery({ queryKey: summaryKey, refetchInterval: 60_000, queryFn: async (): Promise<SummaryView> => {
    const fresh = await getJson<Summary>(`/api/v1/summary?hours=${hours}`);
    if (fresh.window) return { ...fresh, updating: false };
    const previous = client.getQueryData<SummaryView>(summaryKey);
    return previous?.window ? { ...previous, updating: true } : { ...fresh, updating: false };
  } });
}

/**
 * What L1 blocks of a recent period recorded. The API counts every figure over the same block heights, from the
 * first block whose own timestamp is inside the period up to the newest one. Readings of state are not events and are
 * left out.
 */
export function DaySummary({ hours = 24 }: { hours?: 24 | 168 }) {
  const unit = useUnit(), summary = useDaySummary(hours), w = summary.data?.window;
  const period = hours === 24 ? "24 hours" : "7 days";
  const at = (count: number) => w?.truncated ? `at least ${n(count)}` : n(count);
  const missing = w ? w.blocks - w.blocks_on_branch : 0, unobserved = w ? w.blocks - w.bmm_observed_blocks : 0;
  return <LivePanel title={w && w.blocks ? `The last ${period} on Betanet (blocks ${n(w.from_height)}–${n(w.to_height)})` : `The last ${period} on Betanet`}
    status={{ pending: summary.isPending, error: summary.isError && !summary.data, updating: summary.data?.updating,
      empty: !w || !w.blocks, emptyText: !w ? "Updating to the newest block; the counts appear once it is processed." : `No block on the selected chain has a timestamp in the last ${period}.` }}
    footer={w && w.blocks ? <>Every figure counts the same {n(w.blocks)} blocks, {n(w.from_height)}–{n(w.to_height)}: from the first block whose own timestamp falls in the last {period} to the newest. Timestamps are set by miners, so the period is approximate.{missing > 0 ? ` ${n(missing)} of these blocks are missing from our copy of the chain, so counts may be low.` : ""} Readings of state are not counted. <Link href="/live">See them in Live →</Link></> : undefined}>
    {w && <div className="stat-grid">
      <Stat label="Deposits" value={at(w.deposits)} hint={w.deposits ? <>{formatCoins(w.deposited_sats, true)} in total · {formatSats(w.deposited_sats, unit)}</> : "none in these blocks"}
        quality={w.deposits ? w.deposit_quality ?? null : undefined}/>
      <Stat label="Withdrawals paid out" value={at(w.payouts_succeeded)} hint={w.payouts_failed ? `${n(w.payouts_failed)} failed` : <Link href="/learn/withdrawals">how they are paid →</Link>}
        quality={w.payouts_succeeded || w.payouts_failed ? "observed" : undefined}/>
      <Stat label="Blocks with a BMM commitment" value={w.bmm_observed_blocks ? `${n(w.bmm_committed_blocks)} of ${n(w.bmm_observed_blocks)}` : "unknown"}
        hint={unobserved > 0 ? `blocks that committed to at least one sidechain block hash; ${n(unobserved)} blocks without merged-mining data are left out` : "blocks that committed to at least one sidechain block hash"}
        quality={w.bmm_observed_blocks ? "observed" : undefined}/>
    </div>}
  </LivePanel>;
}
