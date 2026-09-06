import { CHANGE_PLAN_SCHEMA, type JsonSchema } from "./clotho.js";
import { describe, expect, it } from "vitest";

const findPlacementOperation = (
  value: unknown
): Record<string, unknown> | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const properties = object.properties as
    Record<string, Record<string, unknown>> | undefined;
  if (
    properties?.entity_type?.const === "event_temporal_placement" &&
    properties.value
  ) {
    return object;
  }
  for (const child of Object.values(object)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findPlacementOperation(item);
        if (found) return found;
      }
    } else {
      const found = findPlacementOperation(child);
      if (found) return found;
    }
  }
  return undefined;
};

describe("M4-D temporal Change Plan characterization", () => {
  it("limits Placement coordinates to safe integers rather than canonical strings", () => {
    const operation = findPlacementOperation(
      CHANGE_PLAN_SCHEMA as JsonSchema
    ) as {
      properties: {
        value: {
          properties: {
            earliest_start: {
              properties: { value: Record<string, unknown> };
            };
          };
        };
      };
    };
    const coordinate =
      operation.properties.value.properties.earliest_start.properties.value;

    expect(coordinate).toEqual({
      type: "integer",
      minimum: -Number.MAX_SAFE_INTEGER,
      maximum: Number.MAX_SAFE_INTEGER
    });
    expect(JSON.stringify(operation.properties.value)).not.toContain(
      "time_event"
    );
  });
});
