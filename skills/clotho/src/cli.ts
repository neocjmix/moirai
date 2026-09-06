import { readFile, stat, writeFile } from "node:fs/promises";
import {
  exportWorldPackage,
  readWorldPackage,
  cloneWorldPlan,
  type PortableWorld
} from "./portability.js";
import {
  CLOTHO_METHODS,
  clothoInputSchema,
  type ClothoMethod
} from "@moirai/contracts";
import { callClotho, ClothoClientError } from "./client.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const config = {
    baseUrl: process.env.CLOTHO_API_URL ?? "",
    token: process.env.CLOTHO_TOKEN ?? ""
  };
  if (args[0] === "export" && args.length === 3) {
    const result = (await callClotho(config, "world.export", {
      world_id: args[1]
    })) as {
      source_revision: number;
      completeness: string;
      snapshot: PortableWorld;
    };
    if (result.completeness !== "complete")
      throw new ClothoClientError("export_incomplete");
    const artifact = await exportWorldPackage(
      result.snapshot,
      result.source_revision
    );
    await writeFile(args[2]!, artifact.bytes, { flag: "wx" });
    process.stdout.write(
      JSON.stringify({
        file: args[2],
        source_revision: result.source_revision,
        fingerprint: artifact.fingerprint
      }) + "\n"
    );
    return;
  }
  if (args[0] === "import-preview" && args.length === 3) {
    if ((await stat(args[1]!)).size > 11 * 1024 * 1024)
      throw new ClothoClientError("package_size_limit");
    const { view } = await readWorldPackage(await readFile(args[1]!));
    const preview = cloneWorldPlan(view, args[2]!);
    const validation = await callClotho(config, "change.validate", {
      plan: preview.plan
    });
    process.stdout.write(JSON.stringify({ ...preview, validation }) + "\n");
    return;
  }
  const schema = args[0] === "schema";
  const method = args[schema ? 1 : 0] as ClothoMethod;
  if (!CLOTHO_METHODS.includes(method) || args.length !== (schema ? 2 : 1))
    throw new ClothoClientError(
      "usage_clotho_method_schema_export_or_import_preview"
    );
  if (schema) {
    process.stdout.write(`${JSON.stringify(clothoInputSchema(method))}\n`);
    return;
  }
  let text = "",
    bytes = 0;
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(String(chunk));
    if (bytes > 1_048_576) throw new ClothoClientError("input_budget_exceeded");
    text += String(chunk);
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new ClothoClientError("invalid_json");
  }
  const result = await callClotho(
    {
      baseUrl: process.env.CLOTHO_API_URL ?? "",
      token: process.env.CLOTHO_TOKEN ?? ""
    },
    method,
    input
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
void main().catch((error: unknown) => {
  const safe =
    error instanceof ClothoClientError
      ? error
      : new ClothoClientError(
          error instanceof Error &&
            /^(package|clone|legacy_placement_export)_[a-z_]+$/.test(
              error.message
            )
            ? error.message
            : "client_error"
        );
  process.stderr.write(
    `${JSON.stringify({ error: { code: safe.code, retryable: safe.retryable, ...safe.details, ...(safe.recovery ? { recovery: safe.recovery } : {}) } })}\n`
  );
  process.exitCode = 1;
});
