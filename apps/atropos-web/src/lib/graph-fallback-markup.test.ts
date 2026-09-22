import { expect, it } from "vitest";
import { graphFallbackMarkup } from "./graph-fallback-markup";
import { composeGraphPublicationQuery } from "./graph-publication-composer";
import {
  createDefaultGraphUrlState,
  searchGraphEntities
} from "./moirai-graph-source-query";

it("keeps no-script identities, revision links and diagnostics without streaming placeholders or executable data", () => {
  const state = createDefaultGraphUrlState();
  const entities = searchGraphEntities(state).map((entity) => ({
    ...entity,
    title: {
      ...entity.title,
      ko: '</noscript><script>alert("fixture")</script>&'
    }
  }));
  const result = composeGraphPublicationQuery(state.query, []);
  const markup = graphFallbackMarkup({ state, entities, result });
  expect(markup).toContain("Revision vector:");
  expect(markup).toContain("revision=7&amp;mq=");
  expect(markup).toContain(
    "&lt;/noscript&gt;&lt;script&gt;alert(&quot;fixture&quot;)&lt;/script&gt;&amp;"
  );
  expect(markup).not.toMatch(/<script|<template|<!--|\$RS/);
  expect(markup).toContain("all memberships:");
  expect(markup).toContain("Diagnostics");
});

it("keeps reader prose visible and source notes collapsed without JavaScript", () => {
  const state = createDefaultGraphUrlState();
  const result = composeGraphPublicationQuery(state.query, []);
  const base = {
    world_id: "world",
    canon_id: "canon",
    served_revision: 1,
    scope_type: "canon" as const,
    scope_id: "canon",
    locale: "ko",
    title: "설명",
    public_references: [{ label: "자료", url: "https://example.org/source" }]
  };
  const markup = graphFallbackMarkup({
    state,
    entities: [],
    result: {
      ...result,
      narratives: [
        {
          ...base,
          id: "prose",
          narrative_kind: "primary",
          body: "역사적 사건 설명"
        },
        {
          ...base,
          id: "note",
          narrative_kind: "annotation",
          body: "날짜 해석의 근거"
        }
      ]
    }
  });
  expect(markup).toContain("<p>역사적 사건 설명</p><details>");
  expect(markup).toContain(
    "<details><summary>주석과 출처 · Notes and sources</summary><h3>설명</h3><p>날짜 해석의 근거</p>"
  );
  expect(markup).not.toContain("<details open");
  expect(markup).toContain('href="https://example.org/source"');
});
