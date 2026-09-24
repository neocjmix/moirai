/** Inactive until coordinated v5 cutover. Strict Clotho HTTP/MCP/CLI input
 * schema; the older v4 schema remains the only live ingress contract. */
import { MOIRAI_GRAPH_RELATION_TYPES } from "./graph.js";

type Schema = Record<string, unknown>;
const id: Schema = {
  type: "string",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
};
/** Bounded, revision-pinned pre-write Event title candidate search. */
export const V5_EVENT_SEARCH_SCHEMA: Schema = {
  type: "object",
  properties: {
    contract_version: { const: 5 },
    world_id: id,
    text: { type: "string", minLength: 3, maxLength: 160 },
    limit: { type: "integer", minimum: 1, maximum: 25 },
    cursor: { type: "string", minLength: 1, maxLength: 512 }
  },
  required: ["contract_version", "world_id", "text"],
  additionalProperties: false
};
const clientRef: Schema = {
  type: "string",
  pattern: "^[a-z][a-z0-9_-]{0,63}$"
};
const string = (maxLength: number): Schema => ({
  type: "string",
  minLength: 1,
  maxLength
});
const list = (items: Schema, maxItems = 100): Schema => ({
  type: "array",
  items,
  maxItems
});
const object = (
  properties: Record<string, Schema>,
  required = Object.keys(properties)
): Schema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});
const nullable = (schema: Schema): Schema => ({
  anyOf: [schema, { type: "null" }]
});
const enumOf = (...values: string[]): Schema => ({
  type: "string",
  enum: values
});
const reference: Schema = { oneOf: [id, object({ client_ref: clientRef })] };
const originRefs: Schema = {
  ...list(
    object({
      field: string(128),
      origin_index: { type: "integer", minimum: 0, maximum: 99 }
    }),
    100
  ),
  minItems: 1
};
const attrs: Schema = { type: "object", maxProperties: 100 };
const publicReference = object({ label: string(500), url: string(2000) });
const note = object({
  title: nullable(string(500)),
  body: string(100000),
  public_references: list(publicReference)
});
const eventEndpoint: Schema = {
  oneOf: [
    object({ kind: { const: "event" }, event_id: id }),
    object({ kind: { const: "event" }, client_ref: clientRef }),
    object({
      kind: { const: "time_event" },
      time_system_ref: {
        oneOf: [
          object({ time_system_id: id }),
          object({ client_ref: clientRef })
        ]
      },
      definition_version: string(64),
      coordinate: string(1000)
    })
  ]
};
const world = {
  slug: string(128),
  title: string(500),
  description: nullable(string(10000))
};
const collection = {
  world_id: reference,
  slug: string(128),
  title: string(500),
  description: nullable(string(10000))
};
const event = {
  world_id: reference,
  slug: nullable(string(128)),
  title: string(500),
  summary: nullable(string(10000)),
  roles: list(string(128)),
  attributes: attrs
};
const relation = {
  world_id: reference,
  type: enumOf(...MOIRAI_GRAPH_RELATION_TYPES),
  source_ref: eventEndpoint,
  target_ref: eventEndpoint,
  direction: enumOf("directed", "undirected"),
  attributes: attrs
};
const narrative = {
  world_id: reference,
  scope_type: enumOf("event", "collection"),
  scope_id: reference,
  locale: string(32),
  title: nullable(string(500)),
  body: string(100000),
  public_references: list(publicReference),
  notes: list(note)
};
const timeSystem = {
  world_id: reference,
  slug: string(128),
  title: string(500),
  kind: enumOf("calendar", "ordinal", "relative", "custom"),
  definition_version: string(64),
  definition: attrs
};
const collectionTimeSystem = {
  collection_id: reference,
  time_system_id: reference
};

const create = (type: string, properties: Record<string, Schema>): Schema[] => {
  const shared = {
    kind: { const: "create" },
    entity_type: { const: type },
    origin_refs: originRefs,
    value: object(properties)
  };
  return [
    object({ ...shared, entity_id: id }),
    object({ ...shared, client_ref: clientRef })
  ];
};
const update = (type: string, properties: Record<string, Schema>): Schema =>
  object({
    kind: { const: "update" },
    entity_type: { const: type },
    entity_id: reference,
    origin_refs: originRefs,
    value: object(properties)
  });
const withdraw = (type: string): Schema =>
  object({
    kind: { const: "withdraw" },
    entity_type: { const: type },
    entity_id: reference,
    origin_refs: originRefs
  });
const membership = (kind: "add" | "remove"): Schema =>
  object({
    kind: { const: kind },
    entity_type: { const: "event_collection_membership" },
    origin_refs: originRefs,
    value: object({ event_id: reference, collection_id: reference })
  });

/** No Canon owner, Event.kind or relation applicability in this plan. */
export const V5_CHANGE_PLAN_SCHEMA: Schema = object({
  contract_version: { const: 5 },
  change_set_id: id,
  world_id: id,
  expected_revision: {
    type: "integer",
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER
  },
  intent: string(2000),
  origins: {
    ...list(
      object({
        kind: enumOf("source_explicit", "human_instruction", "llm_inference"),
        summary: string(4000)
      }),
      100
    ),
    minItems: 1
  },
  policy_version: string(64),
  policy_digest: { type: "string", pattern: "^[0-9a-f]{64}$" },
  operations: {
    ...list(
      {
        oneOf: [
          ...create("collection", collection),
          ...create("event", event),
          ...create("relation", relation),
          ...create("narrative", narrative),
          ...create("time_system", timeSystem),
          ...create("collection_time_system", collectionTimeSystem),
          update("world", world),
          update("collection", collection),
          update("event", event),
          update("narrative", narrative),
          ...["collection", "event", "relation", "narrative"].map(withdraw),
          membership("add"),
          membership("remove")
        ]
      },
      500
    ),
    minItems: 1
  }
});
