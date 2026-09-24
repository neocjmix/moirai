import {
  changeSetDigest,
  commitCreateChangeSet,
  queryClotho,
  validateChangePlan,
  type MoiraiDatabase
} from "@moirai/persistence";
import {
  commitV5Resolved,
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

/** Staged only. The active app still calls databaseLachesis (v4). */
export function databaseV5Lachesis(db: MoiraiDatabase) {
  return createV5Lachesis({
    commit: (input) => commitV5Resolved(db, input),
    search: (input) => searchV5WorldEvents(db, input),
    detail: (input) => getV5EventEvidence(db, input)
  });
}
