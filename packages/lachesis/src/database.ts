import {
  changeSetDigest,
  commitCreateChangeSet,
  queryClotho,
  validateChangePlan,
  type MoiraiDatabase
} from "@moirai/persistence";
import { createLachesis, type Lachesis } from "./index.js";

export function databaseLachesis(db: MoiraiDatabase): Lachesis {
  return createLachesis({
    query: (method, input, worlds) => queryClotho(db, method, input, worlds),
    digest: changeSetDigest,
    validate: (change) => validateChangePlan(db, change),
    commit: (change) => commitCreateChangeSet(db, change)
  });
}
