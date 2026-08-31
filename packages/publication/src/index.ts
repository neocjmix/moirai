import {
  PUBLICATION_FORMAT_VERSION,
  type PublicationManifest,
  type PublicationPointer
} from "@moirai/contracts";
import {
  projectPublicDocuments,
  type CanonicalRevisionView
} from "@moirai/projections";
import { createHash, createHmac } from "node:crypto";

export const REVISION_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const CURRENT_CACHE_CONTROL = "public, max-age=30, must-revalidate";

export interface ObjectRead {
  readonly status: number;
  readonly body: string | null;
  readonly etag: string | null;
}

export interface ObjectWrite {
  readonly status: number;
  readonly etag: string | null;
}

export interface ObjectStore {
  get(key: string): Promise<ObjectRead>;
  put(
    key: string,
    body: string,
    options?: {
      readonly immutable?: boolean;
      readonly ifMatch?: string;
      readonly ifNoneMatch?: boolean;
    }
  ): Promise<ObjectWrite>;
}

export interface PublicationArtifacts {
  readonly worldId: string;
  readonly revision: number;
  readonly documents: readonly {
    readonly key: string;
    readonly body: string;
  }[];
  readonly manifestKey: string;
  readonly manifestBody: string;
  readonly pointer: PublicationPointer;
}

export function revisionPrefix(worldId: string, revision: number): string {
  return `worlds/${worldId}/revisions/${revision}`;
}

export function currentKey(worldId: string): string {
  return `worlds/${worldId}/current.json`;
}

export function createPointer(
  worldId: string,
  revision: number,
  generatedAt: string
): PublicationPointer {
  return {
    world_id: worldId,
    served_revision: revision,
    current_revision: revision,
    publication_target_revision: revision,
    projection_status: "ready",
    manifest_key: `${revisionPrefix(worldId, revision)}/manifest.json`,
    format_version: PUBLICATION_FORMAT_VERSION,
    generated_at: generatedAt
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPublicationArtifacts(
  view: CanonicalRevisionView,
  revision: number,
  generatedAt: string
): PublicationArtifacts {
  const documents = projectPublicDocuments(view, revision, generatedAt).map(
    ({ key, value }) => ({ key, body: JSON.stringify(value) })
  );
  const manifestKey = `${revisionPrefix(view.world.id, revision)}/manifest.json`;
  const manifest: PublicationManifest = {
    world_id: view.world.id,
    served_revision: revision,
    format_version: PUBLICATION_FORMAT_VERSION,
    generated_at: generatedAt,
    algorithms: { canonical: "m1-v1" },
    documents: documents.map(({ key, body }) => ({
      key,
      media_type: "application/json",
      sha256: sha256(body)
    })),
    completeness: "complete"
  };
  return {
    worldId: view.world.id,
    revision,
    documents,
    manifestKey,
    manifestBody: JSON.stringify(manifest),
    pointer: createPointer(view.world.id, revision, generatedAt)
  };
}

async function writeImmutable(
  store: ObjectStore,
  key: string,
  body: string
): Promise<void> {
  const result = await store.put(key, body, { immutable: true });
  if (result.status === 412) {
    const existing = await store.get(key);
    if (existing.status !== 200 || existing.body !== body) {
      throw new Error("immutable_conflict");
    }
    return;
  }
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`immutable_write_${result.status}`);
  }
}

export async function publishArtifacts(
  store: ObjectStore,
  artifacts: PublicationArtifacts
): Promise<number> {
  for (const document of artifacts.documents) {
    await writeImmutable(store, document.key, document.body);
  }
  await writeImmutable(store, artifacts.manifestKey, artifacts.manifestBody);

  const pointerKey = currentKey(artifacts.worldId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await store.get(pointerKey);
    if (current.status !== 200 && current.status !== 404) {
      throw new Error(`pointer_read_${current.status}`);
    }
    if (current.status === 200 && current.body) {
      const parsed = JSON.parse(current.body) as PublicationPointer;
      if (parsed.served_revision >= artifacts.revision) {
        return parsed.served_revision;
      }
    }
    const swapped = await store.put(
      pointerKey,
      JSON.stringify(artifacts.pointer),
      {
        ...(current.status === 200 && current.etag
          ? { ifMatch: current.etag }
          : { ifNoneMatch: true })
      }
    );
    if (swapped.status === 200 || swapped.status === 201)
      return artifacts.revision;
    if (swapped.status !== 412)
      throw new Error(`pointer_swap_${swapped.status}`);
  }
  throw new Error("pointer_swap_contended");
}

interface S3Config {
  readonly accessKeyId: string;
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly secretAccessKey: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadS3Config(environment: NodeJS.ProcessEnv): S3Config {
  return {
    accessKeyId: required(environment, "AWS_ACCESS_KEY_ID"),
    bucket: required(environment, "AWS_S3_BUCKET_NAME"),
    endpoint: required(environment, "AWS_ENDPOINT_URL"),
    region: required(environment, "AWS_DEFAULT_REGION"),
    secretAccessKey: required(environment, "AWS_SECRET_ACCESS_KEY")
  };
}

function hmac(key: string | Uint8Array, value: string): Uint8Array {
  return createHmac("sha256", key).update(value).digest();
}

export class S3ObjectStore implements ObjectStore {
  private readonly settings: S3Config;

  constructor(environment: NodeJS.ProcessEnv = process.env) {
    this.settings = loadS3Config(environment);
  }

  private objectUrl(key: string): URL {
    const endpoint = new URL(this.settings.endpoint);
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodeURIComponent(this.settings.bucket)}/${encodedKey}`;
    return endpoint;
  }

  private async request(
    method: "GET" | "PUT",
    key: string,
    body = "",
    headers: Readonly<Record<string, string>> = {}
  ): Promise<Response> {
    const url = this.objectUrl(key);
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const bodyHash = sha256(body);
    const canonicalHeaders = `host:${url.host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      method,
      url.pathname,
      "",
      canonicalHeaders,
      signedHeaders,
      bodyHash
    ].join("\n");
    const scope = `${date}/${this.settings.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      sha256(canonicalRequest)
    ].join("\n");
    const dateKey = hmac(`AWS4${this.settings.secretAccessKey}`, date);
    const regionKey = hmac(dateKey, this.settings.region);
    const serviceKey = hmac(regionKey, "s3");
    const signingKey = hmac(serviceKey, "aws4_request");
    const signature = Buffer.from(hmac(signingKey, stringToSign)).toString(
      "hex"
    );
    return fetch(url, {
      method,
      ...(method === "PUT" ? { body } : {}),
      headers: {
        authorization: `AWS4-HMAC-SHA256 Credential=${this.settings.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        "content-type": "application/json; charset=utf-8",
        "x-amz-content-sha256": bodyHash,
        "x-amz-date": amzDate,
        ...headers
      },
      cache: "no-store"
    });
  }

  async get(key: string): Promise<ObjectRead> {
    const response = await this.request("GET", key);
    return {
      status: response.status,
      body: response.ok ? await response.text() : null,
      etag: response.headers.get("etag")
    };
  }

  async put(
    key: string,
    body: string,
    options: {
      readonly immutable?: boolean;
      readonly ifMatch?: string;
      readonly ifNoneMatch?: boolean;
    } = {}
  ): Promise<ObjectWrite> {
    const response = await this.request("PUT", key, body, {
      ...(options.immutable || options.ifNoneMatch
        ? { "if-none-match": "*" }
        : {}),
      ...(options.ifMatch ? { "if-match": options.ifMatch } : {})
    });
    return { status: response.status, etag: response.headers.get("etag") };
  }
}
