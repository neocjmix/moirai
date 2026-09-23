/** Stable IDs for v5 client_ref resolution. This is a pre-ingress building
 * block, not a public parser or authorization boundary. */
import { createHash } from "node:crypto";
import { ChangeSetError } from "@moirai/domain";

const uuidV7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clientRef = /^[a-z][a-z0-9_-]{0,63}$/;
const entityTypes = new Set([
  "collection",
  "time_system",
  "collection_time_system",
  "event",
  "relation",
  "narrative"
]);

/** Derive the UUIDv7 timestamp from the Change Set's UUIDv7 timestamp and
 * the random bits from its ID, entity type, and client_ref. This makes an
 * uncertain-outcome retry resolve to exactly the same canonical payload. */
export function v5ClientRefId(
  changeSetId: string,
  entityType: string,
  reference: string
): string {
  if (
    !uuidV7.test(changeSetId) ||
    !entityTypes.has(entityType) ||
    !clientRef.test(reference)
  )
    throw new ChangeSetError(
      "invalid_client_ref",
      "operations.client_ref",
      "Invalid v5 Change Set reference"
    );
  const seed = `${changeSetId}/${entityType}/${reference}`;
  const bytes = createHash("sha256")
    .update("moirai:v5:client-ref-id:1\0")
    .update(seed)
    .digest();
  const timestamp = changeSetId.replaceAll("-", "").slice(0, 12);
  const entropy = bytes.toString("hex");
  const versionSegment = `7${entropy.slice(0, 3)}`;
  const variantSegment =
    ((bytes[2]! & 0x3f) | 0x80).toString(16).padStart(2, "0") +
    entropy.slice(6, 8);
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-${versionSegment}-${variantSegment}-${entropy.slice(8, 20)}`;
}
