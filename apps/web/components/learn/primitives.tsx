"use client";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { BookOpen, Check, CheckCircle2, Copy, ExternalLink, FlaskConical, Info, Lightbulb, Radio, XCircle } from "lucide-react";
import { glossary, type TermId } from "@/content/glossary";
import { references, type RefId } from "@/content/references";
import { confidenceOf, confidenceText } from "@/lib/explain";

/** An inline glossary term: hover or focus shows the definition. */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const tip = useId();
  const entry = glossary[id];
  return <span className="term"><Link href={`/glossary#${id}`} aria-describedby={tip}>{children ?? entry.term}</Link><span role="tooltip" id={tip} className="term-tip"><strong>{entry.term}</strong>{entry.short}</span></span>;
}

export function RefLinks({ refs }: { refs: RefId[] }) {
  if (!refs.length) return null;
  return <ul className="ref-links">{refs.map(id => <li key={id}><a href={references[id].href} target="_blank" rel="noopener noreferrer">{references[id].title}<ExternalLink size={12} aria-hidden="true"/></a></li>)}</ul>;
}

/** Theory from a specification, or a place where Betanet differs from it. */
export function SpecNote({ variant = "spec", refs, children }: { variant?: "spec" | "betanet"; refs: RefId[]; children: ReactNode }) {
  return <aside className={`spec-note spec-${variant}`}>
    <div className="spec-label">{variant === "spec" ? <><BookOpen size={15}/> The spec says</> : <><FlaskConical size={15}/> On Betanet</>}</div>
    <div className="spec-body">{children}</div>
    <RefLinks refs={refs}/>
  </aside>;
}

export function Analogy({ children }: { children: ReactNode }) {
  return <p className="analogy"><Lightbulb size={16} aria-hidden="true"/><span>{children}</span></p>;
}

export function GoDeeper({ summary, children }: { summary: string; children: ReactNode }) {
  return <details className="go-deeper"><summary>Go deeper: {summary}</summary><div>{children}</div></details>;
}

export function ConfidenceChip({ quality }: { quality: string | null | undefined }) {
  const c = confidenceOf(quality), tip = useId();
  return <span className={`confidence confidence-${c}`} tabIndex={0} aria-describedby={tip}>{confidenceText[c].label}<span role="tooltip" id={tip} className="term-tip">{confidenceText[c].detail}</span></span>;
}

/** The frame around every piece of live data in a lesson. */
/** A panel of live data. `controls` (e.g. a window picker) sit in its header, so panels side by side start level. */
export function LivePanel({ title, quality, proof, status, children, footer, controls }: { title: string; quality?: string | null; proof?: string; status?: { pending: boolean; error: boolean; updating?: boolean; empty?: boolean; emptyText?: ReactNode }; children?: ReactNode; footer?: ReactNode; controls?: ReactNode }) {
  return <section className="live-panel" aria-label={`Live on Betanet: ${title}`}>
    <header><span className="live-tag"><Radio size={13}/> Live on Betanet</span><h3>{title}</h3>
      <div className="live-meta">{controls}{quality !== undefined && <ConfidenceChip quality={quality}/>}{proof && <Link className="proof-link" href={proof}>See the evidence →</Link>}</div></header>
    {status?.error ? <p className="live-empty" role="status">The live data is unavailable right now. The lesson still applies; this panel will retry automatically.</p>
      : status?.pending ? <p className="live-empty" role="status">Loading live data…</p>
      : status?.empty ? <div className="live-empty">{status.emptyText ?? "Nothing to show right now."}</div>
      : <>{status?.updating && <p className="live-updating" role="status">Updating to the newest block. Showing the last complete reading until then.</p>}{children}</>}
    {footer && <footer>{footer}</footer>}
  </section>;
}

export type Choice = { text: string; correct?: boolean; why: string };
export function CheckYourself({ question, choices }: { question: string; choices: Choice[] }) {
  const [picked, setPicked] = useState<number>();
  const name = useId();
  return <fieldset className="check-yourself"><legend>Check yourself</legend><p>{question}</p>
    <div className="choices">{choices.map((c, i) => <label key={i} className={picked === i ? (c.correct ? "picked right" : "picked wrong") : ""}>
      <input type="radio" name={name} checked={picked === i} onChange={() => setPicked(i)}/>{c.text}</label>)}</div>
    {picked !== undefined && <p className={`check-answer ${choices[picked].correct ? "right" : "wrong"}`} role="status">
      {choices[picked].correct ? <CheckCircle2 size={16}/> : <XCircle size={16}/>}<span><strong>{choices[picked].correct ? "Right." : "Not quite."}</strong> {choices[picked].why}</span></p>}
  </fieldset>;
}

/** A labelled number with a short explanation underneath; `quality` and `proof` describe this value alone. */
export function Stat({ label, value, hint, quality, proof, method }: { label: string; value: ReactNode; hint?: ReactNode; quality?: string | null; proof?: string; method?: ReactNode }) {
  return <div className="stat"><span>{label}{method}</span><strong>{value}</strong>{hint && <small>{hint}</small>}
    {(quality !== undefined || proof) && <div className="stat-meta">{quality !== undefined && <ConfidenceChip quality={quality}/>}{proof && <Link className="proof-link" href={proof}>evidence</Link>}</div>}
  </div>;
}

/** A value shown as code with a copy button, e.g. an address or a username. */
export function CopyText({ value, label, className = "donate-address" }: { value: string; label: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return <div className={className}>
    <code>{value}</code>
    <button onClick={async () => { try { await navigator.clipboard.writeText(value); setState("copied"); } catch { setState("failed"); } }}>
      {state === "copied" ? <><Check size={15}/> Copied</> : <><Copy size={15}/> {label}</>}
    </button>
    {state === "failed" && <small role="status">Copy is unavailable here; select the text instead.</small>}
  </div>;
}

/** A hash or id in a dense table: shortened unless `full`, with a small copy button. */
export function CopyHash({ value, full = false, href }: { value: string | null | undefined; full?: boolean; href?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="muted">—</span>;
  const shown = full || value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;
  return <span className="copy-hash">
    {href ? <Link className="hash" href={href} title={value}>{shown}</Link> : <span className="hash" title={value}>{shown}</span>}
    <button type="button" aria-label={copied ? "Copied" : `Copy ${value}`} title={copied ? "Copied" : "Copy"}
      onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } }}>
      {copied ? <Check size={12}/> : <Copy size={12}/>}
    </button>
  </span>;
}

/** How a figure is obtained: its source, the calculation, and what it cannot tell. */
export function Method({ source, how, limits }: { source: ReactNode; how?: ReactNode; limits?: ReactNode }) {
  const tip = useId();
  return <span className="method" tabIndex={0} aria-describedby={tip} aria-label="How this is measured">
    <Info size={13} aria-hidden="true"/>
    <span role="tooltip" id={tip} className="term-tip">
      <strong>How this is measured</strong>
      <span className="method-row"><em>Source</em> {source}</span>
      {how && <span className="method-row"><em>Calculation</em> {how}</span>}
      {limits && <span className="method-row"><em>Limits</em> {limits}</span>}
    </span>
  </span>;
}
