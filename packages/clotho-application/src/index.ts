import {
  CLOTHO_METHODS,
  clothoInputSchema,
  type ChangePlan,
  type ClothoMethod
} from "@moirai/contracts";
import { ChangeSetError } from "@moirai/domain";
import type { ActorContext, Lachesis } from "@moirai/lachesis";
import { Ajv } from "ajv";

export type ClothoExecutor = (
  method: ClothoMethod,
  input: Record<string, unknown>,
  actor: ActorContext
) => Promise<unknown>;
const ajv = new Ajv({
  allErrors: false,
  coerceTypes: false,
  removeAdditional: false
});
const validators = new Map(
  CLOTHO_METHODS.map((method) => [
    method,
    ajv.compile(clothoInputSchema(method))
  ])
);
export function createClotho(lachesis: Lachesis): ClothoExecutor {
  return async (method, input, actor) => {
    if (!validators.get(method)?.(input))
      throw new ChangeSetError(
        "invalid_request",
        "input",
        "Invalid tool input"
      );
    const result =
      method === "change.commit" || method === "change.validate"
        ? await lachesis[method === "change.commit" ? "commit" : "validate"](
            input.plan as ChangePlan,
            actor,
            input.plan_digest as string | undefined
          )
        : await lachesis.query(method, input, actor);
    if (Buffer.byteLength(JSON.stringify(result)) > 4_000_000)
      throw new ChangeSetError(
        "response_budget_exceeded",
        "result",
        "Response budget exceeded"
      );
    return result;
  };
}
