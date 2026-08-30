import {
  CONTRACT_VERSION,
  MILESTONE_ZERO_WORLD,
  PUBLICATION_FORMAT_VERSION,
  SCHEMA_VERSION,
  type PublicStatusResponse,
  type SmokeResult
} from "@moirai/contracts";

import { getPublicRuntimeMetadata } from "./runtime";

interface WorkflowRun {
  readonly conclusion: string | null;
  readonly created_at: string;
  readonly html_url: string;
  readonly status: string;
  readonly updated_at: string;
}

interface WorkflowRunsResponse {
  readonly workflow_runs?: readonly WorkflowRun[];
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

    const payload = (await response.json()) as WorkflowRunsResponse;
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

  return {
    application: {
      service: "atropos-web",
      version: runtime.version,
      commit_sha: runtime.commitSha,
      deployed_at: runtime.deployedAt
    },
    versions: {
      contract: CONTRACT_VERSION,
      schema: SCHEMA_VERSION,
      publication_format: PUBLICATION_FORMAT_VERSION
    },
    synthetic_world: MILESTONE_ZERO_WORLD,
    smoke,
    surfaces: {
      atropos: "ok",
      health: "ok",
      status: "ok"
    }
  };
}
