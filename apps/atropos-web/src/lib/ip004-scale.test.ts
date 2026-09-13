import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { buildPublicationArtifacts } from "@moirai/publication";
import { buildSpatialArtifacts } from "@moirai/graph-presentation/server";
import { presentationNodeId } from "@moirai/graph-presentation";
import { queryFromPublicationDocuments } from "@moirai/graph-query";
import { ip004ScaleFixture } from "../../../../scripts/ip004-scale-fixture";
import { loadGraphPublicationSources } from "./graph-publication-loader";
import { composeGraphPublicationQuery } from "./graph-publication-composer";
import { graphPresentationFromResult } from "./graph-query-presentation";
import { createDefaultGraphUrlState } from "./moirai-graph-source-query";
import { graphSpatialBootstrap } from "./graph-spatial-bootstrap";
import {
  readWorldEvent,
  selectPublicationRevision,
  hasPublicationStoreConfig
} from "./publication";
import { profilePublication } from "./publication-profile";
import { POST as spatial } from "../app/graph/spatial/route";
import { POST as detail } from "../app/graph/detail/route";
import { POST as search } from "../app/graph/search/route";
import { POST as query } from "../app/graph/query/route";

// A dedicated process per scale keeps cold caches and peak RSS attributable.
it.skipIf(!process.env.IP004_SCALE)(
  "measures real Atropos read functions against synthetic immutable artifacts",
  async () => {
    if (hasPublicationStoreConfig())
      throw Error("scale_fixture_requires_local_store");
    const count = Number(process.env.IP004_SCALE);
    const fixture = ip004ScaleFixture(count);
    const reuse = process.env.IP004_SCALE_READ_DIR;
    const root =
      reuse ?? (await mkdtemp(join(tmpdir(), "moirai-ip004-scale-")));
    const previousDir = process.env.LOCAL_PUBLICATION_FIXTURE_DIR;
    const previousWorld = process.env.LOCAL_PUBLICATION_FIXTURE_WORLD_ID;
    process.env.LOCAL_PUBLICATION_FIXTURE_DIR = root;
    process.env.LOCAL_PUBLICATION_FIXTURE_WORLD_ID = fixture.world.id;
    const samples: Record<string, unknown>[] = [];
    try {
      if (!reuse) {
        process.stdout.write(
          JSON.stringify({
            scale: count,
            phase: "canonical_publication_start",
            started_at: new Date().toISOString()
          }) + "\n"
        );
        let start = performance.now();
        const publication = buildPublicationArtifacts(
          fixture,
          5,
          "2026-09-13T00:00:00Z"
        );
        const publicationMs = performance.now() - start;
        process.stdout.write(
          JSON.stringify({
            scale: count,
            phase: "canonical_publication",
            ms: publicationMs,
            bytes: publication.documents.reduce(
              (n, d) => n + Buffer.byteLength(d.body),
              0
            ),
            objects: publication.documents.length,
            peak_rss_kib: process.resourceUsage().maxRSS
          }) + "\n"
        );
        // Let the runner deliver phase/RPC messages between long synchronous
        // builds. This does not change either phase's measured CPU wall time.
        await new Promise<void>((resolve) => setImmediate(resolve));
        start = performance.now();
        const graphInput = queryFromPublicationDocuments(
          publication.manifestBody,
          publication.documents
        )!;
        const graphInputMs = performance.now() - start;
        start = performance.now();
        const baked = buildSpatialArtifacts(
          graphInput,
          publication.manifestBody
        );
        process.stdout.write(
          JSON.stringify({
            scale: count,
            phase: "spatial_publication",
            graph_input_ms: graphInputMs,
            ms: performance.now() - start,
            bytes: baked.documents.reduce(
              (n, d) => n + Buffer.byteLength(d.body),
              0
            ),
            objects: baked.documents.length,
            peak_rss_kib: process.resourceUsage().maxRSS
          }) + "\n"
        );
        const documents = [
          ...publication.documents,
          ...baked.documents,
          { key: publication.manifestKey, body: publication.manifestBody },
          { key: baked.manifestKey, body: baked.manifestBody },
          {
            key: `worlds/${fixture.world.id}/current.json`,
            body: JSON.stringify(publication.pointer)
          }
        ];
        for (let i = 0; i < documents.length; i += 32)
          await Promise.all(
            documents.slice(i, i + 32).map(async (d) => {
              const path = join(root, d.key);
              await mkdir(dirname(path), { recursive: true });
              await writeFile(path, d.body);
            })
          );
      }
      if (process.env.IP004_SCALE_KEEP === "1")
        process.stdout.write(
          JSON.stringify({ scale: count, artifact_dir: root }) + "\n"
        );
      async function measure<T>(
        path: string,
        action: () => Promise<T>
      ): Promise<T> {
        const { value, metrics } = await profilePublication(action);
        const start = performance.now();
        const body = JSON.stringify(value);
        const serializeMs = performance.now() - start;
        const parseStart = performance.now();
        JSON.parse(body);
        samples.push({
          path,
          ...metrics,
          serialize_ms: serializeMs,
          parse_ms: performance.now() - parseStart,
          payload_bytes: Buffer.byteLength(body),
          heap_used_bytes: process.memoryUsage().heapUsed
        });
        return value;
      }
      const initial = async () => {
        const loaded = await loadGraphPublicationSources();
        const state = createDefaultGraphUrlState(loaded.catalog);
        const result = composeGraphPublicationQuery(
          state.query,
          loaded.snapshots,
          loaded.failures
        );
        const presentation = graphPresentationFromResult(result);
        const boot = await graphSpatialBootstrap(state, loaded.catalog);
        return { state, completeness: result.completeness, presentation, boot };
      };
      const first = await measure("initial_cold", initial);
      expect(first.presentation.entities.length).toBeGreaterThan(0);
      const source = first.state.query.sources[0]!;
      const event = fixture.events.find(
        (e) => e.canon_memberships.length === 2
      )!;
      const eventId = presentationNodeId(
        {
          world_id: fixture.world.id,
          served_revision: 5,
          canon_id: source.canon_ids[0]!
        },
        { kind: "event", event_id: event.id }
      );
      const post = async (
        handler: (r: Request) => Promise<Response>,
        input: unknown
      ) => {
        const response = await handler(
          new Request("https://example.org/benchmark", {
            method: "POST",
            body: JSON.stringify(input)
          })
        );
        expect(response.status).toBe(200);
        return response.json();
      };
      const center = first.boot.center!;
      const spatialInput = {
        state: first.state,
        sources: source ? [source] : [],
        maxEntities: 500,
        viewport: {
          canonIds: first.boot.workspace.canons.map((c) => c.id),
          bbox: {
            minX: center.x - 300,
            maxX: center.x + 300,
            minY: center.y - 3,
            maxY: center.y + 3
          },
          scale: 1,
          viewportWidth: 390,
          viewportHeight: 844,
          includeNeighbors: false
        }
      };
      await measure("drawer_cold", () =>
        post(detail, { state: first.state, id: eventId })
      );
      await measure("spatial_cold", () => post(spatial, spatialInput));
      const rounds = Number(process.env.IP004_SCALE_ROUNDS ?? 10);
      for (let i = 0; i < rounds; i++) {
        await measure("initial_warm", initial);
        await measure("event_reading", async () =>
          readWorldEvent(
            fixture.world.id,
            event.id,
            await selectPublicationRevision(fixture.world.id, 5)
          )
        );
        await measure("drawer_warm", () =>
          post(detail, { state: first.state, id: eventId })
        );
        const result = await measure("spatial_warm", () =>
          post(spatial, spatialInput)
        );
        expect(
          result.viewport.entities.length + result.viewport.regions.length
        ).toBeLessThanOrEqual(500);
        await measure("narrative_search", () =>
          post(search, { state: first.state, term: "일상" })
        );
      }
      await measure("full_graph_query", () => post(query, first.state.query));
      console.info(
        JSON.stringify({
          scale: count,
          fixture: {
            world: fixture.world.id,
            events: fixture.events.length,
            relations: fixture.relations.length,
            narratives: fixture.narratives.length
          },
          storage: "local filesystem; no network latency",
          rounds,
          paths: [...new Set(samples.map((s) => String(s.path)))].map(
            (path) => {
              const rows = samples.filter((s) => s.path === path);
              const values = (key: string) =>
                rows.map((s) => Number(s[key])).sort((a, b) => a - b);
              const percentile = (key: string, p: number) =>
                values(key)[Math.max(0, Math.ceil(rows.length * p) - 1)];
              return {
                path,
                samples: rows.length,
                app_p50_ms: percentile("app_ms", 0.5),
                app_p95_ms: percentile("app_ms", 0.95),
                serialize_p95_ms: percentile("serialize_ms", 0.95),
                parse_p95_ms: percentile("parse_ms", 0.95),
                objects_min: values("objects")[0],
                objects_max: percentile("objects", 1),
                artifact_bytes_max: percentile("bytes", 1),
                payload_bytes_max: percentile("payload_bytes", 1)
              };
            }
          ),
          peak_rss_kib: process.resourceUsage().maxRSS
        })
      );
    } finally {
      if (previousDir === undefined)
        delete process.env.LOCAL_PUBLICATION_FIXTURE_DIR;
      else process.env.LOCAL_PUBLICATION_FIXTURE_DIR = previousDir;
      if (previousWorld === undefined)
        delete process.env.LOCAL_PUBLICATION_FIXTURE_WORLD_ID;
      else process.env.LOCAL_PUBLICATION_FIXTURE_WORLD_ID = previousWorld;
      if (!reuse && process.env.IP004_SCALE_KEEP !== "1")
        await rm(root, { recursive: true, force: true });
    }
  },
  600_000
);
