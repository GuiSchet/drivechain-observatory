import Link from "next/link";
import { glossary } from "@/content/glossary";
import { chapters } from "@/content/chapters";
import { RefLinks } from "@/components/learn/primitives";
export const metadata = { title: "Glossary · Drivechain Observatory", description: "Every drivechain term used on this site, in plain words." };
export default function Page() {
  const entries = Object.entries(glossary).sort(([, a], [, b]) => a.term.localeCompare(b.term));
  return <main className="page-shell"><div className="eyebrow">GLOSSARY</div><h1>Every term, in plain words</h1>
    <p className="lede">Short definitions of the words used in the lessons. Each one links to the concept where it is explained with live data.</p>
    <div className="glossary-list">{entries.map(([id, e]) => {
      const chapter = chapters.find(c => c.slug === e.chapter);
      return <section key={id} id={id} className="glossary-entry"><h2>{e.term}</h2><p>{e.short}</p>
        {"refs" in e && e.refs && <RefLinks refs={e.refs}/>}
        {chapter && <Link className="chapter-link" href={`/learn/${chapter.slug}`}>Learn it in “{chapter.title}” →</Link>}</section>;
    })}</div>
  </main>;
}
