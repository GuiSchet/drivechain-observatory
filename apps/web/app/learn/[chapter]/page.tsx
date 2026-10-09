import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { chapters } from "@/content/chapters";
import { Lesson } from "@/components/chapters";

export function generateStaticParams() {
  return chapters.map(c => ({ chapter: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }): Promise<Metadata> {
  const { chapter: slug } = await params;
  const chapter = chapters.find(c => c.slug === slug);
  return chapter ? { title: `${chapter.title} · Learn Drivechain`, description: chapter.tagline } : {};
}

export default async function Page({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  if (!chapters.some(c => c.slug === chapter)) notFound();
  return <Lesson slug={chapter}/>;
}
