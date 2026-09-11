import {
  MOIRAI_GRAPH_CONTRACT_VERSION,
  type MoiraiGraphQuery
} from "@moirai/contracts";

import {
  composePublishedGraphQuery,
  publishedGraphQueryDigest
} from "../../../lib/published-graph-query";

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "query_too_large" }, { status: 413 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "query_too_large" }, { status: 413 });
  }
  try {
    const query = JSON.parse(body) as MoiraiGraphQuery;
    if (query.contract_version !== MOIRAI_GRAPH_CONTRACT_VERSION) {
      return Response.json({ error: "unsupported_contract" }, { status: 400 });
    }
    const result = await composePublishedGraphQuery(query);
    return Response.json(
      { result, semantic_digest: publishedGraphQueryDigest(result) },
      {
        headers: {
          "cache-control": "public, max-age=30, stale-while-revalidate=120"
        }
      }
    );
  } catch {
    return Response.json(
      { error: "invalid_or_unavailable_query" },
      { status: 400 }
    );
  }
}
