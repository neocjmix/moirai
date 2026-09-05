import { REVISION_CACHE_CONTROL } from "@moirai/publication";
import {
  assertPublicId,
  readPublicationObject
} from "../../../../../../lib/publication";

export const dynamic = "force-dynamic";

export function artifactPath(parts: readonly string[]): string {
  if (
    parts.length === 4 &&
    parts[0] === "graph" &&
    parts[1] === "canons" &&
    parts[3] === "states.json"
  ) {
    assertPublicId(parts[2]!);
    return parts.join("/");
  }
  if (
    parts.length === 1 &&
    (parts[0] === "manifest.json" || parts[0] === "world.json")
  ) {
    return parts[0];
  }
  if (
    parts.length === 2 &&
    (parts[0] === "canons" ||
      parts[0] === "events" ||
      parts[0] === "subjects") &&
    parts[1]?.endsWith(".json")
  ) {
    assertPublicId(parts[1].slice(0, -5));
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts.length === 2 && parts[0] === "search" && parts[1] === "en.json") {
    return "search/en.json";
  }
  if (
    parts.length === 4 &&
    parts[0] === "graph" &&
    parts[1] === "canons" &&
    (parts[3]?.startsWith("timeline-") || parts[3]?.startsWith("process-")) &&
    parts[3].endsWith(".json")
  ) {
    assertPublicId(parts[2]!);
    const prefix = parts[3].startsWith("timeline-") ? "timeline-" : "process-";
    assertPublicId(parts[3].slice(prefix.length, -".json".length));
    return parts.join("/");
  }
  throw new Error("unsupported artifact");
}

export async function GET(
  _request: Request,
  {
    params
  }: {
    readonly params: Promise<{
      worldId: string;
      revision: string;
      artifact: string[];
    }>;
  }
): Promise<Response> {
  try {
    const { worldId, revision, artifact } = await params;
    assertPublicId(worldId);
    if (!/^[1-9][0-9]*$/.test(revision)) throw new Error("invalid revision");
    const key = `worlds/${worldId}/revisions/${revision}/${artifactPath(artifact)}`;
    const object = await readPublicationObject(key);
    if (object.status !== 200 || object.body === null) {
      return new Response(null, { status: object.status });
    }
    return new Response(object.body, {
      headers: {
        "cache-control": REVISION_CACHE_CONTROL,
        "content-type": "application/json; charset=utf-8",
        ...(object.etag ? { etag: object.etag } : {})
      }
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
