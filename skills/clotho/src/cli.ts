import {
  CLOTHO_METHODS,
  clothoInputSchema,
  type ClothoMethod
} from "@moirai/contracts";
import { callClotho, ClothoClientError } from "./client.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const schema = args[0] === "schema";
  const method = args[schema ? 1 : 0] as ClothoMethod;
  if (!CLOTHO_METHODS.includes(method) || args.length !== (schema ? 2 : 1))
    throw new ClothoClientError("usage_clotho_method_or_schema_method");
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
      : new ClothoClientError("client_error");
  process.stderr.write(
    `${JSON.stringify({ error: { code: safe.code, retryable: safe.retryable, ...safe.details, ...(safe.recovery ? { recovery: safe.recovery } : {}) } })}\n`
  );
  process.exitCode = 1;
});
