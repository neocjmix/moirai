import { expect, it } from "vitest";
import { layoutAlgorithms } from "@moirai/graph-presentation/layout-engine";
import { LAYOUT_COPY } from "./copy";

it("every registered Lab algorithm and control has complete reading copy", () => {
  for (const algorithm of layoutAlgorithms) {
    const copy = LAYOUT_COPY[algorithm.id];
    expect(copy, algorithm.id).toBeDefined();
    expect(copy!.title.length).toBeGreaterThan(0);
    expect(copy!.description.length).toBeGreaterThan(0);
    for (const field of algorithm.parameters) {
      expect(
        copy!.parameters[field.key],
        `${algorithm.id}.${field.key}`
      ).toBeDefined();
      expect(copy!.parameters[field.key]!.label.length).toBeGreaterThan(0);
      expect(copy!.parameters[field.key]!.description.length).toBeGreaterThan(
        0
      );
    }
  }
});
