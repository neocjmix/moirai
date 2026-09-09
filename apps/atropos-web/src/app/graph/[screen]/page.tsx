import { notFound } from "next/navigation";

import { AtroposGraphRoot } from "../../../components/atropos-graph-root";
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
  params
}: Readonly<{ params: Promise<{ screen: string }> }>) {
  const { screen } = await params;
  if (!RELOADABLE_SCREENS.has(screen as AtroposScreenId)) notFound();

  const definition = getAtroposScreen(screen as AtroposScreenId);
  if (definition.availability === "auth_gated_future") notFound();

  return <AtroposGraphRoot initialScreen={definition.id} />;
}
