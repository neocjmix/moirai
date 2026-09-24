/** Inactive v5 temporal detail shards. World temporal truth is calculated
 * once; these bounded pages expose it without a Collection-specific clock.
 * Spatial/time-range indexes and serving remain separate prerequisites. */
import type { V5ContentPage } from "./v5-content.js";
import type { projectV5WorldTemporal } from "./v5-temporal.js";

const PAGE_SIZE = 128;
type Temporal = ReturnType<typeof projectV5WorldTemporal>;

export function buildV5TemporalDetailPages(
  projection: Temporal
): readonly V5ContentPage[] {
  const { world_id: worldId, source_revision: revision } = projection;
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/temporal`;
  const documents: V5ContentPage[] = [];
  const writePages = <T>(key: string, name: string, values: readonly T[]) => {
    for (let offset = 0; offset < values.length; offset += PAGE_SIZE)
      documents.push({
        key: `${prefix}/${key}/${name}/${offset / PAGE_SIZE}.json`,
        value: {
          world_id: worldId,
          revision,
          page: offset / PAGE_SIZE,
          items: values.slice(offset, offset + PAGE_SIZE)
        }
      });
    return Math.ceil(values.length / PAGE_SIZE);
  };
  for (const position of projection.positions) {
    const key = `events/${position.event_id}`;
    const { source_constraint_ids, ...detail } = position;
    const evidencePageCount = writePages(
      key,
      "position-evidence",
      source_constraint_ids
    );
    documents.push({
      key: `${prefix}/${key}/position.json`,
      value: {
        world_id: worldId,
        revision,
        position: detail,
        source_constraint_count: source_constraint_ids.length,
        source_constraint_page_count: evidencePageCount
      }
    });
  }
  for (const composite of projection.composites) {
    const key = `events/${composite.event_id}`;
    const {
      direct_children,
      descendant_event_ids,
      during,
      duration,
      descendant_span,
      ...detail
    } = composite;
    const { evidence: durationEvidence, ...durationDetail } = duration;
    const { evidence: spanEvidence, ...spanDetail } = descendant_span;
    // Multiple World assertions may name the same child. Preserve their
    // evidence in Relations while projecting one navigable Event identity.
    const uniqueChildren = [
      ...new Map(
        direct_children.map((ref) => [JSON.stringify(ref), ref])
      ).values()
    ];
    const lists = {
      direct_children: uniqueChildren.length,
      direct_children_pages: writePages(key, "children", uniqueChildren),
      descendant_count: descendant_event_ids.length,
      descendant_pages: writePages(key, "descendants", descendant_event_ids),
      during_count: during.length,
      during_pages: writePages(key, "during", during),
      duration_evidence_count: durationEvidence.length,
      duration_evidence_pages: writePages(
        key,
        "duration-evidence",
        durationEvidence
      ),
      span_evidence_count: spanEvidence.length,
      span_evidence_pages: writePages(key, "span-evidence", spanEvidence)
    };
    documents.push({
      key: `${prefix}/${key}/composite.json`,
      value: {
        world_id: worldId,
        revision,
        composite: {
          ...detail,
          duration: durationDetail,
          descendant_span: spanDetail,
          ...lists
        }
      }
    });
  }
  const virtualPages = writePages(
    "world",
    "virtual-time-events",
    projection.virtual_time_events
  );
  const evidencePages = writePages("world", "evidence", projection.evidence);
  documents.push({
    key: `${prefix}/world.json`,
    value: {
      world_id: worldId,
      revision,
      projection_type: projection.projection_type,
      algorithm_version: projection.algorithm_version,
      solver_algorithm_version: projection.solver_algorithm_version,
      semantic_digest: projection.semantic_digest,
      position_count: projection.positions.length,
      composite_count: projection.composites.length,
      virtual_time_event_count: projection.virtual_time_events.length,
      virtual_time_event_pages: virtualPages,
      evidence_count: projection.evidence.length,
      evidence_pages: evidencePages,
      completeness: "temporal-detail-only",
      page_size: PAGE_SIZE
    }
  });
  return documents.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
