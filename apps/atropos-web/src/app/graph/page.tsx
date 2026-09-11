import { AtroposGraphRoot } from "../../components/atropos-graph-root";
import { GraphQueryFallback } from "../../components/graph-query-fallback";
import {
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../../lib/moirai-graph-source-query";

export default async function GraphPage({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const raw = typeof params.mq === "string" ? params.mq : null;
  const initialGraphQuery = raw
    ? (parseGraphUrlState(`?mq=${encodeURIComponent(raw)}`) ??
      createDefaultGraphUrlState())
    : createDefaultGraphUrlState();

  return (
    <>
      <GraphQueryFallback state={initialGraphQuery} />
      <AtroposGraphRoot
        initialGraphQuery={initialGraphQuery}
        initialScreen="graph"
      />
    </>
  );
}
