import { createHash, createHmac } from "node:crypto";

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

function config(environment: NodeJS.ProcessEnv = process.env): S3Config {
  return {
    accessKeyId: required(environment, "AWS_ACCESS_KEY_ID"),
    bucket: required(environment, "AWS_S3_BUCKET_NAME"),
    endpoint: required(environment, "AWS_ENDPOINT_URL"),
    region: required(environment, "AWS_DEFAULT_REGION"),
    secretAccessKey: required(environment, "AWS_SECRET_ACCESS_KEY")
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Uint8Array, value: string): Uint8Array {
  return createHmac("sha256", key).update(value).digest();
}

function objectUrl(settings: S3Config, key: string): URL {
  const endpoint = new URL(settings.endpoint);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, "")}/${encodeURIComponent(settings.bucket)}/${encodedKey}`;
  return endpoint;
}

async function signedRequest(
  method: "GET" | "PUT",
  key: string,
  body = "",
  extraHeaders: Readonly<Record<string, string>> = {}
): Promise<Response> {
  const settings = config();
  const url = objectUrl(settings, key);
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
  const scope = `${date}/${settings.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest)
  ].join("\n");
  const dateKey = hmac(`AWS4${settings.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, settings.region);
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = Buffer.from(hmac(signingKey, stringToSign)).toString("hex");

  return fetch(url, {
    method,
    ...(method === "PUT" ? { body } : {}),
    headers: {
      authorization: `AWS4-HMAC-SHA256 Credential=${settings.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      "content-type": "application/json; charset=utf-8",
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": amzDate,
      ...extraHeaders
    },
    cache: "no-store"
  });
}

export async function getObject(key: string): Promise<Response> {
  return signedRequest("GET", key);
}

export async function putObject(
  key: string,
  json: string,
  options: { readonly immutable?: boolean } = {}
): Promise<Response> {
  return signedRequest(
    "PUT",
    key,
    json,
    options.immutable ? { "if-none-match": "*" } : {}
  );
}
