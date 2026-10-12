import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BASELINE_SOURCE_SHA,
  DOCUMENTED_FIXTURE_SHA256,
  HISTORY_FIXTURE_PATH,
  OBSERVED_FIXTURE_SHA256,
  baselineSvg,
  jsonDigest,
  loadHistorySnapshot,
  reconstructBaselineInput,
  replayBaseline,
  sha256
} from "./baseline.js";

describe("TSTL current B0 replay", () => {
  it("pins unchanged actual bytes and reports the handoff mismatch rather than rewriting the fixture", () => {
    expect(sha256(readFileSync(HISTORY_FIXTURE_PATH))).toBe(
      OBSERVED_FIXTURE_SHA256
    );
    expect(OBSERVED_FIXTURE_SHA256).not.toBe(DOCUMENTED_FIXTURE_SHA256);
    const snapshot = loadHistorySnapshot();
    expect(snapshot.sourceRootDigest).toBe(
      "d2a6f32a3aec21e222c094363615c9f7ac4f8c3e0654106e3206c2c37d546a54"
    );
    expect(snapshot.input.incidence).toBeUndefined();
    const input = reconstructBaselineInput(snapshot);
    expect(input.incidence?.events).toEqual(snapshot.events);
    expect(input.incidence?.relations).toEqual(snapshot.relations);
    expect(input.incidence?.collections).toEqual(snapshot.collections);
    expect(snapshot.input.incidence).toBeUndefined();
  });

  it("replays current X, time geometry and compiled contains hulls with every Event represented once", () => {
    const { artifact } = replayBaseline();
    expect(artifact.sourceSha).toBe(BASELINE_SOURCE_SHA);
    expect(artifact.layout.algorithm_version).toBe("global-incidence/1");
    expect(artifact.digests.shapes).toBe(
      "6032f46d8b340c9e5d610e4388e12e35940f92d57432e77dfb992f7bca33d545"
    );
    expect(artifact.digests.renderPrimitives).toBe(
      "e56829aeeef792280487f0fccfb29e90197de4956ef02c9810b615b7077a3413"
    );
    expect(artifact.counts).toMatchObject({
      events: 539,
      composites: 109,
      leaves: 430,
      containsEdges: 614,
      collections: 7,
      collectionMemberships: 1112,
      scalarExtents: 536,
      placed: 539,
      unplaced: 0,
      renderEventIds: 539,
      renderOmittedEventIds: []
    });
    const events = artifact.primitives.filter(
      (p) => p.entity.kind !== "relation"
    );
    expect(new Set(events.map((p) => p.entity.id)).size).toBe(events.length);
    expect(events.filter((p) => p.geometry.kind === "polygon")).toHaveLength(
      109
    );
    expect(artifact.provenance.temporalSupport).toBe("legacy-scalar-only");
    expect(artifact.provenance.documentedByteDigestMatches).toBe(false);
    // The checked-in replay is executable evidence, not an old quoted shape digest.
    const recorded = JSON.parse(
      readFileSync("scripts/tstl-research/evidence/b0.json", "utf8")
    );
    expect(jsonDigest(artifact)).toBe(jsonDigest(recorded));
    const svg = baselineSvg(artifact);
    expect(svg.match(/<polygon /g)).toHaveLength(109);
    expect(svg).toContain('fill="none"');
    expect(svg).toContain("Legacy scalar temporal support only");
  });
});
