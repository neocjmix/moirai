import { createHash, timingSafeEqual } from "node:crypto";
import type { ActorContext } from "@moirai/lachesis";

export interface Credential extends ActorContext {
  readonly token_sha256: string;
}
export type Principal = ActorContext;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function parseCredentials(
  value: string | undefined
): readonly Credential[] {
  if (!value) return [];
  try {
    const items: unknown = JSON.parse(value);
    if (!Array.isArray(items) || items.length > 20) throw new Error();
    for (const item of items) {
      const c = item as Credential;
      if (
        !c ||
        !/^[a-f0-9]{64}$/.test(c.token_sha256) ||
        !uuid.test(c.actor_id) ||
        !Array.isArray(c.scopes) ||
        !c.scopes.length ||
        c.scopes.some((s) => !["world:read", "world:write"].includes(s)) ||
        !Array.isArray(c.world_ids) ||
        !c.world_ids.length ||
        c.world_ids.some((w) => !uuid.test(w)) ||
        !Number.isFinite(Date.parse(c.expires_at))
      )
        throw new Error();
    }
    return items as Credential[];
  } catch {
    throw new Error("Invalid Clotho credential configuration");
  }
}
export function authenticate(
  header: string | undefined,
  credentials: readonly Credential[]
): Principal | undefined {
  if (!header || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(header))
    return undefined;
  const digest = createHash("sha256").update(header.slice(7)).digest();
  const credential = credentials.find(
    (c) =>
      timingSafeEqual(digest, Buffer.from(c.token_sha256, "hex")) &&
      Date.parse(c.expires_at) > Date.now()
  );
  if (!credential) return undefined;
  return {
    actor_id: credential.actor_id,
    world_ids: [...credential.world_ids],
    scopes: [...credential.scopes],
    expires_at: credential.expires_at
  };
}
