import { MILESTONE_ZERO_WORLD } from "@moirai/contracts";

import {
  CURRENT_CACHE_CONTROL,
  readSyntheticPointer
} from "../../../../lib/publication-store";

interface RouteContext {
  readonly params: Promise<{ readonly worldId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext
): Promise<Response> {
  const { worldId } = await context.params;
  if (worldId !== MILESTONE_ZERO_WORLD.world_id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const object = await readSyntheticPointer();
  if (!object.ok)
    return Response.json({ error: "unavailable" }, { status: 503 });

  return new Response(await object.arrayBuffer(), {
    headers: {
      "cache-control": CURRENT_CACHE_CONTROL,
      "content-type": "application/json; charset=utf-8",
      etag: object.headers.get("etag") ?? '"m0-current"'
    }
  });
}
