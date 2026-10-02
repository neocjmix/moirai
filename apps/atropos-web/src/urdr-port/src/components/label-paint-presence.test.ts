import { expect, it } from "vitest";
import { LABEL_PAINT_EXIT_MS, reconcileLabelPaint as reconcile } from "./label-paint-presence";
const label = {id: "point:event", label: "Event", opacity: 1, x: 10};
it("mounts newly admitted labels at zero and starts their fade on the shared paint frame", () => {
  const entering = reconcile([], [label], 0);
  expect(entering[0]).toMatchObject({phase: "entering", renderedOpacity: 0});
  expect(reconcile(entering, [label], 5)[0]).toMatchObject({phase: "entering", renderedOpacity: 0});
  expect(reconcile(entering, [label], 16, true)[0]).toMatchObject({phase: "present", renderedOpacity: 1});
});
it("retains only formerly admitted text when current text disappears or admission changes", () => {
  const visible = reconcile(reconcile([], [label], 0), [label], 16, true);
  const exiting = reconcile(visible, [{...label, label: ""}], 20);
  expect(exiting[0]).toMatchObject({label: "Event", phase: "exiting", renderedOpacity: 0, exitStartedAt: 20});
  expect(reconcile(exiting, [], 100)[0]?.exitStartedAt).toBe(20);
  expect(reconcile(exiting, [], 20 + 220)).toHaveLength(1);
  expect(reconcile(exiting, [], 20 + LABEL_PAINT_EXIT_MS)).toEqual([]);
  expect(reconcile([], [{...label, opacity: 0}], 0)).toEqual([]);
  expect(reconcile([], [{...label, label: ""}], 0)).toEqual([]);
});
it("reverses a fading identity using its current placement without restarting at zero", () => {
  const visible = reconcile(reconcile([], [label], 0), [label], 16, true);
  const exiting = reconcile(visible, [], 20);
  expect(reconcile(exiting, [{...label, x: 30}], 50)[0]).toMatchObject({x: 30, phase: "present", renderedOpacity: 1});
});
it("bounds outgoing label paint independently of the current semantic budget", () => {
  const old = Array.from({length: 64}, (_, i) => ({...label, id: `old-${i}`}));
  const current = Array.from({length: 32}, (_, i) => ({...label, id: `new-${i}`}));
  const visible = reconcile(reconcile([], old, 0), old, 16, true);
  const result = reconcile(visible, current, 20);
  expect(result.filter(label => label.phase === "entering")).toHaveLength(32);
  expect(result.filter(label => label.phase === "exiting")).toHaveLength(32);
  expect(result).toHaveLength(64);
});
it("prunes an unrelated exit without advancing a newly committed entry before its paint frame", () => {
  const visible = reconcile(reconcile([], [label], 0), [label], 16, true);
  const replacement = {...label, id: "point:replacement"};
  const changing = reconcile(visible, [replacement], 20);
  const afterDeadline = reconcile(changing, [replacement], 20 + LABEL_PAINT_EXIT_MS);
  expect(afterDeadline).toHaveLength(1);
  expect(afterDeadline[0]).toMatchObject({id: replacement.id, phase: "entering", renderedOpacity: 0});
  expect(reconcile(afterDeadline, [replacement], 300, true)[0]).toMatchObject({phase: "present", renderedOpacity: 1});
});
