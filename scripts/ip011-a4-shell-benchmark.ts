import { execFileSync } from "node:child_process";
const shape = process.argv[2] ?? "sparse";
const p95 = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
interface Sample {
  app_ms: number;
  objects: number;
  bytes: number;
  status: number;
  response_bytes: number;
  entities: number | null;
  truncated: boolean | null;
  error: unknown;
}
const child = (kind: string, reps: number): Sample[] =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/ip011-a4-shell-sample.ts",
        kind,
        String(reps),
        shape
      ],
      { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 60000 }
    )
  );
const results = [];
const failures: string[] = [];
for (const kind of ["viewport", "detail", "collection", "search"]) {
  const cold = Array.from({ length: 20 }, () => child(kind, 1)[0]!);
  const warm = child(kind, 50);
  const result = {
    kind,
    cold,
    warm,
    cold_p95_ms: p95(cold.map((x) => x.app_ms)),
    warm_p95_ms: p95(warm.map((x) => x.app_ms))
  };
  results.push(result);
  if (result.cold_p95_ms > 500) failures.push(`${kind}_cold`);
  if (result.warm_p95_ms > 100) failures.push(`${kind}_warm`);
  if ([...cold, ...warm].some((x) => x.status !== 200))
    failures.push(`${kind}_status`);
  if (cold.some((x) => x.objects > 256 || x.bytes > 1048576))
    failures.push(`${kind}_read_budget`);
  if ([...cold, ...warm].some((x) => x.response_bytes > 1048576))
    failures.push(`${kind}_response_bytes`);
  if (kind === "viewport" && cold.some((x) => !x.entities))
    failures.push("viewport_empty");
  if (
    kind === "viewport" &&
    shape === "dense" &&
    cold.some((x) => x.truncated !== true)
  )
    failures.push("dense_partial_missing");
}
process.stdout.write(
  JSON.stringify({
    node: process.version,
    scale: process.env.A4_SCALE,
    shape,
    store:
      "complete local Publication; fresh application process per cold sample; OS cache retained",
    results,
    failures
  }) + "\n"
);
if (failures.length) process.exitCode = 1;
