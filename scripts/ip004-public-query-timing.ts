import { readFileSync } from "node:fs";
import { createDefaultGraphUrlState } from "../apps/atropos-web/src/lib/moirai-graph-source-query.js";
import { publicTimeSystemIdentity } from "../packages/graph-query/src/index.js";
import { presentationNodeId } from "../packages/graph-presentation/src/index.js";
import type { PublicTimeSystem } from "../packages/contracts/src/index.js";

const plan = JSON.parse(
  readFileSync(
    new URL(
      "../docs/implementation/fixtures/joseon-dogfood.change-plan.json",
      import.meta.url
    ),
    "utf8"
  )
);
const op = plan.operations.find(
  (o: { entity_type: string }) => o.entity_type === "time_system"
);
const identity = publicTimeSystemIdentity({
  id: op.entity_id,
  ...op.value
} as PublicTimeSystem);
const world = "01995c2a-7b00-7000-8000-000000000101";
const canons = [
  "019f5b00-0000-7000-8000-000000000002",
  "019f60ab-0000-7000-8000-000000000401"
];
const label = { ko: "Public R5", en: "Public R5" };
const state = createDefaultGraphUrlState({
  frames: [{ id: "frame", label, description: label, target: identity }],
  worlds: [
    {
      id: world,
      label,
      description: label,
      servedRevision: 5,
      timeSystem: identity,
      timeSystems: [identity],
      canons: canons.map((id) => ({ id, label }))
    }
  ]
});
const base = process.env.IP004_PUBLIC_READBACK_URL;
if (!base || new URL(base).protocol !== "https:")
  throw Error("public_https_url_required");
const id = presentationNodeId(
  { world_id: world, served_revision: 5, canon_id: canons[1]! },
  { kind: "event", event_id: "019f5b00-0000-7000-8000-000000000112" }
);
for (const [route, input] of [
  ["search", { state, term: "사료비판" }],
  ["detail", { state, id }],
  ["query", state.query]
] as const) {
  const start = performance.now();
  const response = await fetch(new URL(`/graph/${route}`, base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(60000)
  });
  const body = await response.text();
  console.log(
    JSON.stringify({
      route,
      status: response.status,
      wall_ms: performance.now() - start,
      server_timing: response.headers.get("server-timing"),
      bytes: Buffer.byteLength(body)
    })
  );
  if (!response.ok) throw Error(`public_${route}_failed`);
  const value = JSON.parse(body);
  if (route === "search" && value.matches?.length !== 1)
    throw Error("expected_one_source_critical_event");
}
