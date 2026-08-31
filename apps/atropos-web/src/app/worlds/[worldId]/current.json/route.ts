import { CURRENT_CACHE_CONTROL, currentKey } from "@moirai/publication";
import {
  assertPublicId,
  readPublicationObject
} from "../../../../lib/publication";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ worldId: string }> }
): Promise<Response> {
  try {
    const { worldId } = await params;
    assertPublicId(worldId);
    const object = await readPublicationObject(currentKey(worldId));
    if (object.status !== 200 || object.body === null) {
      return new Response(null, { status: object.status });
    }
    return new Response(object.body, {
      headers: {
        "cache-control": CURRENT_CACHE_CONTROL,
        "content-type": "application/json; charset=utf-8",
        ...(object.etag ? { etag: object.etag } : {})
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
