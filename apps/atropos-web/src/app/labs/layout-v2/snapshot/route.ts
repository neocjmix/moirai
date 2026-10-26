import { loadLayoutV2Snapshot } from "../../../../lib/layout-v2-snapshot";
import {
  assertPublicId,
  readPublicationObject
} from "../../../../lib/publication";
import { readV5ServedRoot } from "@moirai/publication/v5";
import { profilePublicationRoute } from "../../../../lib/publication-profile";

const snapshots = new Map<string, ReturnType<typeof loadLayoutV2Snapshot>>();

export const dynamic = "force-dynamic";

/** This endpoint resolves a public immutable input once. Controls in the Lab
 * use local compute and never call this endpoint or a publication operation. */
async function readSnapshot(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const worldId = query.get("world");
  const timeSystemId = query.get("timeSystem") ?? undefined;
  const requestedRevision = query.get("revision");
  const revision =
    requestedRevision === null ? undefined : Number(requestedRevision);
  try {
    if (!worldId) throw Error("missing_world");
    assertPublicId(worldId);
    if (timeSystemId) assertPublicId(timeSystemId);
    if (
      revision !== undefined &&
      (!/^[1-9][0-9]*$/.test(requestedRevision!) ||
        !Number.isSafeInteger(revision))
    )
      throw Error("invalid_revision");
  } catch {
    return Response.json({ error: "invalid_snapshot_query" }, { status: 400 });
  }
  try {
    // Recheck publication visibility before a cached response; a withdrawn
    // World must never be reopened by this process-local immutable input cache.
    const { pointer } = await readV5ServedRoot(
      { get: readPublicationObject },
      worldId
    );
    if (revision !== undefined && pointer.served_revision !== revision)
      throw Error("lab_snapshot_revision_changed");
    const key = `${worldId}:${pointer.served_revision}:${pointer.manifest_sha256}:${timeSystemId ?? "default"}`;
    let pending = key ? snapshots.get(key) : undefined;
    if (!pending) {
      pending = loadLayoutV2Snapshot(
        worldId,
        pointer.served_revision,
        timeSystemId
      );
      if (key) {
        if (snapshots.size >= 4)
          snapshots.delete(snapshots.keys().next().value!);
        snapshots.set(key, pending);
        pending.catch(() => {
          if (snapshots.get(key) === pending) snapshots.delete(key);
        });
      }
    }
    const snapshot = await pending;
    return Response.json(snapshot, {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    const revisionChanged =
      error instanceof Error &&
      error.message === "lab_snapshot_revision_changed";
    return Response.json(
      {
        error: revisionChanged
          ? "snapshot_revision_changed"
          : "snapshot_unavailable"
      },
      {
        status: revisionChanged ? 409 : 503,
        headers: { "cache-control": "no-store" }
      }
    );
  }
}

export const GET = profilePublicationRoute(readSnapshot);
