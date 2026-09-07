import { hasPublicationStoreConfig } from "../../../lib/publication";
import { getPublicRuntimeMetadata } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const runtime = getPublicRuntimeMetadata();
  if (
    hasPublicationStoreConfig() ||
    Boolean(process.env.LOCAL_PUBLICATION_FIXTURE_DIR)
  ) {
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
