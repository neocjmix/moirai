import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CreateChangeSet, PublicEvent } from "@moirai/contracts";
import {
  commitCreateChangeSet,
  createDatabase,
  queryClotho,
  readWorldAtRevision
} from "@moirai/persistence";
import { buildPublicationArtifacts } from "@moirai/publication";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  readEvent,
  readWorldEvent,
  selectPublication
} from "../apps/atropos-web/src/lib/publication.js";
import {
  exportWorldPackage,
  readWorldPackage
} from "../skills/clotho/src/portability.js";
import { migrateToLatest } from "../packages/persistence/src/migrate.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const worldId = "019f3b00-0000-7000-8000-000000000701";
const canonIds = [
  "019f3b00-0000-7000-8000-000000000711",
  "019f3b00-0000-7000-8000-000000000712",
  "019f3b00-0000-7000-8000-000000000713"
] as const;
const eventIds = [
  "019f3b00-0000-7000-8000-000000000721",
  "019f3b00-0000-7000-8000-000000000722",
  "019f3b00-0000-7000-8000-000000000723",
  "019f3b00-0000-7000-8000-000000000724"
] as const;
const expectedMemberships = [
  [eventIds[0], canonIds[0]],
  [eventIds[0], canonIds[1]],
  [eventIds[1], canonIds[0]],
  [eventIds[1], canonIds[1]],
  [eventIds[1], canonIds[2]],
  [eventIds[2], canonIds[1]],
  [eventIds[3], canonIds[2]]
] as const;

function acceptancePlan(): CreateChangeSet {
  return {
    contract_version: 3,
    change_set_id: "019f3b00-0000-7000-8000-000000000700",
    world_id: worldId,
    expected_revision: 0,
    actor: "ip003-ci",
    intent: "Prove overlapping Canon membership without Event duplication",
    origins: [
      { kind: "human_instruction", summary: "IP-003 acceptance matrix" }
    ],
    operations: [
      {
        kind: "create",
        entity_type: "world",
        entity_id: worldId,
        value: { slug: "ip003", title: "IP-003 acceptance" }
      },
      ...canonIds.map((id, index) => ({
        kind: "create" as const,
        entity_type: "canon" as const,
        entity_id: id,
        value: {
          world_id: worldId,
          slug: `k${index + 1}`,
          title: `K${index + 1}`
        }
      })),
      ...eventIds.map((id, index) => ({
        kind: "create" as const,
        entity_type: "event" as const,
        entity_id: id,
        value: {
          world_id: worldId,
          slug: String.fromCharCode(97 + index),
          kind: "atomic" as const,
          title: String.fromCharCode(65 + index),
          roles: [],
          attributes: {}
        }
      })),
      ...expectedMemberships.map(([event_id, canon_id]) => ({
        kind: "add" as const,
        entity_type: "event_canon_membership" as const,
        value: { event_id, canon_id }
      }))
    ]
  };
}

describeWithDatabase("IP-003 canonical-to-public acceptance flow", () => {
  const db = createDatabase(databaseUrl ?? "");
  let fixtureDirectory = "";
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    await migrateToLatest(databaseUrl ?? "");
    for (const name of [
      "AWS_ACCESS_KEY_ID",
      "AWS_S3_BUCKET_NAME",
      "AWS_ENDPOINT_URL",
      "AWS_DEFAULT_REGION",
      "AWS_SECRET_ACCESS_KEY"
    ])
      delete process.env[name];
    fixtureDirectory = await mkdtemp(join(tmpdir(), "moirai-ip003-"));
    process.env.LOCAL_PUBLICATION_FIXTURE_DIR = fixtureDirectory;
  });

  afterAll(async () => {
    process.env = { ...originalEnvironment };
    if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true });
    await db.destroy();
  });

  it("preserves A/B/C/D identities and every membership through all read boundaries", async () => {
    await commitCreateChangeSet(db, acceptancePlan());
    const view = await readWorldAtRevision(db, worldId, 1);
    expect(view.events).toHaveLength(4);
    expect(view.eventCanonMemberships).toHaveLength(7);
    expect(view.events.find((event) => event.id === eventIds[1])).toMatchObject(
      {
        world_id: worldId,
        canon_memberships: [...canonIds]
      }
    );

    const query = (await queryClotho(
      db,
      "context.slice",
      {
        world_id: worldId,
        at_revision: 1,
        canon_ids: [...canonIds],
        seed_ids: [eventIds[1]],
        depth: 0,
        max_events: 20,
        max_relations: 20,
        max_narrative_chars: 1000
      },
      [worldId]
    )) as { events: readonly PublicEvent[] };
    expect(
      query.events.filter((event) => event.id === eventIds[1])
    ).toHaveLength(1);
    expect(query.events[0]?.canon_memberships).toEqual([...canonIds]);

    const artifacts = buildPublicationArtifacts(
      view,
      1,
      "2026-09-11T00:00:00Z"
    );
    const files = [
      ...artifacts.documents,
      { key: artifacts.manifestKey, body: artifacts.manifestBody },
      {
        key: `worlds/${worldId}/current.json`,
        body: JSON.stringify(artifacts.pointer)
      }
    ];
    for (const file of files) {
      const path = join(fixtureDirectory, file.key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.body);
    }
    const selected = await selectPublication(worldId);
    const publicEvent = await readWorldEvent(worldId, eventIds[1], selected);
    expect(publicEvent.event.canon_memberships).toEqual([...canonIds]);
    await expect(
      readEvent(worldId, canonIds[2], eventIds[1], selected)
    ).resolves.toMatchObject({
      event: { id: eventIds[1] }
    });

    const portable = await exportWorldPackage(view, 1);
    const imported = await readWorldPackage(portable.bytes);
    expect(imported.view.events).toHaveLength(4);
    expect(imported.view.eventCanonMemberships).toHaveLength(7);
    expect(
      imported.view.events.find((event) => event.id === eventIds[0])
    ).toMatchObject({
      id: eventIds[0],
      world_id: worldId,
      canon_memberships: [canonIds[0], canonIds[1]]
    });
  });
});
