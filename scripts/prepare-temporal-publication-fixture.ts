import { buildSpatialArtifacts } from "../packages/graph-presentation/src/artifacts.js";
import { queryFromPublicationDocuments } from "../packages/graph-query/src/index.js";
/** CI-only publication fixture. This is not evidence of a live Clotho commit. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  normalizeLegacyChangePlan,
  type CreateChangeSet
} from "../packages/contracts/src/index.js";
import {
  resolveCreateOperations,
  type ResolvedCreateOperation
} from "../packages/domain/src/index.js";
import {
  buildPublicationArtifacts,
  currentKey
} from "../packages/publication/src/index.js";
import type { CanonicalRevisionView } from "../packages/projections/src/index.js";
import { prepareV5PublicationFixture } from "./prepare-v5-publication-fixture.js";

const base = new URL(
  "../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);
const operations: ResolvedCreateOperation[] = [];
for (const name of ["bootstrap.change-plan.json", "success.change-plan.json"]) {
  const plan = {
    ...normalizeLegacyChangePlan(
      JSON.parse(await readFile(new URL(name, base), "utf8"))
    ),
    actor: "019f3b00-0000-7000-8000-000000000099"
  } as CreateChangeSet;
  operations.push(
    ...resolveCreateOperations(plan, () => {
      throw Error("Fixture requires explicit IDs");
    }).operations
  );
}
const rows = (type: string) =>
  operations
    .filter((o) => o.kind === "create" && o.entity_type === type)
    .map((o) => ({ id: o.entity_id, ...o.value }));
const eventCanonMemberships = operations.flatMap((operation) =>
  operation.kind === "add" && operation.entity_type === "event_canon_membership"
    ? [
        {
          event_id: String(operation.value.event_id),
          canon_id: String(operation.value.canon_id)
        }
      ]
    : []
);
const events = operations.flatMap((operation) => {
  if (operation.kind !== "create" || operation.entity_type !== "event")
    return [];
  return [
    {
      id: operation.entity_id,
      ...operation.value,
      canon_memberships: eventCanonMemberships
        .filter((membership) => membership.event_id === operation.entity_id)
        .map((membership) => membership.canon_id)
    }
  ];
});
const relationCanonMemberships = operations.flatMap((operation) =>
  operation.kind === "add" &&
  operation.entity_type === "relation_canon_membership"
    ? [
        {
          relation_id: String(operation.value.relation_id),
          canon_id: String(operation.value.canon_id)
        }
      ]
    : []
);
const view = {
  world: rows("world")[0],
  canons: rows("canon"),
  timeSystems: rows("time_system"),
  canonTimeSystems: rows("canon_time_system"),
  eventCanonMemberships,
  relationCanonMemberships,
  events,
  relations: rows("relation").map((relation) => ({
    ...relation,
    canon_memberships: relationCanonMemberships
      .filter((membership) => membership.relation_id === relation.id)
      .map((membership) => membership.canon_id)
  })),
  narratives: [
    ...rows("narrative"),
    {
      id: "019f3b00-0000-7000-8000-000000000901",
      canon_id: "019f3b00-0000-7000-8000-000000000002",
      scope_type: "event",
      scope_id: "019f3b00-0000-7000-8000-000000000101",
      locale: "ko",
      kind: "primary",
      title: "검색 수용시험 이야기",
      body: "이야기본문전용표식은 사건 제목이나 요약에 없는 CI 검색 검증 문장이다.",
      public_references: [
        { label: "합성 출처", url: "https://example.org/history" }
      ]
    },
    {
      id: "019f3b00-0000-7000-8000-000000000902",
      canon_id: "019f3b00-0000-7000-8000-000000000002",
      scope_type: "event",
      scope_id: "019f3b00-0000-7000-8000-000000000101",
      locale: "ko",
      kind: "annotation",
      title: "날짜의 근거",
      body: "보조주석전용표식: 자료의 연도 표기를 따른다.",
      public_references: []
    }
  ]
} as unknown as CanonicalRevisionView;
const artifacts = buildPublicationArtifacts(view, 2, "2026-09-06T00:00:00Z");
const root = resolve(
  process.env.LOCAL_PUBLICATION_FIXTURE_DIR ??
    "/tmp/moirai-temporal-publication-fixture"
);
const spatial = buildSpatialArtifacts(
  queryFromPublicationDocuments(artifacts.manifestBody, artifacts.documents)!,
  artifacts.manifestBody
);
for (const item of [
  ...spatial.documents,
  { key: spatial.manifestKey, body: spatial.manifestBody },
  ...artifacts.documents,
  { key: artifacts.manifestKey, body: artifacts.manifestBody },
  { key: currentKey(view.world.id), body: JSON.stringify(artifacts.pointer) }
]) {
  const path = resolve(root, item.key);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, item.body);
}
await prepareV5PublicationFixture(root);
process.stdout.write(
  "Prepared isolated v4 and v5 browser Publication fixtures\n"
);
