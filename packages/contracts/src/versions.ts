/** Event and Relation identity are World-owned; Canon participation is explicit. */
export const CONTRACT_VERSION = 4;
/** Event-membership contract accepted through the Relation compatibility adapter. */
export const EVENT_MEMBERSHIP_CONTRACT_VERSION = 3;
/** Accepted only by the Clotho ingress adapter for lossless single-Canon conversion. */
export const LEGACY_CONTRACT_VERSION = 2;
/** Stable fixture identifiers; these do not gate runtime behavior. */
export const TEMPORAL_EXPRESSIVENESS_WORLD_ID =
  "019f3b00-0000-7000-8000-000000000001";
export const SCHEMA_VERSION = "1.0.0";
/** World-owned Event and Relation identity with explicit Canon memberships. */
export const PUBLICATION_FORMAT_VERSION = "3.0.0";
/** Event-membership publication retained for immutable artifact reads. */
export const EVENT_MEMBERSHIP_PUBLICATION_FORMAT_VERSION = "2.0.0";
/** Read-only Atropos compatibility for immutable pre-IP-003 artifacts. */
export const LEGACY_PUBLICATION_FORMAT_VERSION = "1.0.0";

/** Reserved empty World for the approved corpus clone rehearsal; live writes still require approval. */
export const TEMPORAL_EXPRESSIVENESS_IMPORT_WORLD_ID =
  "019f3b00-0000-7000-8000-000000000401";
