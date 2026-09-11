import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { TEMPORAL_EXPRESSIVENESS_WORLD_ID } from "@moirai/contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublicId,
  hasPublicationStoreConfig,
  readPublicationObject,
  readWorldEvent,
  selectPublication
} from "./publication";

const environment = { ...process.env };

afterEach(() => {
  process.env = { ...environment };
});

describe("Atropos publication reader", () => {
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
});
