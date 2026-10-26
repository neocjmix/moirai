import type {
  LayoutInput,
  LayoutOutput
} from "@moirai/graph-presentation/layout-engine";

/** A public, revision-pinned research input. No credentials, authoring metadata,
 * mutable store handle, or publication operation crosses this boundary. */
export interface LayoutV2Snapshot {
  readonly formatVersion: "layout-lab-v2-snapshot/1";
  readonly worldId: string;
  readonly worldTitle: string;
  readonly sourceRevision: number;
  readonly servedRevision: number;
  readonly timeSystemId: string;
  readonly sourceRootDigest: string;
  readonly inputDigest: string;
  readonly input: LayoutInput;
  readonly baseline: LayoutOutput;
  readonly collections: readonly {
    readonly id: string;
    readonly title: string;
    readonly eventIds: readonly string[];
  }[];
  readonly events: readonly {
    readonly id: string;
    readonly title: string;
    readonly childIds: readonly string[];
    readonly collectionIds: readonly string[];
  }[];
  readonly relations: readonly {
    readonly id: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly type: string;
  }[];
}

/** Hash the same UTF-8 bytes with server SHA-256 or browser Web Crypto. */
export function snapshotDigestPayload(
  snapshot: Pick<
    LayoutV2Snapshot,
    "input" | "baseline" | "events" | "relations" | "collections"
  >
): string {
  return JSON.stringify({
    input: snapshot.input,
    baseline: snapshot.baseline,
    events: snapshot.events,
    relations: snapshot.relations,
    collections: snapshot.collections
  });
}
