import { ChangeSetError } from "@moirai/domain";

export interface PolicyIdentity {
  readonly policy_version: string;
  readonly policy_digest: string;
}
/** A1 prototype only. Invoke inside the canonical transaction AFTER authorized
 * exact-id/digest replay lookup, and BEFORE applying a new v5 write. */
export function assertPolicyForNewWrite(
  submitted: Partial<PolicyIdentity>,
  current: PolicyIdentity
): void {
  if (!submitted.policy_version || !submitted.policy_digest)
    throw new ChangeSetError(
      "authoring_policy_required",
      "policy_version",
      "Read the current authoring policy before writing",
      [],
      true,
      { action: "authoring.policy.get" }
    );
  if (
    submitted.policy_version !== current.policy_version ||
    submitted.policy_digest !== current.policy_digest
  )
    throw new ChangeSetError(
      "authoring_policy_mismatch",
      "policy_version",
      "Authoring policy changed; read it and replan",
      [],
      true,
      { action: "authoring.policy.get" }
    );
}
