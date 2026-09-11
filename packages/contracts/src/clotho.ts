import type { CreateChangeSet } from "./index.js";
import {
  CONTRACT_VERSION,
  EVENT_MEMBERSHIP_CONTRACT_VERSION,
  LEGACY_CONTRACT_VERSION
} from "./versions.js";

export type ChangePlan = Omit<CreateChangeSet, "actor">;

export function normalizeLegacyChangePlan(plan: unknown): ChangePlan {
  const legacy = plan as {
    readonly contract_version?: unknown;
    readonly world_id?: unknown;
    readonly operations?: readonly Record<string, unknown>[];
  };
  if (
    legacy.contract_version !== LEGACY_CONTRACT_VERSION &&
    legacy.contract_version !== EVENT_MEMBERSHIP_CONTRACT_VERSION
  ) {
    return plan as ChangePlan;
  }
  const operations = (legacy.operations ?? []).flatMap((operation) => {
    if (operation.kind !== "create") {
      return [operation];
    }
    if (
      operation.entity_type !== "event" &&
      operation.entity_type !== "relation"
    )
      return [operation];
    const value = operation.value as Record<string, unknown>;
    const { canon_id: canonId, ...eventValue } = value;
    if (canonId === undefined) return [operation];
    const entityReference = operation.client_ref
      ? { client_ref: operation.client_ref }
      : operation.entity_id;
    const originRefs = Array.isArray(operation.origin_refs)
      ? operation.origin_refs
      : [];
    return [
      {
        ...operation,
        origin_refs: originRefs.filter(
          (reference) => (reference as { field?: unknown }).field !== "canon_id"
        ),
        value: { ...eventValue, world_id: legacy.world_id }
      },
      {
        kind: "add",
        entity_type: `${operation.entity_type}_canon_membership`,
        origin_refs: originRefs.filter((reference) => {
          const field = (reference as { field?: unknown }).field;
          return field === "canon_id" || field === "*";
        }),
        value: {
          [`${operation.entity_type}_id`]: entityReference,
          canon_id: canonId
        }
      }
    ];
  });
  return {
    ...(plan as ChangePlan),
    contract_version: CONTRACT_VERSION,
    operations
  } as unknown as ChangePlan;
}
export const CLOTHO_METHODS = [
  "world.list",
  "world.get",
  "world.export",
  "canon.list",
  "canon.get",
  "event.search",
  "event.get",
  "event.neighbors",
  "context.slice",
  "time-event.resolve",
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
const choice = (...values: string[]): JsonSchema => ({
  type: "string",
  enum: values
});
const relationTypes = [
  "contains",
  "precedes",
  "not_after",
  "coincides",
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
const eventReference = {
  oneOf: [
    object({ kind: { const: "event" }, event_id: id }, ["kind", "event_id"]),
    object(
      {
        kind: { const: "event" },
        client_ref: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" }
      },
      ["kind", "client_ref"]
    ),
    object(
      {
        kind: { const: "time_event" },
        time_system_ref: {
          oneOf: [
            object({ time_system_id: id }),
            object({
              client_ref: {
                type: "string",
                pattern: "^[a-z][a-z0-9_-]{0,63}$"
              }
            })
          ]
        },
        definition_version: str(64),
        coordinate: str(1000)
      },
      ["kind", "time_system_ref", "definition_version", "coordinate"]
    )
  ]
};
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
const eventMembershipOperation = (kind: "add" | "remove"): JsonSchema =>
  object(
    {
      kind: { const: kind },
      entity_type: { const: "event_canon_membership" },
      origin_refs: {
        ...array(
          object({
            field: str(128),
            origin_index: { type: "integer", minimum: 0, maximum: 99 }
          })
        ),
        minItems: 1
      },
      value: object({ event_id: ref, canon_id: ref })
    },
    ["kind", "entity_type", "origin_refs", "value"]
  );
const relationMembershipOperation = (kind: "add" | "remove"): JsonSchema =>
  object(
    {
      kind: { const: kind },
      entity_type: { const: "relation_canon_membership" },
      origin_refs: {
        ...array(
          object({
            field: str(128),
            origin_index: { type: "integer", minimum: 0, maximum: 99 }
          })
        ),
        minItems: 1
      },
      value: object({ relation_id: ref, canon_id: ref })
    },
    ["kind", "entity_type", "origin_refs", "value"]
  );
const withdrawEventOperation: JsonSchema = object(
  {
    kind: { const: "withdraw" },
    entity_type: { const: "event" },
    origin_refs: {
      ...array(
        object({
          field: str(128),
          origin_index: { type: "integer", minimum: 0, maximum: 99 }
        })
      ),
      minItems: 1
    },
    value: object({ event_id: ref })
  },
  ["kind", "entity_type", "origin_refs", "value"]
);
const withdrawRelationOperation: JsonSchema = object(
  {
    kind: { const: "withdraw" },
    entity_type: { const: "relation" },
    origin_refs: {
      ...array(
        object({
          field: str(128),
          origin_index: { type: "integer", minimum: 0, maximum: 99 }
        })
      ),
      minItems: 1
    },
    value: object({ relation_id: ref })
  },
  ["kind", "entity_type", "origin_refs", "value"]
);
function changePlanSchema(
  relation: JsonSchema,
  contractVersion: number,
  event: JsonSchema,
  membershipOperations: readonly JsonSchema[] = []
): JsonSchema {
  return object({
    contract_version: { const: contractVersion },
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
            event,
            relation,
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
            ...membershipOperations
          ]
        },
        500
      ),
      minItems: 1
    }
  });
}

const relationOperation = (ownerField: "canon_id" | "world_id") =>
  operation(
    "relation",
    {
      [ownerField]: ref,
      type: choice(...relationTypes),
      source_ref: eventReference,
      target_ref: eventReference,
      direction: choice("directed", "undirected"),
      attributes: attrs
    },
    [ownerField, "type", "source_ref", "target_ref", "direction", "attributes"]
  );

export const CHANGE_PLAN_SCHEMA: JsonSchema = changePlanSchema(
  relationOperation("world_id"),
  CONTRACT_VERSION,
  operation(
    "event",
    {
      world_id: ref,
      slug: nullable(str(128)),
      kind: choice("atomic", "composite"),
      title: str(500),
      summary: nullable(str(10000)),
      roles: array(str(128)),
      attributes: attrs
    },
    ["world_id", "kind", "title", "roles", "attributes"]
  ),
  [
    eventMembershipOperation("add"),
    eventMembershipOperation("remove"),
    withdrawEventOperation,
    relationMembershipOperation("add"),
    relationMembershipOperation("remove"),
    withdrawRelationOperation
  ]
);
export const EVENT_MEMBERSHIP_CHANGE_PLAN_SCHEMA: JsonSchema = changePlanSchema(
  relationOperation("canon_id"),
  EVENT_MEMBERSHIP_CONTRACT_VERSION,
  operation(
    "event",
    {
      world_id: ref,
      slug: nullable(str(128)),
      kind: choice("atomic", "composite"),
      title: str(500),
      summary: nullable(str(10000)),
      roles: array(str(128)),
      attributes: attrs
    },
    ["world_id", "kind", "title", "roles", "attributes"]
  ),
  [
    eventMembershipOperation("add"),
    eventMembershipOperation("remove"),
    withdrawEventOperation
  ]
);
export const LEGACY_CHANGE_PLAN_SCHEMA: JsonSchema = changePlanSchema(
  relationOperation("canon_id"),
  LEGACY_CONTRACT_VERSION,
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
  )
);
const page = {
  cursor: str(2000),
  limit: { type: "integer", minimum: 1, maximum: 100 }
};
const world = {
  world_id: id,
  at_revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }
};
const graph = {
  relation_types: array(choice(...relationTypes), relationTypes.length),
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
    case "world.export":
      return object({ ...world }, ["world_id"]);
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
    case "time-event.resolve":
      return object(
        {
          ...world,
          time_system_id: id,
          definition_version: str(64),
          coordinate: str(1000)
        },
        ["world_id", "time_system_id", "definition_version", "coordinate"]
      );
    case "change.validate":
    case "change.commit":
      return object(
        {
          plan: {
            oneOf: [
              CHANGE_PLAN_SCHEMA,
              EVENT_MEMBERSHIP_CHANGE_PLAN_SCHEMA,
              LEGACY_CHANGE_PLAN_SCHEMA
            ]
          },
          plan_digest: { type: "string", pattern: "^[0-9a-f]{64}$" }
        },
        ["plan"]
      );
  }
}
