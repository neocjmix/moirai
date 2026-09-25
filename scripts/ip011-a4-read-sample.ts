/** Fresh-process v5 viewport measurement over a synthetic local object store. */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { readV5SelectedViewport } from "@moirai/graph-presentation/server";

const directory = process.argv[2];
const repetitions = Number(process.argv[3] ?? "1");
if (
  !directory ||
  !Number.isSafeInteger(repetitions) ||
  repetitions < 1 ||
  repetitions > 50
)
  throw Error("a4_read_sample_input_invalid");

const fixture = JSON.parse(
  readFileSync(join(directory, "fixture.json"), "utf8")
) as {
  root: string;
  world_id: string;
  revision: number;
  time_system_id: string;
  viewport: { minX: number; maxX: number; minY: number; maxY: number };
  collection_ids: string[];
  paths: Record<string, string | null>;
  expected: {
    reads: number;
    bytes: number;
    shapes: number;
    continuation: boolean;
    response_bytes: number;
  };
};

const samples = [];
for (let i = 0; i < repetitions; i++) {
  let reads = 0;
  let bytes = 0;
  const started = performance.now();
  const result = await readV5SelectedViewport(
    fixture.root,
    fixture.world_id,
    fixture.revision,
    fixture.time_system_id,
    fixture.viewport,
    fixture.collection_ids,
    null,
    async (key) => {
      if (!Object.hasOwn(fixture.paths, key))
        throw Error("a4_uncaptured_object");
      reads++;
      const file = fixture.paths[key];
      if (file === null) return null;
      if (file === undefined) throw Error("a4_uncaptured_object");
      const body = await readFile(join(directory, "objects", file), "utf8");
      bytes += Buffer.byteLength(body);
      return body;
    }
  );
  const sample = {
    ms: +(performance.now() - started).toFixed(3),
    reads,
    bytes,
    shapes: result.shapes.length,
    continuation: result.next_cursor !== null,
    response_bytes: Buffer.byteLength(JSON.stringify(result))
  };
  for (const key of [
    "reads",
    "bytes",
    "shapes",
    "continuation",
    "response_bytes"
  ] as const)
    if (sample[key] !== fixture.expected[key])
      throw Error(`a4_read_drift_${key}`);
  samples.push(sample);
}
process.stdout.write(JSON.stringify(samples) + "\n");
