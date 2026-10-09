"use client";
import type { ComponentType } from "react";
import { notFound } from "next/navigation";
import { ChapterLayout } from "@/components/learn/chapter-layout";
import { Blocks, Slots, WhatIsADrivechain } from "./basics";
import { CreatingASidechain, Deposits, MergedMining, Withdrawals } from "./money";
import { HowWeKnow } from "./trust";

const lessons: Record<string, ComponentType> = {
  "what-is-a-drivechain": WhatIsADrivechain,
  blocks: Blocks,
  slots: Slots,
  "creating-a-sidechain": CreatingASidechain,
  deposits: Deposits,
  withdrawals: Withdrawals,
  "merged-mining": MergedMining,
  "how-we-know": HowWeKnow,
};

export function Lesson({ slug }: { slug: string }) {
  const Body = lessons[slug];
  if (!Body) notFound();
  return <ChapterLayout slug={slug}><Body/></ChapterLayout>;
}
