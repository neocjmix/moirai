import { loadLayoutLabSnapshot } from "../../../../labs/layout/load-snapshot";
import { assertPublicId } from "../../../../lib/publication";

export const dynamic = "force-dynamic";

/** This endpoint resolves a public immutable input once. Controls in the Lab
 * use local compute and never call this endpoint or a publication operation. */
export async function GET(request: Request): Promise<Response> {
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
    const snapshot = await loadLayoutLabSnapshot(
      worldId,
      revision,
      timeSystemId
    );
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
