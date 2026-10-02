type LabelSource = { id: string; label: string; opacity: number };
export type LabelPaint<T extends LabelSource> = T & {
  renderedOpacity: number;
  phase: "entering" | "present" | "exiting";
  exitStartedAt?: number;
};
// Hull text fades for220ms (point text180ms). Keep its node through that
// longest transition plus the first style/paint frame before pruning.
export const LABEL_PAINT_EXIT_MS = 260;

/** Semantic admission stays upstream. Paint remembers only admitted labels,
 * then retains a bounded, noninteractive outgoing layer for the CSS fade.
 * A shared next-frame tick starts enters after their opacity-zero DOM mounts.
 */
export function reconcileLabelPaint<T extends LabelSource>(
  previous: readonly LabelPaint<T>[],
  incoming: readonly T[],
  now: number,
  enterReady = false,
  maxExiting = 32,
): LabelPaint<T>[] {
  const wanted = new Map(incoming.filter(label => label.label.length > 0 && label.opacity > 0).map(label => [label.id, label]));
  const old = new Map(previous.map(label => [label.id, label]));
  const current: LabelPaint<T>[] = [];
  for (const label of wanted.values()) {
    const existing = old.get(label.id);
    const entering = !existing || (existing.phase === "entering" && !enterReady);
    current.push({...label, renderedOpacity: entering ? 0 : label.opacity, phase: entering ? "entering" : "present"});
  }
  const outgoing: LabelPaint<T>[] = [];
  for (const label of previous) {
    if (wanted.has(label.id) || label.phase === "entering") continue;
    const exitStartedAt = label.exitStartedAt ?? now;
    if (now < exitStartedAt + LABEL_PAINT_EXIT_MS)
      outgoing.push({...label, renderedOpacity: 0, phase: "exiting", exitStartedAt});
  }
  outgoing.sort((a, b) => b.exitStartedAt! - a.exitStartedAt! || a.id.localeCompare(b.id));
  return [...current, ...outgoing.slice(0, maxExiting)];
}
