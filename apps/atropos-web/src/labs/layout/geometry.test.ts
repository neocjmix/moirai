import { expect, it } from "vitest";
import { computeLayout } from "@moirai/graph-presentation/layout-engine";
import { createSyntheticLabSnapshot } from "./fixtures";
import { fitCamera, layoutGeometry } from "./geometry";

it("frames a short Composite interval without imposing a one-year camera floor", () => {
  const snapshot = createSyntheticLabSnapshot();
  const geometry = layoutGeometry(snapshot, computeLayout(snapshot.input));
  const short = geometry.find((item) => item.id === "inner-process")!;
  const facts = JSON.stringify(snapshot);
  const camera = fitCamera([short]);
  expect(camera.spanY).toBeCloseTo(
    (short.bounds.maxY - short.bounds.minY) * 1.2,
    9
  );
  expect(camera.spanY).toBeLessThan(1);
  expect(camera.y).toBe(short.center.y);
  expect(JSON.stringify(snapshot)).toBe(facts);
  const instant = geometry.find((item) => item.kind === "point")!;
  expect(fitCamera([instant]).spanY).toBe(168);
});
