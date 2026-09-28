"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Blocks,
  CircleDot,
  Database,
  GitBranch,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";

import { LiveVisuals } from "./protocol-visuals";
import { BranchSummary } from "./branch-summary";
import { getOverview } from "@/lib/api";
import type { Overview } from "@/lib/types";

type Props = {
  initialOverview: Overview | null;
};

export function ObservatoryDashboard({ initialOverview }: Props) {
  const reducedMotion = useReducedMotion();
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: getOverview,
    initialData: initialOverview ?? undefined,
  });
  const dataUnavailable = !overview.data;

  return (
    <main className="app-shell">
      <div className="ambient-grid" aria-hidden="true" />
      <section className="hero">
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="eyebrow"><Activity size={14} /> BIP300 / BIP301 OBSERVATORY</div>
          <h1>See the protocol move.<br /><span>Verify every pulse.</span></h1>
          <p>
            Live observations, historical coverage, and evidence from the
            eCash Betanet monitor.
          </p>
        </motion.div>
        <form className="search-box" action="/explorer"><input type="hidden" name="resource" value="search"/><input name="q" aria-label="Search protocol evidence" placeholder="Search hash, height, slot or exact name" required/><button type="submit">Search</button></form>
      </section>

      {dataUnavailable ? (
        <section className="notice" role="status">
          <Database size={20} />
          <div>
            <strong>Observatory is waiting for its first synchronized dataset.</strong>
            <p>{overview.isError ? "The API is unavailable. Retrying automatically." : "Waiting for the first imported dataset."}</p>
          </div>
        </section>
      ) : (
        <>
          <section className="metrics" aria-label="Observed network summary">
            <MetricCard
              icon={<Blocks size={19} />}
              label="Latest observed block"
              value={overview.data.latest_observed_block?.height.toLocaleString() ?? "Unknown"}
              detail={shortHash(overview.data.latest_observed_block?.hash)}
              accent
            />
            <MetricCard
              icon={<CircleDot size={19} />}
              label="Active sidechains"
              value={overview.data.active_sidechains?.toString() ?? "Unknown"}
              detail="Current observed instances"
            />
            <MetricCard
              icon={<GitBranch size={19} />}
              label="Observed branch"
              value={overview.data.latest_observed_block?.branch_status ?? "Unknown"}
              detail="Evidence-based selection"
            />
            <MetricCard
              icon={<Database size={19} />}
              label="Evidence imported"
              value={compactInteger(overview.data.source_events_imported)}
              detail={compactInteger(overview.data.source_observations_imported) + " occurrences"}
            />
          </section>

          <BranchSummary branch={overview.data.branch} dataset={overview.data.meta.dataset_id}/>
          <LiveVisuals/>

        </>
      )}

      <footer>
        <span>Dataset {overview.data?.meta.dataset_id ?? "not available"}</span>
        <span>Projection v{overview.data?.meta.projection_version ?? "—"}</span>
        <span>Evidence-backed observations, not a consensus oracle.</span>
      </footer>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article className={"metric-card " + (accent ? "accent" : "")}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function shortHash(value: string | null | undefined): string {
  if (!value) return "No observation";
  if (value.length <= 18) return value;
  return value.slice(0, 10) + "…" + value.slice(-8);
}

function compactInteger(value: string): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(BigInt(value));
}
