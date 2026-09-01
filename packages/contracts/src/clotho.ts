import type { CreateChangeSet } from "./index.js";
import { CONTRACT_VERSION } from "./versions.js";

export type ChangePlan = Omit<CreateChangeSet, "actor">;
export const CLOTHO_METHODS = [
  "world.list",
  "world.get",
  "canon.list",
  "canon.get",
  "event.search",
  "event.get",
  "event.neighbors",
  "context.slice",
  "change.validate",
  "change.commit"
] as const;
export type ClothoMethod = (typeof CLOTHO_METHODS)[number];
export type ClothoScope = "world:read" | "world:write";
export type JsonSchema = Record<string, unknown>;
const id = {
  type: "string",
  pattern:
    "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
};
const str = (maxLength = 1000): JsonSchema => ({
  type: "string",
  minLength: 1,
  maxLength
});
const nullable = (schema: JsonSchema): JsonSchema => ({
  anyOf: [schema, { type: "null" }]
});
const array = (items: JsonSchema, maxItems = 100): JsonSchema => ({
  type: "array",
  items,
  maxItems
});
const object = (
  properties: Record<string, unknown>,
  required = Object.keys(properties)
): JsonSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false
});
const ref = {
  anyOf: [
    id,
    object({
      client_ref: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" }
    })
  ]
};
const attrs = { type: "object", maxProperties: 100 };
const coordinate = object({
  value: {
    type: "integer",
    minimum: -Number.MAX_SAFE_INTEGER,
    maximum: Number.MAX_SAFE_INTEGER
  }
});
const choice = (...values: string[]): JsonSchema => ({
  type: "string",
  enum: values
});
const relationTypes = [
  "contains",
  "precedes",
  "causes",
  "enables",
  "prevents",
  "influences",
  "starts",
  "ends",
  "identity_continues",
  "identity_instance_of",
  "identity_splits",
  "identity_merges",
  "derives_from",
  "transfers"
];
const operation = (
  entity: string,
  properties: Record<string, unknown>,
  required: string[]
): JsonSchema => ({
  ...object(
    {
      kind: { const: "create" },
      entity_type: { const: entity },
      entity_id: id,
      client_ref: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" },
      origin_refs: {
        ...array(
          object({
            field: str(128),
            origin_index: { type: "integer", minimum: 0, maximum: 99 }
          })
        ),
        minItems: 1
      },
      value: object(properties, required)
    },
    ["kind", "entity_type", "origin_refs", "value"]
  ),
  anyOf: [{ required: ["entity_id"] }, { required: ["client_ref"] }]
});
export const CHANGE_PLAN_SCHEMA: JsonSchema = object({
  contract_version: { const: CONTRACT_VERSION },
  change_set_id: id,
  world_id: id,
  expected_revision: {
    type: "integer",
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER
  },
  intent: str(2000),
  origins: {
    ...array(
      object({
        kind: choice("source_explicit", "human_instruction", "llm_inference"),
        summary: str(4000)
      })
    ),
    minItems: 1
  },
  operations: {
    ...array(
      {
        oneOf: [
          operation(
            "world",
            {
              slug: str(128),
              title: str(500),
              description: nullable(str(10000))
            },
            ["slug", "title"]
          ),
          operation(
            "canon",
            {
              world_id: ref,
              slug: str(128),
              title: str(500),
              description: nullable(str(10000))
            },
            ["world_id", "slug", "title"]
          ),
          operation(
            "event",
            {
              canon_id: ref,
              slug: nullable(str(128)),
              kind: choice("atomic", "composite"),
              title: str(500),
              summary: nullable(str(10000)),
              roles: array(str(128)),
              attributes: attrs
            },
            ["canon_id", "kind", "title", "roles", "attributes"]
          ),
          operation(
            "relation",
            {
              canon_id: ref,
              type: choice(...relationTypes),
              source_event_id: ref,
              target_event_id: ref,
              direction: choice("directed", "undirected"),
              attributes: attrs
            },
            [
              "canon_id",
              "type",
              "source_event_id",
              "target_event_id",
              "direction",
              "attributes"
            ]
          ),
          operation(
            "narrative",
            {
              canon_id: ref,
              scope_type: choice("canon", "event"),
              scope_id: ref,
              locale: str(32),
              kind: choice("primary", "summary", "annotation"),
              title: nullable(str(500)),
              body: str(100000),
              public_references: array(
                object({ label: str(500), url: str(2000) })
              )
            },
            [
              "canon_id",
              "scope_type",
              "scope_id",
              "locale",
              "kind",
              "body",
              "public_references"
            ]
          ),
          operation(
            "time_system",
            {
              world_id: ref,
              slug: str(128),
              title: str(500),
              kind: choice("calendar", "ordinal", "relative", "custom"),
              definition_version: str(64),
              definition: attrs
            },
            [
              "world_id",
              "slug",
              "title",
              "kind",
              "definition_version",
              "definition"
            ]
          ),
          operation(
            "canon_time_system",
            { canon_id: ref, time_system_id: ref },
            ["canon_id", "time_system_id"]
          ),
          operation(
            "event_temporal_placement",
            {
              event_id: ref,
              time_system_id: ref,
              kind: choice("point", "interval"),
              earliest_start: coordinate,
              latest_start: coordinate,
              earliest_end: nullable(coordinate),
              latest_end: nullable(coordinate),
              precision: str(128),
              certainty: choice("exact", "approximate", "uncertain"),
              display_label: nullable(str(500))
            },
            [
              "event_id",
              "time_system_id",
              "kind",
              "earliest_start",
              "latest_start",
              "precision",
              "certainty"
            ]
          )
        ]
      },
      500
    ),
    minItems: 1
  }
});
const page = {
  cursor: str(2000),
  limit: { type: "integer", minimum: 1, maximum: 100 }
};
const world = {
  world_id: id,
  at_revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }
};
const graph = {
  relation_types: array(choice(...relationTypes), 14),
  direction: choice("incoming", "outgoing", "both"),
  depth: { type: "integer", minimum: 0, maximum: 5 },
  max_events: { type: "integer", minimum: 1, maximum: 100 },
  max_relations: { type: "integer", minimum: 1, maximum: 200 },
  max_narrative_chars: { type: "integer", minimum: 1, maximum: 20000 },
  cursor: str(2000)
};
export function clothoInputSchema(method: ClothoMethod): JsonSchema {
  switch (method) {
    case "world.list":
      return object({ ...page, query: str(500) }, []);
    case "world.get":
      return object({ ...world, ...page }, ["world_id"]);
    case "canon.list":
      return object({ ...world, ...page }, ["world_id"]);
    case "canon.get":
      return object({ ...world, ...graph, canon_id: id }, [
        "world_id",
        "canon_id"
      ]);
    case "event.search":
      return object({ ...world, ...page, canon_id: id, query: str(500) }, [
        "world_id",
        "canon_id",
        "query"
      ]);
    case "event.get":
      return object({ ...world, ...graph, event_id: id }, [
        "world_id",
        "event_id"
      ]);
    case "event.neighbors":
      return object({ ...world, ...graph, event_id: id }, [
        "world_id",
        "event_id"
      ]);
    case "context.slice":
      return object(
        {
          ...world,
          ...graph,
          canon_ids: { ...array(id, 20), minItems: 1 },
          seed_ids: { ...array(id, 50), minItems: 1 }
        },
        ["world_id", "canon_ids", "seed_ids"]
      );
    case "change.validate":
    case "change.commit":
      return object(
        {
          plan: CHANGE_PLAN_SCHEMA,
          plan_digest: { type: "string", pattern: "^[0-9a-f]{64}$" }
        },
        ["plan"]
      );
  }
}
