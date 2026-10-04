import {
  changeSetDigest,
  commitCreateChangeSet,
  queryClotho,
  validateChangePlan,
  type MoiraiDatabase
} from "@moirai/persistence";
import {
  changeV5WorldLifecycle,
  commitV5Resolved,
  validateV5Resolved,
  queryV5Authoring,
  searchV5WorldEvents,
  getV5EventEvidence
} from "@moirai/persistence/v5";
import { createLachesis, type Lachesis } from "./index.js";
import { createV5Lachesis } from "./v5.js";

export function databaseLachesis(db: MoiraiDatabase): Lachesis {
  return createLachesis({
    query: (method, input, worlds) => queryClotho(db, method, input, worlds),
    digest: changeSetDigest,
    validate: (change) => validateChangePlan(db, change),
    commit: (change) => commitCreateChangeSet(db, change)
  });
}

/** Production v5 database wiring. */
export function databaseV5Lachesis(db: MoiraiDatabase) {
  return createV5Lachesis({
    lifecycle: (action, input, actor) =>
      changeV5WorldLifecycle(db, action, input, actor),
    commit: (input) => commitV5Resolved(db, input),
    validate: (input) => validateV5Resolved(db, input),
    query: (method, input, worlds, allWorlds) =>
      queryV5Authoring(db, method, input, worlds, allWorlds),
    search: (input) => searchV5WorldEvents(db, input),
    detail: (input) => getV5EventEvidence(db, input)
  });
}
