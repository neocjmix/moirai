import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { TEMPORAL_EXPRESSIVENESS_WORLD_ID } from "@moirai/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { profilePublication } from "./publication-profile";
import {
  assertPublicId,
  hasPublicationStoreConfig,
  readPublicationObject,
  readRelationalTime,
  readWorldEvent,
  selectPublication
} from "./publication";

const environment = { ...process.env };

afterEach(() => {
  process.env = { ...environment };
});

describe("Atropos publication reader", () => {
  it("reuses immutable objects while observing pointer updates and retrying missing artifacts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moirai-cache-boundary-"));
    delete process.env.AWS_ACCESS_KEY_ID;
    process.env.LOCAL_PUBLICATION_FIXTURE_DIR = directory;
    const prefix = `worlds/${TEMPORAL_EXPRESSIVENESS_WORLD_ID}`;
    const old = `${prefix}/revisions/1/event.json`;
    const next = `${prefix}/revisions/2/event.json`;
    const pointer = `${prefix}/current.json`;
    const put = async (key: string, value: string) => {
      const file = join(directory, key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, value);
    };
    try {
      await put(old, "old Event");
      await put(pointer, "revision 1");
      expect(
        (await profilePublication(() => readPublicationObject(old))).metrics
          .objects
      ).toBe(1);
      const repeat = await profilePublication(() => readPublicationObject(old));
      expect(repeat.value.body).toBe("old Event");
      expect(repeat.metrics.objects).toBe(0);
      expect((await readPublicationObject(pointer)).body).toBe("revision 1");
      await put(pointer, "revision 2");
      expect((await readPublicationObject(pointer)).body).toBe("revision 2");
      expect((await readPublicationObject(next)).status).toBe(404);
      await put(next, "refined Event");
      expect((await readPublicationObject(next)).body).toBe("refined Event");
      expect((await readPublicationObject(old)).body).toBe("old Event");
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it("does not invent a World when the Publication Store is absent", async () => {
    for (const name of [
      "AWS_ACCESS_KEY_ID",
      "AWS_S3_BUCKET_NAME",
      "AWS_ENDPOINT_URL",
      "AWS_DEFAULT_REGION",
      "AWS_SECRET_ACCESS_KEY",
      "LOCAL_PUBLICATION_FIXTURE_DIR"
    ]) {
      delete process.env[name];
    }
    expect(hasPublicationStoreConfig()).toBe(false);
    await expect(
      readPublicationObject(
        "worlds/019f3b00-0000-7000-8000-000000000001/current.json"
      )
    ).rejects.toThrow("Publication Store is not configured");
  });

  it("rejects path-like public identifiers", () => {
    expect(() => assertPublicId("../../private")).toThrow();
  });

  it("adapts immutable publication v1 Event ownership at the read boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moirai-publication-v1-"));
    const worldId = TEMPORAL_EXPRESSIVENESS_WORLD_ID;
    const canonId = "019f3b00-0000-7000-8000-000000000002";
    const eventId = "019f3b00-0000-7000-8000-000000000101";
    const revisionPrefix = `worlds/${worldId}/revisions/1`;
    const files = [
      {
        key: `worlds/${worldId}/current.json`,
        value: {
          world_id: worldId,
          served_revision: 1,
          current_revision: 1,
          publication_target_revision: 1,
          projection_status: "ready",
          manifest_key: `${revisionPrefix}/manifest.json`,
          format_version: "1.0.0",
          generated_at: "2026-09-10T00:00:00Z"
        }
      },
      {
        key: `${revisionPrefix}/manifest.json`,
        value: {
          world_id: worldId,
          served_revision: 1,
          format_version: "1.0.0",
          completeness: "complete"
        }
      },
      {
        key: `${revisionPrefix}/events/${eventId}.json`,
        value: {
          served_revision: 1,
          event: {
            id: eventId,
            canon_id: canonId,
            slug: "legacy",
            kind: "atomic",
            title: "Legacy Event",
            summary: null,
            roles: [],
            attributes: {}
          },
          narratives: [],
          relations: [],
          related_events: []
        }
      }
    ];
    try {
      for (const file of files) {
        const path = join(directory, file.key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(file.value));
      }
      for (const name of [
        "AWS_ACCESS_KEY_ID",
        "AWS_S3_BUCKET_NAME",
        "AWS_ENDPOINT_URL",
        "AWS_DEFAULT_REGION",
        "AWS_SECRET_ACCESS_KEY"
      ])
        delete process.env[name];
      process.env.LOCAL_PUBLICATION_FIXTURE_DIR = directory;
      const selected = await selectPublication(worldId);
      await expect(
        readWorldEvent(worldId, eventId, selected)
      ).resolves.toMatchObject({
        event: {
          id: eventId,
          world_id: worldId,
          canon_memberships: [canonId]
        }
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("adapts immutable publication v1 temporal Relation ownership at the read boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "moirai-temporal-v1-"));
    const worldId = TEMPORAL_EXPRESSIVENESS_WORLD_ID;
    const canonId = "019f3b00-0000-7000-8000-000000000002";
    const relationId = "019f3b00-0000-7000-8000-000000000201";
    const revisionPrefix = `worlds/${worldId}/revisions/1`;
    const temporalKey = `${revisionPrefix}/graph/canons/${canonId}/temporal.json`;
    const files = [
      {
        key: `worlds/${worldId}/current.json`,
        value: {
          world_id: worldId,
          served_revision: 1,
          current_revision: 1,
          publication_target_revision: 1,
          projection_status: "ready",
          manifest_key: `${revisionPrefix}/manifest.json`,
          format_version: "1.0.0",
          generated_at: "2026-09-10T00:00:00Z"
        }
      },
      {
        key: `${revisionPrefix}/manifest.json`,
        value: {
          world_id: worldId,
          served_revision: 1,
          format_version: "1.0.0",
          completeness: "complete"
        }
      },
      {
        key: temporalKey,
        value: {
          world_id: worldId,
          canon_id: canonId,
          source_revision: 1,
          served_revision: 1,
          algorithm_version: "relational-time/v1",
          positions: [],
          virtual_time_events: [],
          relations: [
            {
              id: relationId,
              canon_id: canonId,
              type: "precedes",
              direction: "directed",
              source_ref: { kind: "event", event_id: "event-a" },
              target_ref: { kind: "event", event_id: "event-b" },
              attributes: {}
            }
          ],
          diagnostics: []
        }
      }
    ];
    try {
      for (const file of files) {
        const path = join(directory, file.key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify(file.value));
      }
      for (const name of [
        "AWS_ACCESS_KEY_ID",
        "AWS_S3_BUCKET_NAME",
        "AWS_ENDPOINT_URL",
        "AWS_DEFAULT_REGION",
        "AWS_SECRET_ACCESS_KEY"
      ])
        delete process.env[name];
      process.env.LOCAL_PUBLICATION_FIXTURE_DIR = directory;
      const selected = await selectPublication(worldId);
      await expect(
        readRelationalTime(
          worldId,
          canonId,
          { key: temporalKey, algorithm_version: "relational-time/v1" },
          selected
        )
      ).resolves.toMatchObject({
        relations: [
          {
            id: relationId,
            world_id: worldId,
            canon_memberships: [canonId]
          }
        ]
      });
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
