import { notFound } from "next/navigation";

import { AtroposGraphRoot } from "../../../components/atropos-graph-root";
import {
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../../../lib/moirai-graph-source-query";
import {
  getAtroposScreen,
  type AtroposScreenId
} from "../../../lib/atropos-screen-registry";

const RELOADABLE_SCREENS = new Set<AtroposScreenId>([
  "private",
  "explore",
  "settings"
]);

export default async function GraphScreenPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ screen: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { screen } = await params;
  const queryParams = await searchParams;
  if (!RELOADABLE_SCREENS.has(screen as AtroposScreenId)) notFound();

  const definition = getAtroposScreen(screen as AtroposScreenId);
  if (definition.availability === "auth_gated_future") notFound();

  const raw = typeof queryParams.mq === "string" ? queryParams.mq : null;
  const initialGraphQuery = raw
    ? (parseGraphUrlState(`?mq=${encodeURIComponent(raw)}`) ??
      createDefaultGraphUrlState())
    : createDefaultGraphUrlState();

  return (
    <AtroposGraphRoot
      initialGraphQuery={initialGraphQuery}
      initialScreen={definition.id}
    />
  );
}
