/** Explicitly authorized 2026-09-28: mutate the current development World.
 * No DB access, schema change, deletion, credential output or extra authority. */
import { writeFile } from "node:fs/promises";
import { V5_AUTHORING_POLICY } from "../packages/contracts/src/authoring-policy-v5.js";
import {
  corpusBatch,
  corpusId,
  collectionId,
  worldId,
  themes
} from "./a5-discovery-corpus.js";

const api = process.env.CLOTHO_API_URL;
const token = process.env.CLOTHO_TOKEN;
const publicUrl = process.env.PUBLIC_INTEGRATION_URL;
if (!api || !token || !publicUrl || process.env.A5_SEED_CONFIRM !== worldId)
  throw Error("A5 seed configuration/explicit World confirmation missing");

async function call<T>(method: string, body: unknown): Promise<T> {
  const response = await fetch(new URL(`/v2/clotho/${method}`, api), {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
  const result = (await response.json()) as {
    result: T;
    error?: { code: string; path?: string };
  };
  if (!response.ok || result.error)
    throw Error(
      `A5 ${method}: ${response.status} ${result.error?.code ?? "request_failed"} ${result.error?.path ?? ""}`
    );
  return result.result;
}
const policy = await call<typeof V5_AUTHORING_POLICY>("authoring.policy.get", {
  contract_version: 5,
  world_id: worldId
});
if (
  policy.policy_digest !== V5_AUTHORING_POLICY.policy_digest ||
  policy.document !== V5_AUTHORING_POLICY.document
)
  throw Error("Policy changed: review before authoring");
type Search = {
  source_revision: number;
  events: { id: string }[];
  next_cursor: string | null;
};
const evidence: unknown[] = [];
let finalRevision = 0;
for (let group = 0; group < themes.length; group++) {
  const input = {
    contract_version: 5,
    world_id: worldId,
    text: `[A5 실험 ${String(group + 1).padStart(2, "0")}]`,
    limit: 25
  };
  const before = await call<Search>("event.search", input);
  const operations = corpusBatch(group);
  const expectedIds = operations
    .filter((op) => op.kind === "create" && op.entity_type === "event")
    .map((op) => (op as { entity_id: string }).entity_id);
  const complete = (s: Search) =>
    !s.next_cursor &&
    s.events.length === 23 &&
    expectedIds.every((id) => s.events.some((e) => e.id === id));
  if (before.events.length && !complete(before))
    throw Error(`Unexpected/partial corpus collision at group ${group}`);
  if (!complete(before)) {
    const plan = {
      contract_version: 5,
      change_set_id: corpusId(900000 + group),
      world_id: worldId,
      expected_revision: before.source_revision,
      intent:
        "User-authorized A5 development corpus in current World; synthetic, not historical; 2026-09-28",
      origins: [
        {
          kind: "human_instruction",
          summary:
            "User explicitly authorized current operational World synthetic mutations for A5 exploration before release reset."
        }
      ],
      policy_version: policy.policy_version,
      policy_digest: policy.policy_digest,
      operations
    };
    // On uncertain transport outcome retry only this exact ID and payload.
    try {
      await call("change.commit", plan);
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name))
      )
        await call("change.commit", plan);
      else throw error;
    }
  }
  const after = await call<Search>("event.search", input);
  if (!complete(after)) throw Error(`Corpus readback failed at group ${group}`);
  finalRevision = after.source_revision;
  const detail = await call<{
    narrative: { body: string };
    event: { id: string };
  }>("event.get", {
    contract_version: 5,
    world_id: worldId,
    event_id: expectedIds[0],
    at_revision: finalRevision
  });
  if (!detail.narrative.body.includes("A5 실험"))
    throw Error("Narrative readback failed");
  const entry = {
    group,
    collection_id: collectionId(group),
    events: 23,
    revision: finalRevision,
    reused: complete(before)
  };
  evidence.push(entry);
  console.log(JSON.stringify(entry));
}
await writeFile(
  "a5-seed-evidence.json",
  JSON.stringify(
    {
      world_id: worldId,
      final_revision: finalRevision,
      collections_added: 24,
      events_added: 552,
      batches: evidence
    },
    null,
    2
  )
);
const deadline = Date.now() + 12 * 60_000;
while (Date.now() < deadline) {
  const response = await fetch(
    new URL(`/worlds/${worldId}/current.json`, publicUrl),
    { signal: AbortSignal.timeout(15000) }
  );
  const pointer = (await response.json()) as {
    served_revision: number;
    current_revision: number;
  };
  if (response.ok && pointer.served_revision >= finalRevision) {
    console.log(JSON.stringify({ publication_ready: true, ...pointer }));
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
}
throw Error(
  "Canonical writes completed but Publication has not converged; do not repeat writes"
);
