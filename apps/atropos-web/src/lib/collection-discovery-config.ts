/** Public, reversible presentation experiment. Resolved once at SSR bootstrap. */
export interface CollectionDiscoveryConfig {
  contextHud: boolean;
  policyVersion: "a5-s1-v1";
}

export function collectionDiscoveryConfig(
  override: string | string[] | undefined,
  rollout: string | undefined
): CollectionDiscoveryConfig {
  return {
    contextHud:
      override === "legacy"
        ? false
        : override === "context"
          ? true
          : rollout !== "legacy",
    policyVersion: "a5-s1-v1"
  };
}
