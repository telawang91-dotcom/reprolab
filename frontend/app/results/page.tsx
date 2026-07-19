import { ResultsHub, type ResultsTab } from "@/components/results/ResultsHub";

const validTabs = new Set<ResultsTab>(["artifacts", "writing"]);

export default function ResultsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const requested = searchParams.tab as ResultsTab | undefined;
  return <ResultsHub initialTab={requested && validTabs.has(requested) ? requested : "artifacts"} />;
}
