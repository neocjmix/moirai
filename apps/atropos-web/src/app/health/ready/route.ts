import { SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { selectPublication } from "../../../lib/publication";
import { getPublicRuntimeMetadata } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const runtime = getPublicRuntimeMetadata();
  try {
    await selectPublication(SYNTHETIC_FIXTURE.worldId);
    return Response.json(
      {
        status: "ok",
        service: "atropos-web",
        version: runtime.version,
        commit_sha: runtime.commitSha
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
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
}
