"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { ChapterMeta } from "@/content/chapters";
import { references } from "@/content/references";

// Each assistant opens with the question already typed; nothing goes through our servers.
const assistants: [string, (q: string) => string][] = [
  ["ChatGPT", q => `https://chatgpt.com/?prompt=${encodeURIComponent(q)}`],
  ["Claude", q => `https://claude.ai/new?q=${encodeURIComponent(q)}`],
  ["Perplexity", q => `https://www.perplexity.ai/search/new?q=${encodeURIComponent(q)}`],
];

export function askAiPrompt(chapter: ChapterMeta, lessonUrl: string): string {
  const sources = chapter.refs.map(id => references[id].href);
  return [
    "I'm learning about drivechains (BIP300 and BIP301) on the Drivechain Observatory, which shows them live on eCash Betanet (eCash ECX, not eCash XEC).",
    `Explain "${chapter.title}" (${chapter.tagline}) in simple terms with a concrete example.`,
    sources.length ? `Base your answer on these sources and say which part of each supports it: ${sources.join(" ")}` : "Use Bitcoin's own documentation as the source and explain why it matters for BIP300 and BIP301.",
    `Lesson: ${lessonUrl}`,
  ].join(" ");
}

export function AskAi({ chapter }: { chapter: ChapterMeta }) {
  // The site's own address is only known in the browser; links fill it in after loading.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const prompt = askAiPrompt(chapter, `${origin}/learn/${chapter.slug}`);
  return <details className="ask-ai">
    <summary>Ask an AI assistant about this concept</summary>
    <p>Opens your assistant with a question about this concept and its sources already written. AI answers can be wrong{chapter.refs.length ? ": check them against the sources above" : ""}. Your question goes to the assistant you choose, not to us.</p>
    <div className="ask-ai-buttons">{assistants.map(([name, url]) =>
      <a key={name} href={url(prompt)} target="_blank" rel="noopener noreferrer">Ask {name} <ExternalLink size={13}/></a>)}</div>
  </details>;
}
