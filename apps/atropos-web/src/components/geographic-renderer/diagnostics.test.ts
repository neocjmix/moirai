import { expect, it } from "vitest";
import { rendererFallbackReason } from "./diagnostics";

it("reports known geometry failures without exposing arbitrary exception text", () => {
  expect(rendererFallbackReason(new Error("geographic_vertex_budget"))).toBe(
    "geographic_vertex_budget"
  );
  expect(rendererFallbackReason(new Error("non_simple_geographic_path"))).toBe(
    "non_simple_geographic_path"
  );
  expect(rendererFallbackReason(new Error("private runtime details"))).toBe(
    "gpu-unavailable"
  );
  expect(rendererFallbackReason("private runtime details")).toBe(
    "gpu-unavailable"
  );
  expect(rendererFallbackReason(undefined)).toBe("gpu-unavailable");
});
