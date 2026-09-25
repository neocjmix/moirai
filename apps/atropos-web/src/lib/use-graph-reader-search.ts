"use client";

import { useEffect, useState } from "react";
import type { MoiraiGraphUrlState } from "@moirai/contracts";
import type { GraphSearchMatch } from "./moirai-graph-source-query";

type Page = { matches: readonly GraphSearchMatch[]; nextCursor: number | null };
type Result = Page & {
  key: string;
  cursor: number;
  pending: boolean;
  failed: boolean;
};

export function useGraphReaderSearch(
  state: MoiraiGraphUrlState,
  term: string,
  enabled: boolean,
  v5 = false
) {
  const key =
    enabled && (v5 || term.trim())
      ? JSON.stringify({ state: { ...state, focus: null }, term: term.trim() })
      : "";
  const [request, setRequest] = useState({ key: "", cursor: 0, attempt: 0 });
  const [result, setResult] = useState<Result>({
    key: "",
    cursor: 0,
    matches: [],
    nextCursor: null,
    pending: false,
    failed: false
  });
  const cursor = request.key === key ? request.cursor : 0;
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    const timer = setTimeout(async () => {
      setResult((previous) => ({
        key,
        cursor,
        matches: previous.key === key ? previous.matches : [],
        nextCursor: null,
        pending: true,
        failed: false
      }));
      try {
        const response = await fetch(
          v5 ? "/graph/v5/search" : "/graph/search",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...JSON.parse(key), cursor }),
            signal: controller.signal
          }
        );
        if (!response.ok) throw Error("search_unavailable");
        const page = (await response.json()) as Page;
        if (controller.signal.aborted) return;
        setResult({
          key,
          cursor,
          matches: page.matches,
          nextCursor: page.nextCursor,
          pending: false,
          failed: false
        });
      } catch {
        // Cleanup prevents an old request from replacing a newer query; a real
        // timeout still reports unavailable, never an empty successful search.
        if (!disposed)
          setResult((previous) => ({
            key,
            cursor,
            matches: previous.key === key ? previous.matches : [],
            nextCursor: null,
            pending: false,
            failed: true
          }));
      } finally {
        clearTimeout(timeout);
      }
    }, 250);
    let disposed = false;
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [key, cursor, request.attempt, v5]);
  const current = result.key === key ? result : null;
  return {
    matches: key ? (current?.matches ?? []) : [],
    pending: Boolean(
      key && (!current || current.cursor !== cursor || current.pending)
    ),
    failed: Boolean(key && current?.failed),
    nextCursor: key ? (current?.nextCursor ?? null) : null,
    hasPrevious: Boolean(key && cursor > 0),
    previous: () =>
      setRequest({ key, cursor: Math.max(0, cursor - 20), attempt: 0 }),
    more: () =>
      setRequest({ key, cursor: current?.nextCursor ?? 0, attempt: 0 }),
    retry: () =>
      setRequest((previous) => ({ key, cursor, attempt: previous.attempt + 1 }))
  };
}
