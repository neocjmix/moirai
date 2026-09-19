/** Presentation-only return context. Never propagate credentials or arbitrary return URLs. */
const CONTEXT_LIMITS = [
  ["mq", 65536],
  ["gsViewport", 256],
  ["gsEvent", 4096],
  ["gsStage", 16],
  ["readerTab", 16],
  ["readerFind", 512]
] as const;

export type GraphReaderState = {
  readonly tab: "sources" | "entities" | "search" | "relations";
  readonly search: string;
};
export const DEFAULT_GRAPH_READER: GraphReaderState = {
  tab: "sources",
  search: ""
};
export function graphReaderState(
  query: Readonly<Record<string, string | string[] | undefined>>
): GraphReaderState {
  const tab = query.readerTab;
  const search = query.readerFind;
  return {
    tab:
      tab === "entities" || tab === "search" || tab === "relations"
        ? tab
        : "sources",
    search: typeof search === "string" && search.length <= 512 ? search : ""
  };
}

function boundedGraphContext(search: string): URLSearchParams {
  const input = new URLSearchParams(search);
  const mq = input.get("mq");
  const result = new URLSearchParams();
  if (!mq || mq.length > 65536) return result;
  for (const [key, limit] of CONTEXT_LIMITS) {
    const value = input.get(key);
    if (value && value.length <= limit) result.set(key, value);
  }
  return result;
}

export function graphEventHref({
  worldId,
  eventId,
  revision,
  canonId,
  graphSearch = ""
}: Readonly<{
  worldId: string;
  eventId: string;
  revision: number;
  canonId?: string;
  graphSearch?: string;
}>): string {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("invalid_reader_revision");
  const context = boundedGraphContext(graphSearch);
  context.delete("gsEvent");
  context.delete("gsStage");
  const result = new URLSearchParams({ revision: String(revision) });
  if (canonId) result.set("canon", canonId);
  for (const [key, value] of context) result.set(key, value);
  return `/graph/events/${worldId}/${eventId}?${result}`;
}

/** Add the live viewport without replacing the server-validated source/focus/revision. */
export function withGraphReturnContext(
  stableHref: string,
  browserSearch: string
): string {
  if (!/^\/graph\/events\/[0-9a-f-]{36}\/[0-9a-f-]{36}\?/.test(stableHref))
    throw Error("invalid_stable_event_href");
  const url = new URL(stableHref, "https://atropos.invalid");
  for (const [key, value] of boundedGraphContext(browserSearch)) {
    if (key !== "mq" && key !== "gsEvent" && key !== "gsStage")
      url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}
