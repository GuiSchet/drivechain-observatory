import { SearchResults } from "@/components/search-results";
export const metadata = { title: "Search · Drivechain Observatory" };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SearchResults q={(q ?? "").trim()}/>;
}
