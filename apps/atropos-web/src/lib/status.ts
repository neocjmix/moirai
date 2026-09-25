import {
  CONTRACT_VERSION,
  PUBLICATION_FORMAT_VERSION,
  SCHEMA_VERSION,
  type PublicStatusResponse,
  type SmokeResult
} from "@moirai/contracts";

import { getPublicRuntimeMetadata } from "./runtime";
import { readV5ServedRoot } from "@moirai/publication/v5";
import { assertPublicId, readPublicationObject } from "./publication";

interface WorkflowRun {
  readonly conclusion: string | null;
  readonly html_url: string;
  readonly status: string;
  readonly updated_at: string;
}

function toSmokeResult(run: WorkflowRun): SmokeResult {
  if (run.status !== "completed") return "running";
  return run.conclusion === "success" ? "passed" : "failed";
}

export async function getLatestSmoke(): Promise<PublicStatusResponse["smoke"]> {
  try {
    const response = await fetch(
      "https://api.github.com/repos/neocjmix/moirai/actions/workflows/post-deploy-smoke.yml/runs?branch=main&per_page=1",
      {
        headers: { accept: "application/vnd.github+json" },
        next: { revalidate: 30 }
      }
    );
    if (!response.ok) throw new Error("smoke status unavailable");
    const payload = (await response.json()) as {
      workflow_runs?: readonly WorkflowRun[];
    };
    const run = payload.workflow_runs?.[0];
    if (!run) throw new Error("no smoke run");
    return {
      result: toSmokeResult(run),
      checked_at: run.updated_at,
      run_url: run.html_url
    };
  } catch {
    return { result: "unknown", checked_at: null, run_url: null };
  }
}

export async function getPublicStatus(): Promise<PublicStatusResponse> {
  const runtime = getPublicRuntimeMetadata();
  const smoke = await getLatestSmoke();
  let v5Served = false;
  const worldId = process.env.ATROPOS_CUTOVER_WORLD_ID;
  if (worldId) {
    try {
      assertPublicId(worldId);
      await readV5ServedRoot({ get: readPublicationObject }, worldId);
      v5Served = true;
    } catch {
      // Report v4 until the complete v5 pointer passes readback.
    }
  }
  return {
    application: {
      service: "atropos-web",
      version: runtime.version,
      commit_sha: runtime.commitSha,
      deployed_at: runtime.deployedAt
    },
    versions: {
      contract: v5Served ? "5" : String(CONTRACT_VERSION),
      schema: v5Served ? "011_ip011_authoring_search" : SCHEMA_VERSION,
      publication_format: v5Served
        ? "v5-publication/1"
        : PUBLICATION_FORMAT_VERSION
    },
    smoke,
    surfaces: { atropos: "ok", health: "ok", status: "ok" }
  };
}
