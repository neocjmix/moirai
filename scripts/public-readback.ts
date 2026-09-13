/** Compare identities, not just HTTP success or row counts. Ordering is presentation-only. */
export function assertSameIdentitySet(
  label: string,
  actual: readonly { readonly id: string }[],
  expected: readonly { readonly id: string }[]
): void {
  const left = actual.map((item) => item.id).toSorted();
  const right = expected.map((item) => item.id).toSorted();
  if (
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length ||
    JSON.stringify(left) !== JSON.stringify(right)
  )
    throw Error(`${label} identity readback mismatch`);
}

export function assertReadbackRevision(
  worldId: string,
  revision: number,
  artifact: { readonly world_id: string; readonly served_revision: number }
): void {
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    artifact.world_id !== worldId ||
    artifact.served_revision !== revision
  )
    throw Error("mixed World/Revision readback");
}
