"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Clock } from "lucide-react";
import { chapters, chapterIndex } from "@/content/chapters";
import { ISSUES_URL } from "@/content/references";
import { useProgress } from "@/lib/progress";
import { RefLinks } from "./primitives";
import { AskAi } from "./ask-ai";

export function ChapterStepper({ current }: { current?: string }) {
  const { isDone } = useProgress();
  return <ol className="stepper" aria-label="Learning path">{chapters.map((c, i) =>
    <li key={c.slug} className={[c.slug === current ? "current" : "", isDone(c.slug) ? "done" : ""].join(" ")}>
      <Link href={`/learn/${c.slug}`} aria-current={c.slug === current ? "step" : undefined} title={c.title}>
        <span className="step-dot">{isDone(c.slug) ? <Check size={12}/> : i + 1}</span><span className="step-title">{c.title}</span></Link></li>)}
  </ol>;
}

export function ChapterLayout({ slug, children }: { slug: string; children: ReactNode }) {
  const index = chapterIndex(slug), chapter = chapters[index];
  const prev = chapters[index - 1], next = chapters[index + 1];
  const { isDone, setDone } = useProgress();
  const done = isDone(slug);
  const issue = `${ISSUES_URL}?title=${encodeURIComponent(`Lesson "${chapter.title}": `)}`;
  return <main className="lesson-shell">
    <ChapterStepper current={slug}/>
    <article className="lesson">
      <header className="lesson-header">
        <div className="eyebrow">Concept {index + 1} of {chapters.length}</div>
        <h1>{chapter.title}</h1>
        <p className="lesson-tagline">{chapter.tagline}</p>
        <span className="lesson-time"><Clock size={14}/> {chapter.minutes} min read</span>
      </header>
      {children}
      <AskAi chapter={chapter}/>
      {!!chapter.refs.length && <section className="lesson-refs"><h2>Read the source</h2><p>The rules in this lesson come from these documents and code:</p><RefLinks refs={chapter.refs}/></section>}
      <footer className="lesson-footer">
        <button className={done ? "done-button done" : "done-button"} onClick={() => setDone(slug, !done)} aria-pressed={done}><Check size={16}/>{done ? "Marked as understood" : "I understand this concept"}</button>
        <nav className="lesson-nav" aria-label="Lesson navigation">
          {prev ? <Link href={`/learn/${prev.slug}`}><ArrowLeft size={16}/><span><small>Previous</small>{prev.title}</span></Link> : <Link href="/"><ArrowLeft size={16}/><span><small>Back to</small>Start</span></Link>}
          {next ? <Link className="next" href={`/learn/${next.slug}`} onClick={() => setDone(slug, true)}><span><small>Next concept</small>{next.title}</span><ArrowRight size={16}/></Link> : <Link className="next" href="/sidechains" onClick={() => setDone(slug, true)}><span><small>You finished the path</small>Explore the sidechains</span><ArrowRight size={16}/></Link>}
        </nav>
        <p className="report-mistake">Spotted a mistake? <a href={issue} target="_blank" rel="noopener noreferrer">Tell us on GitHub</a>.</p>
      </footer>
    </article>
  </main>;
}

/** A short block of lesson prose with an optional heading. */
export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="lesson-section">{title && <h2>{title}</h2>}{children}</section>;
}
