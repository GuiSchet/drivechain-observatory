import Link from "next/link";
import { chapters } from "@/content/chapters";
import { ChapterStepper } from "@/components/learn/chapter-layout";
export const metadata = { title: "Learn Drivechain", description: "Eight short concepts, each shown live on eCash Betanet." };
export default function Page() {
  return <main className="page-shell"><div className="eyebrow">THE LEARNING PATH</div><h1>Learn Drivechain</h1>
    <p className="lede">Eight short concepts, one at a time. Each lesson explains an idea in plain words, links to the specification it comes from, and shows it live on eCash Betanet.</p>
    <ChapterStepper/>
    <p className="lede"><Link className="text-link" href={`/learn/${chapters[0].slug}`}>Start with “{chapters[0].title}” →</Link></p>
  </main>;
}
