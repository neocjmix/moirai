import { MILESTONE_ZERO_WORLD } from "@moirai/contracts";

import {
  readSyntheticRevision,
  REVISION_CACHE_CONTROL
} from "../../../../../../lib/publication-store";

interface RouteContext {
  readonly params: Promise<{
    readonly revision: string;
    readonly worldId: string;
  }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { revision, worldId } = await context.params;
  if (
    worldId !== MILESTONE_ZERO_WORLD.world_id ||
    revision !== String(MILESTONE_ZERO_WORLD.served_revision)
  ) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const object = await readSyntheticRevision();
  if (!object.ok)
    return Response.json({ error: "unavailable" }, { status: 503 });

  return new Response(await object.arrayBuffer(), {
    headers: {
      "cache-control": REVISION_CACHE_CONTROL,
      "content-type": "application/json; charset=utf-8",
      etag: object.headers.get("etag") ?? `"m0-${revision}"`
    }
  });
}
