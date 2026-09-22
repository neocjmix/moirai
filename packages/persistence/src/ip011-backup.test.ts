import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import {
  BACKUP_TABLES,
  decryptDatabaseImage,
  encryptDatabaseImage,
  type DatabaseImage
} from "./ip011-backup.js";

it("authenticates backup ciphertext and rejects wrong keys or tampering", () => {
  const key = randomBytes(32).toString("hex");
  const image: DatabaseImage = {
    format: "moirai-v4-db-backup/1",
    migration: "009_ip003_relation_memberships",
    tables: BACKUP_TABLES.map((name) => ({ name, rows_json: "[]", count: 0 })),
    sequences: []
  };
  const encrypted = encryptDatabaseImage(image, key);
  expect(decryptDatabaseImage(encrypted, key)).toEqual(image);
  expect(encryptDatabaseImage(image, key)).not.toEqual(encrypted);
  expect(() =>
    decryptDatabaseImage(encrypted, randomBytes(32).toString("hex"))
  ).toThrow();
  const envelope = JSON.parse(encrypted) as { ciphertext: string };
  const bytes = Buffer.from(envelope.ciphertext, "base64");
  bytes[0] = bytes[0]! ^ 1;
  envelope.ciphertext = bytes.toString("base64");
  expect(() => decryptDatabaseImage(JSON.stringify(envelope), key)).toThrow();
  expect(() => encryptDatabaseImage(image, "invalid")).toThrow(
    "backup_key_required"
  );
});
