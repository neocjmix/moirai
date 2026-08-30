import { getPublicRuntimeMetadata } from "../../lib/runtime";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const runtime = getPublicRuntimeMetadata();
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
