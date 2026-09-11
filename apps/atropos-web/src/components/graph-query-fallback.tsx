import type { MoiraiGraphUrlState } from "@moirai/contracts";

import { searchGraphEntities } from "../lib/moirai-graph-source-query";
import type { GraphSearchEntity } from "../lib/moirai-graph-source-query";

export function GraphQueryFallback({
  state,
  entities
}: Readonly<{
  state: MoiraiGraphUrlState;
  entities: readonly GraphSearchEntity[];
}>) {
  const results = searchGraphEntities(state, "", entities);
  return (
    <noscript>
      <main>
        <h1>Moirai graph query</h1>
        <p>
          World {state.query.sources.length} · Canon{" "}
          {state.query.sources.reduce(
            (count, source) => count + source.canon_ids.length,
            0
          )}
        </p>
        <ul>
          {results.map((entity) => (
            <li key={`${entity.kind}:${entity.worldId}:${entity.identity}`}>
              <strong>{entity.title.ko}</strong> ({entity.kind},{" "}
              {entity.persisted ? "persisted" : "derived"}) — matched Canon:{" "}
              {entity.matchedCanonIds.join(", ")}; all memberships:{" "}
              {entity.canonMemberships.join(", ")}
            </li>
          ))}
        </ul>
      </main>
    </noscript>
  );
}
