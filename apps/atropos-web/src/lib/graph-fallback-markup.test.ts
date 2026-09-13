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
