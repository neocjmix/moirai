import { WorldUnavailable } from "./world-unavailable";
import { collectionDiscoveryConfig } from "../lib/collection-discovery-config";
import { notFound, redirect } from "next/navigation";
import { readV5StagedDocument } from "@moirai/publication/v5";
import { readV5RenderGeneration } from "@moirai/publication/v5";
import { assertPublicId } from "../lib/publication";
import { publicTimeSystemIdentity } from "@moirai/graph-query";
import type { PublicTimeSystem } from "@moirai/contracts";
import { V5AtroposRoot } from "./v5-atropos-root";
import { v5ShellReader } from "../lib/v5-shell-reader";
import type { AtroposScreenId } from "../lib/atropos-screen-registry";

export default async function V5GraphPage({
  searchParams,
  screen = "graph",
  fullEvent = false
}: Readonly<{
  screen?: AtroposScreenId;
  fullEvent?: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const worldId = params.world;
  const readPage =
    typeof params.readPage === "string" ? Number(params.readPage) : 0;
  if (!Number.isSafeInteger(readPage) || readPage < 0 || readPage > 1000000)
    notFound();
  if (worldId === undefined) redirect("/worlds");
  if (typeof worldId !== "string") notFound();
  try {
    assertPublicId(worldId);
  } catch {
    notFound();
  }
  try {
    const shell = await v5ShellReader(worldId);
    const { store, pointer, rootBody, reader } = shell;
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
    if (!timeSystemId)
      return (
        <main style={{ padding: "24px", maxWidth: 720, margin: "auto" }}>
          <a href="/worlds">월드 선택</a>
          <h1>{summary.world.title}</h1>
          <p>아직 시간축이 없는 월드입니다.</p>
          <a href={`/worlds/${worldId}/events`}>사건 목록 보기</a>
        </main>
      );
    // Use the preserved GraphShell painter with revision-pinned tiles when
    // the generation carries authored Composite metadata. Older generations
    // and absent sidecars stay on the semantic reader; tileData=0 is a
    // per-request rollback without changing the served publication.
    const renderAvailable =
      params.tileData !== "0" &&
      (await readV5RenderGeneration(store, worldId)
        .then(async (generation) => {
          if (generation.revision !== pointer.served_revision) return false;
          const manifest = generation.manifests.find(
            (item) => item.timeSystemId === timeSystemId
          );
          if (!manifest) return false;
          // v4 publishes a bounded summary on the generation root. Do not
          // download the global operational manifest to select the reader.
          const version =
            manifest.summary?.algorithmVersion ??
            (
              JSON.parse(
                await generation.read(manifest.key, manifest.sha256)
              ) as { algorithmVersion?: string }
            ).algorithmVersion;
          return (
            version === "render-compiler/3" || version === "render-compiler/4"
          );
        })
        .catch((cause: unknown) => {
          if (
            cause instanceof Error &&
            (cause.message === "render_generation_unavailable" ||
              cause.message === "render_generation_source_changed")
          )
            return false;
          throw cause;
        }));
    const renderEnabled = params.renderTiles === "1" && renderAvailable;
    const tileDataEnabled = renderAvailable && !renderEnabled;
    const systemBody = await readV5StagedDocument(
      rootBody,
      `worlds/${worldId}/revisions/${pointer.served_revision}/v5/content/time-systems/${timeSystemId}.json`,
      async (key) => (await store.get(key)).body
    );
    if (!systemBody) notFound();
    const publishedSystem = (
      JSON.parse(systemBody) as { time_system: PublicTimeSystem }
    ).time_system;
    const system = publicTimeSystemIdentity(publishedSystem);
    const gregorian =
      publishedSystem.definition.coordinate_codec ===
      "yyyy-iso-fields-fraction12-z-v1";
    const label = { ko: summary.world.title, en: summary.world.title };
    const timeLabel = systems.time_systems[0]!.title;
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
        key={worldId}
        renderEnabled={renderEnabled}
        tileDataEnabled={tileDataEnabled}
        discovery={collectionDiscoveryConfig(
          params.discovery,
          process.env.ATROPOS_COLLECTION_DISCOVERY
        )}
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
        readPage={readPage}
        fullEvent={fullEvent}
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
          ...(gregorian
            ? {
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
              }
            : {})
        }}
      />
    );
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.message.startsWith("NEXT_HTTP_ERROR_FALLBACK")
    )
      throw cause;
    return <WorldUnavailable worldId={worldId} cause={cause} />;
  }
}
