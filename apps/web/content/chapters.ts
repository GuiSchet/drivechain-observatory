import type { RefId } from "./references";

export type ChapterMeta = { slug: string; title: string; tagline: string; minutes: number; refs: RefId[] };

// The learning path, in order. Each chapter introduces one idea and shows it live.
export const chapters: ChapterMeta[] = [
  { slug: "what-is-a-drivechain", title: "What is a drivechain?", tagline: "One main chain, many sidechains, and coins that move between them.", minutes: 4, refs: ["bip300Abstract", "bip301", "drivechainInfo"] },
  { slug: "blocks", title: "Blocks: the heartbeat", tagline: "Everything in a drivechain happens one L1 block at a time.", minutes: 3, refs: [] },
  { slug: "slots", title: "Slots and sidechains", tagline: "256 numbered places, each able to hold one sidechain.", minutes: 3, refs: ["bip300D1", "bip300M1"] },
  { slug: "creating-a-sidechain", title: "Creating a sidechain", tagline: "Someone proposes it; miners vote block by block.", minutes: 5, refs: ["bip300M1", "bip300M2", "spec300Constants", "enforcerBetanet"] },
  { slug: "deposits", title: "Deposits and the treasury", tagline: "Moving coins in: every sidechain keeps them in one output on L1.", minutes: 4, refs: ["bip300M5", "spec300Treasury", "bip300OpDrivechain"] },
  { slug: "withdrawals", title: "Withdrawals by miner vote", tagline: "Moving coins out is slow on purpose: a long, public miner vote.", minutes: 6, refs: ["bip300Bundles", "bip300D2", "bip300M3", "bip300M4", "bip300M6"] },
  { slug: "merged-mining", title: "Blind merged mining", tagline: "How sidechain blocks get made, and how L1 miners get paid for them.", minutes: 5, refs: ["bip301", "bip301Accept", "bip301Request", "spec301M7", "spec301M8"] },
  { slug: "how-we-know", title: "How we know", tagline: "Where every number on this site comes from, and how sure we are.", minutes: 4, refs: ["enforcer", "sourceContract"] },
];

export function chapterIndex(slug: string): number {
  return chapters.findIndex(c => c.slug === slug);
}
