import type {
  MoiraiGraphUrlState,
  MoiraiGraphQueryResult
} from "@moirai/contracts";
import {
  searchGraphEntities,
  buildGraphUrlSearch,
  type GraphSearchEntity
} from "./moirai-graph-source-query";

/** Escape every data/URL interpolation; noscript must contain one static HTML string.
 * React streaming placeholders inside noscript are not DOM nodes when JS is enabled. */
function html(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]!
  );
}

export function graphFallbackMarkup({
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
  const markup = `<main><h1>Moirai graph query</h1>
    <p>World ${state.query.sources.length} · Canon ${state.query.sources.reduce((n, s) => n + s.canon_ids.length, 0)}</p>
    <p>Revision vector: ${html(result.revision_vector.map((s) => `${s.world_id}@${s.served_revision}`).join(", "))}</p>
    <p>Geometry may be unplaced; semantic Events and Relations remain listed. ${result.budget.truncated ? "Query budget reached; narrow the scope." : ""}</p>
    <ul>${results
      .map((entity) => {
        const href = `/worlds/${entity.worldId}/events/${entity.identity}?revision=${state.query.sources.find((s) => s.world_id === entity.worldId)!.served_revision}&mq=${encodeURIComponent(mq)}`;
        return `<li><strong>${html(entity.title.ko)}</strong> (${html(entity.kind)}, ${entity.persisted ? "persisted" : "derived"}) — matched Canon: ${html(entity.matchedCanonIds.join(", "))}; all memberships: ${html(entity.canonMemberships.join(", "))}${entity.kind === "event" ? ` <a href="${html(href)}">Open Event</a>` : ""}</li>`;
      })
      .join("")}</ul>
    <h2>Relations</h2><ul>${result.relations.map((r) => `<li>${html(r.id)} · ${html(r.type)} · ${html(JSON.stringify(r.source_ref))} → ${html(JSON.stringify(r.target_ref))} · all memberships: ${html(r.canon_memberships.join(", "))}</li>`).join("")}</ul>
    <h2>Diagnostics</h2><ul>${result.diagnostics.map((d) => `<li>${html(d.code)}: ${html(d.message)}</li>`).join("")}</ul></main>`;
  return markup;
}
