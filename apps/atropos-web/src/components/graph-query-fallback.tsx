import type {
  MoiraiGraphUrlState,
  MoiraiGraphQueryResult
} from "@moirai/contracts";
import {
  searchGraphEntities,
  buildGraphUrlSearch,
  type GraphSearchEntity
} from "../lib/moirai-graph-source-query";
export function GraphQueryFallback({
  state,
  entities,
  result
}: Readonly<{
  state: MoiraiGraphUrlState;
  entities: readonly GraphSearchEntity[];
  result: MoiraiGraphQueryResult;
}>) {
  const results = searchGraphEntities(state, "", entities);
  const mq = new URLSearchParams(buildGraphUrlSearch("", state)).get("mq")!;
  return (
    <noscript>
      <main>
        <h1>Moirai graph query</h1>
        <p>
          World {state.query.sources.length} · Canon{" "}
          {state.query.sources.reduce((n, s) => n + s.canon_ids.length, 0)}
        </p>
        <p>
          Revision vector:{" "}
          {result.revision_vector
            .map((s) => `${s.world_id}@${s.served_revision}`)
            .join(", ")}
        </p>
        <p>
          Geometry may be unplaced; semantic Events and Relations remain listed.{" "}
          {result.budget.truncated
            ? "Query budget reached; narrow the scope."
            : ""}
        </p>
        <ul>
          {results.map((entity) => (
            <li key={`${entity.kind}:${entity.worldId}:${entity.identity}`}>
              <strong>{entity.title.ko}</strong> ({entity.kind},{" "}
              {entity.persisted ? "persisted" : "derived"}) — matched Canon:{" "}
              {entity.matchedCanonIds.join(", ")}; all memberships:{" "}
              {entity.canonMemberships.join(", ")}
              {entity.kind === "event" ? (
                <a
                  href={`/worlds/${entity.worldId}/events/${entity.identity}?revision=${state.query.sources.find((s) => s.world_id === entity.worldId)!.served_revision}&mq=${encodeURIComponent(mq)}`}
                >
                  Open Event
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        <h2>Relations</h2>
        <ul>
          {result.relations.map((r) => (
            <li key={`${r.world_id}:${r.id}`}>
              {r.id} · {r.type} · {JSON.stringify(r.source_ref)} →{" "}
              {JSON.stringify(r.target_ref)} · all memberships:{" "}
              {r.canon_memberships.join(", ")}
            </li>
          ))}
        </ul>
        <h2>Diagnostics</h2>
        <ul>
          {result.diagnostics.map((d, i) => (
            <li key={i}>
              {d.code}: {d.message}
            </li>
          ))}
        </ul>
      </main>
    </noscript>
  );
}
