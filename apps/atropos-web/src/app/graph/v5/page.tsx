import { notFound } from "next/navigation";
import { readV5ServedRoot, readV5StagedDocument } from "@moirai/publication/v5";
import {
  readPublicationObject,
  assertPublicId
} from "../../../lib/publication";
import { createV5StagedAtroposReader } from "../../../lib/v5-staged-reader";
import { V5Explorer } from "../../../components/v5-explorer";

export const dynamic = "force-dynamic";

export default async function V5GraphPage({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const worldId = params.world;
  if (typeof worldId !== "string") notFound();
  try {
    assertPublicId(worldId);
    const store = { get: readPublicationObject };
    const { pointer, rootBody } = await readV5ServedRoot(store, worldId);
    const reader = createV5StagedAtroposReader(
      store,
      rootBody,
      worldId,
      pointer.served_revision
    );
    const [catalog, systems, summaryBody] = await Promise.all([
      reader.collections(0),
      reader.timeSystems(0),
      readV5StagedDocument(
        rootBody,
        `worlds/${worldId}/revisions/${pointer.served_revision}/v5/content/world.json`,
        async (key) => (await store.get(key)).body
      )
    ]);
    if (!summaryBody) notFound();
    const summary = JSON.parse(summaryBody) as {
      world_id: string;
      revision: number;
      world: { title: string };
    };
    if (
      summary.world_id !== worldId ||
      summary.revision !== pointer.served_revision ||
      !summary.world?.title
    )
      notFound();
    const timeSystemId = systems.time_systems[0]?.id ?? null;
    const spatial = timeSystemId
      ? await reader.spatialSummary(timeSystemId)
      : null;
    return (
      <V5Explorer
        worldId={worldId}
        revision={pointer.served_revision}
        worldTitle={summary.world.title}
        initialCollections={catalog.collections}
        nextCollectionPage={catalog.next_page}
        initialTimeSystems={systems.time_systems}
        nextTimeSystemPage={systems.next_page}
        initialSpatial={spatial}
      />
    );
  } catch {
    // A v4 pointer, incomplete root, or missing object does not expose a
    // half-migrated explorer. The active /graph page continues serving v4.
    notFound();
  }
}
