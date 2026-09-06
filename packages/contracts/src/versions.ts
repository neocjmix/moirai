export const CONTRACT_VERSION = "0.3.0";
/** Accepted TS-010 ChangePlan shape; the legacy 0.3.0 shape remains readable. */
export const TEMPORAL_CONTRACT_VERSION = 2;
/** Slice 4's only enabled v2 canonical-write target until a later approval. */
export const TEMPORAL_EXPRESSIVENESS_WORLD_ID =
  "019f3b00-0000-7000-8000-000000000001";
export const SCHEMA_VERSION = "0.3.0";
export const PUBLICATION_FORMAT_VERSION = "0.7.0";

/** Reserved empty World for the approved corpus clone rehearsal; live writes still require approval. */
export const TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID =
  "019f3b00-0000-7000-8000-000000000401";
export const TEMPORAL_EXPRESSIVENESS_WORLD_IDS: readonly string[] = [
  TEMPORAL_EXPRESSIVENESS_WORLD_ID,
  TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID
];
