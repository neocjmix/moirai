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

export function eventReadingSearch(revision: number, graphSearch = ""): string {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("invalid_reader_revision");
  const result = new URLSearchParams({ revision: String(revision) });
  for (const [key, value] of boundedGraphContext(graphSearch))
    result.set(key, value);
  return `?${result}`;
}

export function graphReturnHref(search: string): string | null {
  const context = boundedGraphContext(search);
  return context.has("mq") ? `/graph?${context}` : null;
}

/** Add the live viewport without replacing the server-validated source/focus/revision. */
export function withGraphReturnContext(
  stableHref: string,
  browserSearch: string
): string {
  if (!/^\/worlds\/[0-9a-f-]{36}\/events\/[0-9a-f-]{36}\?/.test(stableHref))
    throw Error("invalid_stable_event_href");
  const url = new URL(stableHref, "https://atropos.invalid");
  for (const [key, value] of boundedGraphContext(browserSearch)) {
    if (key !== "mq") url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function readerSearchFromQuery(
  query: Readonly<Record<string, string | string[] | undefined>>
): string {
  const search = new URLSearchParams();
  for (const [key, limit] of CONTEXT_LIMITS) {
    const value = query[key];
    if (typeof value === "string" && value.length <= limit)
      search.set(key, value);
  }
  return boundedGraphContext(search.toString()).toString();
}
