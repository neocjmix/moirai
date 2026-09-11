import type {
  MoiraiGraphQueryResult,
  MoiraiGraphUrlState
} from "@moirai/contracts";

export function GraphQueryFallback({
  state,
  result
}: Readonly<{
  state: MoiraiGraphUrlState;
  result: MoiraiGraphQueryResult;
}>) {
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
        <p>
          Revision vector:{" "}
          {result.revision_vector
            .map((entry) => `${entry.world_id}@${entry.served_revision}`)
            .join(", ")}
        </p>
        <ul>
          {result.events.map((event) => (
            <li key={`${event.world_id}:${event.id}`}>
              <strong>{event.title}</strong> (Event, persisted) — matched Canon:{" "}
              {event.matched_canon_ids.join(", ")}; all memberships:{" "}
              {event.canon_memberships.join(", ")}
            </li>
          ))}
          {result.relations.map((relation) => (
            <li key={`${relation.world_id}:${relation.id}`}>
              <strong>{relation.type}</strong> (Relation) — matched Canon:{" "}
              {relation.matched_canon_ids.join(", ")}; all memberships:{" "}
              {relation.canon_memberships.join(", ")}
            </li>
          ))}
        </ul>
      </main>
    </noscript>
  );
}
