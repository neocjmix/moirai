import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  CreateChangeSet,
  PublicEvent,
  PublicRelation
} from "@moirai/contracts";
import {
  commitCreateChangeSet,
  createDatabase,
  queryClotho,
  readWorldAtRevision,
  validateChangePlan
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
const relationIds = [
  "019f3b00-0000-7000-8000-000000000731",
  "019f3b00-0000-7000-8000-000000000732",
  "019f3b00-0000-7000-8000-000000000733"
] as const;
const relationSpecs: readonly [
  (typeof relationIds)[number],
  "influences" | "causes" | "prevents",
  (typeof eventIds)[number],
  (typeof eventIds)[number]
][] = [
  [relationIds[0], "influences", eventIds[0], eventIds[1]],
  [relationIds[1], "causes", eventIds[0], eventIds[1]],
  [relationIds[2], "prevents", eventIds[0], eventIds[1]]
];
const relationMembershipSpecs: readonly [
  (typeof relationIds)[number],
  (typeof canonIds)[number]
][] = [
  [relationIds[0], canonIds[0]],
  [relationIds[0], canonIds[1]],
  [relationIds[1], canonIds[0]],
  [relationIds[2], canonIds[1]]
];

function acceptancePlan(): CreateChangeSet {
  return {
    contract_version: 4,
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
      })),
      ...relationSpecs.map(([entity_id, type, source, target]) => ({
        kind: "create" as const,
        entity_type: "relation" as const,
        entity_id,
        value: {
          world_id: worldId,
          type: type as "influences" | "causes" | "prevents",
          source_ref: { kind: "event" as const, event_id: source },
          target_ref: { kind: "event" as const, event_id: target },
          direction: "directed" as const,
          attributes: {}
        }
      })),
      ...relationMembershipSpecs.map(([relation_id, canon_id]) => ({
        kind: "add" as const,
        entity_type: "relation_canon_membership" as const,
        value: { relation_id, canon_id }
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
    expect(view.relations).toHaveLength(3);
    expect(view.relationCanonMemberships).toHaveLength(4);
    expect(
      view.relations.find((relation) => relation.id === relationIds[0])
    ).toMatchObject({
      world_id: worldId,
      canon_memberships: [canonIds[0], canonIds[1]]
    });

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
    )) as {
      events: readonly PublicEvent[];
      relations: readonly PublicRelation[];
    };
    expect(
      query.events.filter((event) => event.id === eventIds[1])
    ).toHaveLength(1);
    expect(query.events[0]?.canon_memberships).toEqual([...canonIds]);
    expect(
      query.relations.filter((relation) => relation.id === relationIds[0])
    ).toHaveLength(1);

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
    const k1 = await readEvent(worldId, canonIds[0], eventIds[0], selected);
    const k2 = await readEvent(worldId, canonIds[1], eventIds[0], selected);
    expect(k1.relations.map((relation) => relation.id).sort()).toEqual([
      relationIds[0],
      relationIds[1]
    ]);
    expect(k2.relations.map((relation) => relation.id).sort()).toEqual([
      relationIds[0],
      relationIds[2]
    ]);

    const portable = await exportWorldPackage(view, 1);
    const imported = await readWorldPackage(portable.bytes);
    expect(imported.view.events).toHaveLength(4);
    expect(imported.view.eventCanonMemberships).toHaveLength(7);
    expect(imported.view.relationCanonMemberships).toHaveLength(4);
    expect(
      imported.view.events.find((event) => event.id === eventIds[0])
    ).toMatchObject({
      id: eventIds[0],
      world_id: worldId,
      canon_memberships: [canonIds[0], canonIds[1]]
    });

    const orphanRelation: CreateChangeSet = {
      contract_version: 4,
      change_set_id: "019f3b00-0000-7000-8000-000000000740",
      world_id: worldId,
      expected_revision: 1,
      actor: "ip003-ci",
      intent: "Reject an active Relation without Canon membership",
      origins: [{ kind: "human_instruction", summary: "R1 rejection" }],
      operations: [
        {
          kind: "create",
          entity_type: "relation",
          entity_id: "019f3b00-0000-7000-8000-000000000741",
          value: {
            world_id: worldId,
            type: "causes",
            source_ref: { kind: "event", event_id: eventIds[0] },
            target_ref: { kind: "event", event_id: eventIds[1] },
            direction: "directed",
            attributes: {}
          }
        }
      ]
    };
    await expect(validateChangePlan(db, orphanRelation)).rejects.toMatchObject({
      code: "relation_canon_membership_required"
    });

    await expect(
      validateChangePlan(db, {
        ...orphanRelation,
        change_set_id: "019f3b00-0000-7000-8000-000000000744",
        intent: "Reject duplicate Relation membership",
        operations: [
          {
            kind: "add",
            entity_type: "relation_canon_membership",
            value: { relation_id: relationIds[0], canon_id: canonIds[0] }
          }
        ]
      })
    ).rejects.toMatchObject({ code: "duplicate_canon_membership" });

    const removeLast: CreateChangeSet = {
      ...orphanRelation,
      change_set_id: "019f3b00-0000-7000-8000-000000000742",
      intent: "Reject removing the last Relation membership",
      operations: [
        {
          kind: "remove",
          entity_type: "relation_canon_membership",
          value: { relation_id: relationIds[1], canon_id: canonIds[0] }
        }
      ]
    };
    await expect(validateChangePlan(db, removeLast)).rejects.toMatchObject({
      code: "relation_canon_membership_required"
    });

    await expect(
      validateChangePlan(db, {
        ...removeLast,
        change_set_id: "019f3b00-0000-7000-8000-000000000743",
        intent: "Allow explicit Relation withdrawal with its last membership",
        operations: [
          ...removeLast.operations,
          {
            kind: "withdraw",
            entity_type: "relation",
            value: { relation_id: relationIds[1] }
          }
        ]
      })
    ).resolves.toMatchObject({ valid: true });
  });
});
