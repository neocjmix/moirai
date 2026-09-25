/** One synthetic build, 20 fresh processes and 50 reads in one process. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { join } from "node:path";

const count = Number(process.argv[2] ?? "1000");
const density = process.argv[3] ?? "sparse";
if (
  ![1000, 10000, 100000].includes(count) ||
  !["sparse", "dense", "shared", "large"].includes(density)
)
  throw Error(
    "usage: ip011-a4-process-benchmark.ts 1000|10000|100000 sparse|dense|shared|large"
  );

const coldCount = 20;
const warmCount = 50;
const directory = mkdtempSync(join(tmpdir(), "ip011-a4-query-"));
const run = (script: string, args: string[], env = process.env) =>
  execFileSync(
    process.execPath,
    ["--max-old-space-size=2900", "--import", "tsx", script, ...args],
    {
      encoding: "utf8",
      env,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 240_000
    }
  ).trim();
const p95 = (samples: { ms: number }[]) =>
  [...samples].sort((a, b) => a.ms - b.ms)[
    Math.ceil(samples.length * 0.95) - 1
  ]!.ms;
try {
  const build = JSON.parse(
    run("scripts/ip011-a4-profile.ts", [String(count), density], {
      ...process.env,
      A4_CAPTURE_DIR: directory,
      A4_QUERY_CENTER_X: "-355.1"
    })
  );
  const cold = Array.from(
    { length: coldCount },
    () =>
      JSON.parse(run("scripts/ip011-a4-read-sample.ts", [directory, "1"]))[0]
  ) as { ms: number; reads: number; bytes: number }[];
  const warm = JSON.parse(
    run("scripts/ip011-a4-read-sample.ts", [directory, String(warmCount)])
  ) as { ms: number; reads: number; bytes: number }[];
  const result = {
    host: process.platform,
    node: process.version,
    cpu: cpus()[0]?.model ?? "unknown",
    memory_bytes: totalmem(),
    store:
      "selected immutable objects on local filesystem; OS cache not flushed",
    cold_processes: coldCount,
    warm_repetitions: warmCount,
    count,
    density,
    viewport: build.viewport,
    build_ms: build.build_ms,
    artifacts_bytes: build.artifact_bytes,
    cold_p95_ms: p95(cold),
    warm_p95_ms: p95(warm),
    cold,
    warm
  };
  process.stdout.write(JSON.stringify(result) + "\n");
  if (
    cold.some(({ reads, bytes }) => reads > 256 || bytes > 1048576) ||
    p95(cold) > 500 ||
    p95(warm) > 100
  )
    process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
