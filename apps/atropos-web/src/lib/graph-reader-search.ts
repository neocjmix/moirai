import { createHash } from "node:crypto";
import type { PublicSearchEntry } from "@moirai/contracts";
import { z } from "zod";
import {
  graphRevisionPins,
  loadGraphPublicationSources
} from "./graph-publication-loader";
import {
  readGraphEventNarratives,
  readGraphRevision
} from "./graph-revision-source";
import { readPublicationObject } from "./publication";
import {
  normalizeGraphUrlState,
  searchGraphEntities,
  type GraphSearchEntity,
  type GraphSearchMatch
} from "./moirai-graph-source-query";

const requestSchema = z.object({
  state: z.unknown(),
  term: z.string().trim().min(1).max(512),
  cursor: z.number().int().nonnegative().safe().default(0),
  limit: z.number().int().min(1).max(20).default(20)
});

/** Existing immutable search index selects candidates; only selected-Canon text
 * can establish a match. At most 20 Event documents are verified per page.
 * The cursor advances over candidates, including rejected Canon matches. */
export async function searchGraphReader(value: unknown): Promise<{
  matches: readonly GraphSearchMatch[];
  nextCursor: number | null;
}> {
  const request = requestSchema.parse(value);
  const pins = graphRevisionPins(JSON.stringify(request.state));
  if (!pins.length) throw Error("invalid_search_scope");
  const loaded = await loadGraphPublicationSources(pins, { onlyPinned: true });
  const state = normalizeGraphUrlState(request.state, loaded.catalog);
  if (!state || loaded.failures.length)
    throw Error("search_revision_unavailable");
  const term = request.term.toLocaleLowerCase();
  const candidates = (
    await Promise.all(
      state.query.sources.map(async (source) => {
        const revision = await readGraphRevision(
          source.world_id,
          source.served_revision
        );
        const events = new Map(
          revision.snapshots
            .filter((s) => source.canon_ids.includes(s.canon.id))
            .flatMap((s) => s.events.map((e) => [e.id, e] as const))
        );
        let narrativeCandidates = new Set<string>();
        if (state.query.entity_filter.include_narratives) {
          const key = `worlds/${source.world_id}/revisions/${source.served_revision}/search/en.json`;
          const ref = revision.manifest.documents.find((d) => d.key === key);
          const read = await readPublicationObject(key);
          if (
            !ref ||
            read.status !== 200 ||
            !read.body ||
            createHash("sha256").update(read.body).digest("hex") !== ref.sha256
          )
            throw Error("search_index_digest_mismatch");
          const index = JSON.parse(read.body) as {
            world_id: string;
            served_revision: number;
            entries: PublicSearchEntry[];
          };
          if (
            index.world_id !== source.world_id ||
            index.served_revision !== source.served_revision
          )
            throw Error("search_index_revision_mismatch");
          narrativeCandidates = new Set(
            index.entries
              .filter(
                (e) =>
                  e.target_type === "event" &&
                  e.text.toLocaleLowerCase().includes(term)
              )
              .map((e) => e.target_id)
          );
        }
        return [...events.values()].flatMap((event) => {
          const entity: GraphSearchEntity = {
            identity: event.id,
            kind: "event",
            worldId: source.world_id,
            title: { ko: event.title, en: event.title },
            description: { ko: event.summary ?? "", en: event.summary ?? "" },
            canonMemberships: event.canon_memberships,
            eventKind: event.kind,
            roles: event.roles
          };
          const eligible = searchGraphEntities(state, "", [entity])[0];
          if (!eligible) return [];
          const direct = searchGraphEntities(state, request.term, [entity])[0];
          if (!direct && !narrativeCandidates.has(event.id)) return [];
          return [{ revision, eligible, direct }];
        });
      })
    )
  )
    .flat()
    .sort(
      (a, b) =>
        a.eligible.worldId.localeCompare(b.eligible.worldId) ||
        a.eligible.identity.localeCompare(b.eligible.identity)
    );
  const page = candidates.slice(request.cursor, request.cursor + request.limit);
  const matches = (
    await Promise.all(
      page.map(async ({ revision, eligible, direct }) => {
        if (direct) return [direct];
        const narratives = await readGraphEventNarratives(
          revision.manifest,
          eligible.matchedCanonIds,
          eligible.identity
        );
        const matching = narratives.filter((n) =>
          `${n.title ?? ""} ${n.body}`.toLocaleLowerCase().includes(term)
        );
        const canons = eligible.matchedCanonIds.filter((id) =>
          matching.some((n) => n.canon_id === id)
        );
        if (!canons.length) return [];
        return [
          {
            ...eligible,
            matchedCanonIds: canons,
            reference: { ...eligible.reference, canon_id: canons[0]! }
          }
        ];
      })
    )
  )
    .flat()
    .map((match) => ({
      ...match,
      title: {
        ko: match.title.ko.slice(0, 256),
        en: match.title.en.slice(0, 256)
      },
      description: {
        ko: match.description.ko.slice(0, 1024),
        en: match.description.en.slice(0, 1024)
      }
    }));
  const next = request.cursor + page.length;
  return { matches, nextCursor: next < candidates.length ? next : null };
}
