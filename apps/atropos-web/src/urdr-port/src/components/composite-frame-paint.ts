import type {
  CompositeFadeCarrier,
  CompositeFadePresence
} from "./graph-shell-composite";

/** A zero opacity target can still be visible while the renderer fades its
 * retained node. Ownership lasts through that node's existing exit deadline. */
export function hasVisiblePaintLifetime(opacity: number, exitStartedAt: number | undefined, now: number, exitDuration: number) {
  return opacity > 0 || (exitStartedAt !== undefined && now < exitStartedAt + exitDuration);
}

/** Derive paint from this frame's geometry and the last committed paint.
 * Camera movement never needs a state-copy effect. Only a genuinely new
 * enter or an unstarted exit needs a following paint frame.
 */
export function reconcileCompositeFramePaint<T extends CompositeFadeCarrier>(
  previous: readonly CompositeFadePresence<T>[],
  incoming: readonly T[],
  now: number,
  advance = false,
  exitDuration = 220,
  paintedPointIds?: ReadonlySet<string>,
): CompositeFadePresence<T>[] {
  const oldById = new Map(previous.map(item => [item.id, item]));
  const incomingById = new Map(incoming.map(item => [item.id, item]));
  const hasPaintedDescendant = (item: T) => {
    const pending = [...(item.contains ?? [])];
    const visited = new Set([item.id]);
    while (pending.length) {
      const id = pending.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const old = oldById.get(id);
      if (paintedPointIds?.has(id) || (old && hasVisiblePaintLifetime(old.renderedOpacity, old.exitStartedAt, now, exitDuration))) return true;
      pending.push(...(incomingById.get(id)?.contains ?? old?.contains ?? []));
    }
    return false;
  };
  const wanted = new Set<string>();
  const next: CompositeFadePresence<T>[] = [];
  for (const item of incoming) {
    wanted.add(item.id);
    const old = oldById.get(item.id);
    // A tick may arrive with a fresh response. A new identity still needs its
    // own opacity-zero DOM commit before that identity can begin to fade in.
    // A newly arriving ancestor of already-painted content owns that content
    // immediately. Mounting it transparent would briefly orphan its children.
    const entering = (!old && !hasPaintedDescendant(item)) || (old?.visibilityState === "entering" && !advance);
    next.push({
      ...item,
      renderedOpacity: entering ? 0 : item.opacity,
      visibilityState: entering ? "entering" : "present"
    });
    // A retained exiting identity is already mounted. Target the current
    // opacity immediately so CSS reverses from its interpolated opacity,
    // rather than restarting its enter at zero. Dropping old exit metadata
    // also cancels the pending deadline for this identity.
  }
  for (const old of previous) {
    if (wanted.has(old.id)) continue;
    if (old.visibilityState !== "exiting") {
      // Remove interaction/admission immediately, then give the mounted paint
      // one committed exit frame before the next RAF starts its opacity fade.
      next.push({...old, visibilityState: "exiting"});
      continue;
    }
    if (old.exitStartedAt === undefined) {
      next.push(advance ? {...old, renderedOpacity: 0, exitStartedAt: now} : old);
      continue;
    }
    if (now < old.exitStartedAt + exitDuration) next.push(old);
  }
  return next;
}

export function needsCompositePaintFrame<T extends CompositeFadeCarrier>(
  regions: readonly CompositeFadePresence<T>[]
) {
  return regions.some(region => region.visibilityState === "entering" ||
    (region.visibilityState === "exiting" && region.exitStartedAt === undefined));
}
