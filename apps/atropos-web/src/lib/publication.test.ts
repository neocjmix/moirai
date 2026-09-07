import { afterEach, describe, expect, it } from "vitest";
import {
  assertPublicId,
  hasPublicationStoreConfig,
  readPublicationObject
} from "./publication";

const environment = { ...process.env };

afterEach(() => {
  process.env = { ...environment };
});

describe("Atropos publication reader", () => {
  it("does not invent a World when the Publication Store is absent", async () => {
    for (const name of [
      "AWS_ACCESS_KEY_ID",
      "AWS_S3_BUCKET_NAME",
      "AWS_ENDPOINT_URL",
      "AWS_DEFAULT_REGION",
      "AWS_SECRET_ACCESS_KEY",
      "LOCAL_PUBLICATION_FIXTURE_DIR"
    ]) {
      delete process.env[name];
    }
    expect(hasPublicationStoreConfig()).toBe(false);
    await expect(
      readPublicationObject(
        "worlds/019f3b00-0000-7000-8000-000000000001/current.json"
      )
    ).rejects.toThrow("Publication Store is not configured");
  });

  it("rejects path-like public identifiers", () => {
    expect(() => assertPublicId("../../private")).toThrow();
  });
});
