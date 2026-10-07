import {
  GRAPH_SHELL_LOCAL_STATE_KEY,
  parseGraphShellLocalState,
  serializeGraphShellLocalState,
  type GraphShellRestorableState
} from "../urdr-port/src/components/graph-shell-share-state";

export const GRAPH_SESSION_KEY = "moirai:graph-session:v1";
const WORLD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAVED_WORLDS = 12;
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type SavedSession = {
  version: 1;
  lastWorldId: string;
  worlds: Record<string, unknown>;
};

export function graphSessionStorage(): StorageAccess | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readSession(storage: StorageAccess | null): SavedSession | null {
  try {
    const value = JSON.parse(storage?.getItem(GRAPH_SESSION_KEY) ?? "null");
    if (
      value?.version !== 1 ||
      !WORLD_ID.test(value.lastWorldId) ||
      !value.worlds ||
      typeof value.worlds !== "object" ||
      Array.isArray(value.worlds)
    )
      return null;
    return value as SavedSession;
  } catch {
    return null;
  }
}

export function lastGraphWorld(storage: StorageAccess | null): string | null {
  return readSession(storage)?.lastWorldId ?? null;
}

export function workspaceWorldId(buildRevision: string): string | null {
  const id = /^v5:([^:]+):/.exec(buildRevision)?.[1];
  return id && WORLD_ID.test(id) ? id : null;
}

export function rememberGraphWorld(
  storage: StorageAccess | null,
  worldId: string,
  state?: GraphShellRestorableState
) {
  if (!storage || !WORLD_ID.test(worldId)) return;
  try {
    const previous = readSession(storage);
    const worlds = Object.fromEntries(
      Object.entries(previous?.worlds ?? {})
        .filter(([id]) => id !== worldId && WORLD_ID.test(id))
        .slice(-(MAX_SAVED_WORLDS - 1))
    );
    worlds[worldId] = state
      ? serializeGraphShellLocalState(state)
      : (previous?.worlds[worldId] ?? null);
    storage.setItem(
      GRAPH_SESSION_KEY,
      JSON.stringify({ version: 1, lastWorldId: worldId, worlds })
    );
  } catch {
    // Private browsing, blocked storage and quota limits must not stop navigation.
  }
}

export function readWorldGraphState(
  storage: StorageAccess | null,
  worldId: string,
  viewportSize: { width: number; height: number }
): GraphShellRestorableState | null {
  try {
    const session = readSession(storage);
    const saved = session?.worlds[worldId];
    if (saved) return parseGraphShellLocalState(saved, viewportSize);
    // Adopt a legacy camera only when its World identity matches this World.
    const legacy = parseGraphShellLocalState(
      JSON.parse(storage?.getItem(GRAPH_SHELL_LOCAL_STATE_KEY) ?? "null"),
      viewportSize
    );
    return legacy?.shell?.enabledCanonIds.includes(worldId) ? legacy : null;
  } catch {
    return null;
  }
}

export function graphEntryResumeHref(
  search: string,
  savedWorldId: string | null,
  currentWorldId?: string
): string | null {
  if (
    !savedWorldId ||
    !WORLD_ID.test(savedWorldId) ||
    savedWorldId === currentWorldId
  )
    return null;
  const params = new URLSearchParams(search);
  if (
    [
      "world",
      "mq",
      "event",
      "collection",
      "gsViewport",
      "gsEvent",
      "gsTimeline"
    ].some((key) => params.has(key))
  )
    return null;
  params.set("world", savedWorldId);
  return `/graph/v5?${params}`;
}
