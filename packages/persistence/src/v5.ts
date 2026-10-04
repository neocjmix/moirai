/** Internal-only v5 persistence entry points. Default v4 migrator/readers
 * remain separate until IP-011 A3. */
export { changeV5WorldLifecycle } from "./v5-world-lifecycle.js";
export { queryV5Authoring } from "./v5-authoring-query.js";
export { commitV5Resolved, validateV5Resolved } from "./v5-change.js";
export { readActiveV5State } from "./v5-read.js";
export { readV5WorldAtRevision } from "./v5-history-reader.js";
export { searchV5WorldEvents } from "./v5-authoring-search.js";
export { getV5EventEvidence } from "./v5-authoring-detail.js";
export { assertV5SchemaReady } from "./v5-readiness.js";
