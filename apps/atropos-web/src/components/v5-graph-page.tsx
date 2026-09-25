import { notFound } from "next/navigation";
import { readV5ServedRoot, readV5StagedDocument } from "@moirai/publication/v5";
import { readPublicationObject, assertPublicId } from "../lib/publication";
import { createV5StagedAtroposReader } from "../lib/v5-staged-reader";
import { V5AtroposRoot } from "./v5-atropos-root";
import { v5ShellReader } from "../lib/v5-shell-reader";
import type { AtroposScreenId } from "../lib/atropos-screen-registry";

export default async function V5GraphPage({
  searchParams,
  screen = "graph"
}: Readonly<{
  screen?: AtroposScreenId;
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
    const eventId = params.event;
    const collectionId = params.collection;
    if (collectionId !== undefined) {
      if (typeof collectionId !== "string") notFound();
      assertPublicId(collectionId);
    }
    if (eventId !== undefined) {
      if (typeof eventId !== "string") notFound();
      assertPublicId(eventId);
    }
    const spatial = timeSystemId
      ? await reader.spatialSummary(timeSystemId)
      : null;
    if (!timeSystemId) notFound();
    const system = {
      time_system_id: timeSystemId,
      definition_version: "1",
      adapter_identity: "yyyy-iso-fields-fraction12-z-v1",
      comparison_domain: "yyyy-iso-fields-fraction12-z-v1"
    };
    const label = { ko: summary.world.title, en: summary.world.title };
    const timeLabel = systems.time_systems[0]!.title;
    const shell = await v5ShellReader(worldId);
    const initial = spatial?.bounds
      ? await shell.reader.viewport(timeSystemId, spatial.bounds, 1, null)
      : null;
    const first = initial?.shapes[0];
    const center =
      first?.kind === "point"
        ? first.position
        : first?.kind === "segment"
          ? first.start
          : first?.kind === "region"
            ? {
                x: (first.bounds.minX + first.bounds.maxX) / 2,
                y: (first.bounds.minY + first.bounds.maxY) / 2
              }
            : null;
    return (
      <V5AtroposRoot
        worldId={worldId}
        revision={pointer.served_revision}
        timeSystemId={timeSystemId}
        collectionIds={
          typeof params.collections === "string"
            ? params.collections
                .split(",")
                .filter((id) =>
                  catalog.collections.some((collection) => collection.id === id)
                )
            : catalog.collections.map((collection) => collection.id)
        }
        screen={screen}
        center={center}
        {...(collectionId
          ? { eventId: `collection:${collectionId}` }
          : eventId
            ? { eventId }
            : {})}
        catalog={{
          frames: [
            {
              id: timeSystemId,
              label: { ko: timeLabel, en: timeLabel },
              description: { ko: "", en: "" },
              target: system
            }
          ],
          worlds: [
            {
              id: worldId,
              label,
              description: { ko: "", en: "" },
              servedRevision: pointer.served_revision,
              timeSystem: system,
              timeSystems: [system],
              canons: catalog.collections.map((item) => ({
                id: item.id,
                label: { ko: item.title, en: item.title }
              }))
            }
          ]
        }}
        workspace={{
          menuItems: [
            { id: "publication", label: "Moirai Publication", active: true }
          ],
          tabs: [
            {
              id: timeSystemId,
              label: timeLabel,
              description: summary.world.title,
              availableCanonIds: [worldId],
              defaultEnabledCanonIds: [worldId],
              timeSystemId,
              compatibilityKey: timeSystemId
            }
          ],
          defaultTabId: timeSystemId,
          buildRevision: `v5:${worldId}:${pointer.served_revision}`,
          canons: [
            {
              id: worldId,
              label: summary.world.title,
              worldId,
              worldLabel: summary.world.title,
              timeSystemId,
              timeSystemLabel: timeLabel,
              compatibilityKey: timeSystemId
            }
          ],
          navigationScopes: [
            {
              canonId: worldId,
              planeId: worldId,
              widthHint: 1800,
              bounds: spatial?.bounds ?? null,
              ready: true
            }
          ],
          chronologyBoard: {
            mode: "gregorian",
            axis: {
              scheme: "gregorian_utc",
              coordinateScale: "elapsed-gregorian",
              timeSystemId,
              compatibilityKey: timeSystemId,
              startYear: 0,
              endYear: 0,
              tickYears: []
            },
            columns: [],
            placements: [],
            unplaced: []
          }
        }}
      />
    );
  } catch {
    // A v4 pointer, incomplete root, or missing object does not expose a
    // half-migrated explorer. The active /graph page continues serving v4.
    notFound();
  }
}
