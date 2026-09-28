/** The canonical outbox is the durable record of dirty revisions. A Render
 * generation at revision R consumes every completed outbox row through R. */
export function renderReadyAt(input: {
  firstDirtyAt: Date;
  lastDirtyAt: Date;
  quietMs?: number;
  maxWaitMs?: number;
}): number {
  const quietMs = input.quietMs ?? 5_000;
  const maxWaitMs = input.maxWaitMs ?? 30_000;
  if (
    !Number.isSafeInteger(quietMs) ||
    !Number.isSafeInteger(maxWaitMs) ||
    quietMs < 0 ||
    maxWaitMs < quietMs ||
    !Number.isFinite(input.firstDirtyAt.getTime()) ||
    !Number.isFinite(input.lastDirtyAt.getTime()) ||
    input.firstDirtyAt > input.lastDirtyAt
  )
    throw Error("render_coalescing_input_invalid");
  return Math.min(
    input.lastDirtyAt.getTime() + quietMs,
    input.firstDirtyAt.getTime() + maxWaitMs
  );
}
