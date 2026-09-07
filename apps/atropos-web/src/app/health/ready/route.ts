import { hasPublicationStoreConfig } from "../../../lib/publication";
import { getPublicRuntimeMetadata } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const runtime = getPublicRuntimeMetadata();
  if (hasPublicationStoreConfig()) {
    return Response.json(
      {
        status: "ok",
        service: "atropos-web",
        version: runtime.version,
        commit_sha: runtime.commitSha
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
  return Response.json(
    {
      status: "not_ready",
      service: "atropos-web",
      version: runtime.version,
      commit_sha: runtime.commitSha
    },
    { status: 503, headers: { "cache-control": "no-store" } }
  );
}
