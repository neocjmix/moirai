import type {
  MoiraiGraphUrlState,
  MoiraiGraphQueryResult
} from "@moirai/contracts";
import {
  searchGraphEntities,
  buildGraphUrlSearch,
  type GraphSearchEntity
} from "./moirai-graph-source-query";
import { graphEventHref } from "./event-reading-navigation";

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
  const focusEventId =
    state.focus?.kind === "event" && state.focus.event_ref.kind === "event"
      ? state.focus.event_ref.event_id
      : null;
  const narratives = result.narratives.filter(
    (n) =>
      !focusEventId ||
      (n.world_id === state.focus?.world_id &&
        n.scope_type === "event" &&
        n.scope_id === focusEventId)
  );
  const prose = (body: string) =>
    body
      .split(/\n\s*\n/)
      .map((paragraph) => `<p>${html(paragraph)}</p>`)
      .join("");
  const narrativeMarkup = narratives
    .map((n) => {
      const title = n.title ? `<h3>${html(n.title)}</h3>` : "";
      const sources = n.public_references
        .filter((ref) => /^https?:\/\//i.test(ref.url))
        .map(
          (ref) =>
            `<li><a href="${html(ref.url)}" rel="noreferrer">${html(ref.label)}</a></li>`
        )
        .join("");
      const note = n.narrative_kind === "annotation";
      return `<section data-canon-id="${html(n.canon_id)}">${note ? "" : title + prose(n.body)}${note || sources ? `<details><summary>주석과 출처 · Notes and sources</summary>${note ? title + prose(n.body) : ""}${sources ? `<ul>${sources}</ul>` : ""}</details>` : ""}</section>`;
    })
    .join("");
  const markup = `<main><h1>Moirai graph query</h1>
    <p>World ${state.query.sources.length} · Canon ${state.query.sources.reduce((n, s) => n + s.canon_ids.length, 0)}</p>
    <p>Revision vector: ${html(result.revision_vector.map((s) => `${s.world_id}@${s.served_revision}`).join(", "))}</p>
    <p>Geometry may be unplaced; semantic Events and Relations remain listed. ${result.budget.truncated ? "Query budget reached; narrow the scope." : ""}</p>
    ${narrativeMarkup}
    <ul>${results
      .map((entity) => {
        const source = state.query.sources.find(
          (candidate) => candidate.world_id === entity.worldId
        )!;
        const href = graphEventHref({
          worldId: entity.worldId,
          eventId: entity.identity,
          revision: source.served_revision,
          ...(entity.matchedCanonIds.length === 1
            ? { canonId: entity.matchedCanonIds[0]! }
            : {}),
          graphSearch: new URLSearchParams({ mq }).toString()
        });
        return `<li><strong>${html(entity.title.ko)}</strong> (${html(entity.kind)}, ${entity.persisted ? "persisted" : "derived"}) — matched Canon: ${html(entity.matchedCanonIds.join(", "))}; all memberships: ${html(entity.canonMemberships.join(", "))}${entity.kind === "event" ? ` <a href="${html(href)}">Open Event</a>` : ""}</li>`;
      })
      .join("")}</ul>
    <h2>Relations</h2><ul>${result.relations.map((r) => `<li>${html(r.id)} · ${html(r.type)} · ${html(JSON.stringify(r.source_ref))} → ${html(JSON.stringify(r.target_ref))} · all memberships: ${html(r.canon_memberships.join(", "))}</li>`).join("")}</ul>
    <h2>Diagnostics</h2><ul>${result.diagnostics.map((d) => `<li>${html(d.code)}: ${html(d.message)}</li>`).join("")}</ul></main>`;
  return markup;
}
