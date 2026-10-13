"use client";
import { at, object } from "@/lib/protocol";
import { declarationOf } from "@/lib/explain";
import { readingTip } from "@/lib/activity";
import { n, useCoverageGaps, useNetworkParams, useObservatory, useProtocolPage, type ActiveSidechain } from "@/lib/live";
import { CopyHash, LivePanel, Term } from "@/components/learn/primitives";
import { ParamsPanel } from "@/components/live/money";
import { ReadingsChart } from "@/components/live/readings-chart";

export type Instance = { title?: string; proposal?: unknown; activation?: unknown; ended?: unknown; current?: boolean | null };

/** Miner approvals of this slot's proposals at each reading, when the monitor read them while voting was open. */
function AckHistory({ slot }: { slot: number }) {
  const page = useProtocolPage("activity", `kind=proposal&slot=${slot}&changes=true&order=block&limit=200`);
  const gaps = useCoverageGaps(), dataset = page.data?.context.meta.dataset_id;
  const points = (page.data?.items ?? []).flatMap(i => {
    const votes = at(i.data, "proposal", "vote_count"), tip = readingTip(i);
    return typeof votes === "number" && tip !== undefined ? [{ x: tip, y: votes, href: i.evidence[0] && dataset ? `/datasets/${dataset}/events/${i.evidence[0].event_id}` : undefined, label: <><strong>{n(votes)} approvals</strong> read at tip {n(tip)}</> }] : [];
  });
  if (points.length < 2) return <p className="live-note">The monitor has no series of approval readings for this slot: it was not reading while the vote was open, or the count did not change between readings.</p>;
  return <ReadingsChart label="Miner approvals at each reading of the proposal" points={points} gaps={gaps} yFormat={y => n(Math.round(y))}/>;
}

export function IdentitySection({ slot, sc, instances, replaced, technical }: { slot: number; sc?: ActiveSidechain; instances: Instance[]; replaced: boolean; technical: boolean }) {
  const observatory = useObservatory(), { params } = useNetworkParams();
  const active = object(object(object(observatory.data?.state).active)[String(slot)]);
  const decl = declarationOf(active), raw = typeof active.raw_description === "string" ? active.raw_description : undefined;
  const needed = replaced ? params.usedThreshold : params.unusedThreshold, maxAge = replaced ? params.usedMaxAge : params.unusedMaxAge;
  return <>
    {sc && <LivePanel title="Its declaration">
      <dl className="mini-facts">
        <dt>Title</dt><dd>{decl.title ?? "—"}</dd><dt>Description</dt><dd>{decl.description ?? "—"}</dd>
        <dt>Hash 1 (release archive)</dt><dd><CopyHash value={decl.hash1} full={technical}/></dd>
        <dt>Hash 2 (git commit)</dt><dd><CopyHash value={decl.hash2} full={technical}/></dd>
        <dt>Declaration hash</dt><dd><CopyHash value={sc.descriptionHash} full={technical}/></dd>
        {technical && <><dt>Raw declaration</dt><dd><CopyHash value={raw}/></dd></>}
        <dt>Proposed in</dt><dd>block {n(sc.proposalHeight)}</dd>
        <dt>Activated in</dt><dd>block {n(sc.activationHeight)}{sc.activationHeight != null && sc.proposalHeight != null ? `, ${n(sc.activationHeight - sc.proposalHeight)} blocks later` : ""}</dd>
        <dt>Miner approvals</dt><dd>{n(sc.voteCount)}; it needed more than {n(needed)} within {n(maxAge)} blocks ({replaced ? "replacing an earlier sidechain in this slot" : "an empty slot"})</dd>
      </dl>
      <p className="live-note">The declaration hash, together with the slot and heights, identifies this sidechain. The two other hashes are meant to identify its software, but L1 does not enforce them. <Term id="declaration">More about declarations</Term>.</p>
    </LivePanel>}
    {sc && technical && <LivePanel title="Approvals while it was being voted on"><AckHistory slot={slot}/></LivePanel>}
    {technical && <ParamsPanel show={["activation", "withdrawal"]}/>}
    <LivePanel title={`Sidechains that have used slot #${slot}`} status={{ pending: false, error: false, empty: !instances.length, emptyText: "No sidechain has been recorded in this slot." }}>
      <ul className="plain-list">{instances.map((h, i) => <li key={i}><strong>{h.title ?? "Unnamed"}</strong>: proposed in block {typeof h.proposal === "number" ? n(h.proposal) : "unknown"}, active from block {typeof h.activation === "number" ? n(h.activation) : "unknown"}{typeof h.ended === "number" ? `, last seen active at block ${n(h.ended)}` : h.current ? ", active now" : ""}.</li>)}</ul>
    </LivePanel>
  </>;
}
