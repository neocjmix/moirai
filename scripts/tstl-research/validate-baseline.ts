/** B0 negative diagnostics use original final compiler contours. Center probes
 * can expose counterexamples, never certify full glyph support or exact atoms. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectTstlSemantics,
  tstlSignatures,
  validateTstlWorldGeometry,
  type TstlGeometryInput,
  type TstlPoint,
  type TstlTemporalRecord
} from "../../packages/graph-presentation/src/tstl-validator.js";
import { loadHistorySnapshot, type BaselineArtifact } from "./baseline.js";

export const HISTORY_COMPOSITES = {
  korea: "01a123a1-0000-751e-9e64-e7c7b6b89fbc",
  japan: "01a123a1-0000-77c0-8401-4f9db460625b",
  china: "01a1240c-0000-73dd-bea1-64db15136c48",
  imjin: "01a10a3f-05d2-7981-94f4-08f3ea6433ec",
  yiSunSin: "1f10a329-835d-79b1-a9c3-ae1835934b8b"
};
export function baselineTemporalRecords(
  artifact: BaselineArtifact
): TstlTemporalRecord[] {
  return artifact.layout.shapes.map((shape) => {
    const minY =
      shape.kind === "point"
        ? shape.position.y
        : shape.kind === "segment"
          ? shape.start.y
          : shape.bounds.minY;
    const maxY =
      shape.kind === "point"
        ? shape.position.y
        : shape.kind === "segment"
          ? shape.end.y
          : shape.bounds.maxY;
    return {
      eventId: shape.event_id,
      sourceY: (minY + maxY) / 2,
      descriptors: [
        {
          kind: "legacy-scalar-only",
          minY: Math.min(minY, maxY),
          maxY: Math.max(minY, maxY)
        }
      ]
    };
  });
}
function centerProbe(point: TstlPoint, polygon: readonly TstlPoint[]) {
  let inside = false;
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
          )
        )
      : 0;
    nearest = Math.min(
      nearest,
      Math.hypot(point.x - a.x - ratio * dx, point.y - a.y - ratio * dy)
    );
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return { inside, boundaryUncertain: nearest <= 1e-5 };
}
export function diagnoseBaseline(
  artifact: BaselineArtifact,
  snapshot = loadHistorySnapshot()
) {
  const projection = projectTstlSemantics({
    events: snapshot.events.map((e) => ({
      id: e.id,
      worldId: snapshot.worldId
    })),
    contains: snapshot.relations
      .filter((r) => r.type === "contains")
      .map((r) => ({ parentId: r.sourceId, childId: r.targetId })),
    complete: true
  });
  const regions = artifact.primitives.flatMap((primitive) =>
    primitive.geometry.kind === "polygon"
      ? primitive.geometry.rings.map((points, index) => ({
          id: `${primitive.id}:ring:${index}`,
          compositeId: primitive.entity.id,
          points
        }))
      : []
  );
  const glyphs = artifact.primitives.flatMap((primitive) =>
    primitive.geometry.kind === "point" &&
    projection.leafIds.includes(primitive.entity.id)
      ? [
          {
            eventId: primitive.entity.id,
            support: {
              minX: Math.floor(primitive.geometry.xy.x - 3.5),
              maxX: Math.ceil(primitive.geometry.xy.x + 3.5),
              minY: Math.floor(primitive.geometry.xy.y - 3.5),
              maxY: Math.ceil(primitive.geometry.xy.y + 3.5)
            }
          }
        ]
      : []
  );
  const temporal = baselineTemporalRecords(artifact);
  const geometry: TstlGeometryInput = {
    complete: true,
    carrierIds: projection.leafIds,
    placedCarrierIds: glyphs.map((g) => g.eventId),
    members: projection.leafMembers,
    glyphs,
    padding: 3,
    patches: [
      {
        id: "B0-world",
        minY: Math.floor(
          Math.min(
            ...regions.flatMap((r) => r.points.map((p) => p.y)),
            ...glyphs.map((g) => g.support.minY)
          ) - 4
        ),
        maxY: Math.ceil(
          Math.max(
            ...regions.flatMap((r) => r.points.map((p) => p.y)),
            ...glyphs.map((g) => g.support.maxY)
          ) + 4
        ),
        areaCompositeIds: projection.compositeIds,
        modeCue: true,
        regions
      }
    ]
  };
  const validation = validateTstlWorldGeometry(
    projection,
    temporal,
    temporal,
    geometry,
    { sourceYOrigin: 0, scale: 1, nominalHalfHeight: 3.5 }
  );
  const negativeProbes: {
    code: string;
    eventId: string;
    compositeId: string;
  }[] = [];
  let boundaryUncertain = 0;
  for (const glyph of glyphs) {
    const primitive = artifact.primitives.find(
      (p) => p.entity.id === glyph.eventId && p.geometry.kind === "point"
    )!;
    if (primitive.geometry.kind !== "point")
      throw Error("point_geometry_expected");
    const point = primitive.geometry.xy;
    for (const region of regions) {
      const probe = centerProbe(point, region.points);
      if (probe.boundaryUncertain) {
        boundaryUncertain++;
        continue;
      }
      const member = projection.leafMembers[region.compositeId]!.includes(
        glyph.eventId
      );
      if (member !== probe.inside)
        negativeProbes.push({
          code: member
            ? "CENTER_MEMBER_EXCLUSION"
            : "CENTER_NONMEMBER_INCLUSION",
          eventId: glyph.eventId,
          compositeId: region.compositeId
        });
    }
  }
  const diagnosticCounts = Object.fromEntries(
    [...new Set(validation.geometry.diagnostics.map((d) => d.code))]
      .sort()
      .map((code) => [
        code,
        validation.geometry.diagnostics.filter((d) => d.code === code).length
      ])
  );
  const { korea, japan, china, imjin } = HISTORY_COMPOSITES;
  return {
    formatVersion: "tstl-baseline-validation/1",
    geometryLevel: validation.geometry.level,
    semanticFillEligible: validation.semanticFillEligible,
    temporal: {
      mode: "legacy-scalar-only",
      records: temporal.length,
      sourceYPreserved: validation.temporal.valid,
      semanticTimeVerified: false
    },
    geometry: {
      hulls: regions.length,
      exactCertifiedHulls: 0,
      diagnosticCounts,
      unsupportedGeometryDisposition:
        "Original B0 sloped/floating contours are retained. Restricted exact validator cannot certify them; no rounding or replacement contour is substituted."
    },
    centerNecessaryConditionDiagnostics: {
      scope:
        "Floating center probes only; negative diagnostics, never a full-support/atom certificate or success rate",
      testedPairs: glyphs.length * regions.length,
      boundaryUncertain,
      memberExclusions: negativeProbes.filter(
        (p) => p.code === "CENTER_MEMBER_EXCLUSION"
      ).length,
      nonmemberInclusions: negativeProbes.filter(
        (p) => p.code === "CENTER_NONMEMBER_INCLUSION"
      ).length,
      examples: negativeProbes.slice(0, 12)
    },
    oracle: {
      events: projection.eventIds.length,
      composites: projection.compositeIds.length,
      leaves: projection.leafIds.length,
      kjcAtoms: tstlSignatures(projection, [korea, japan, china]),
      kjAtoms: tstlSignatures(projection, [korea, japan]),
      imjinLeaves: projection.leafMembers[imjin]!.length,
      imjinChinaSharedLeaves: projection.leafMembers[imjin]!.filter((id) =>
        projection.leafMembers[china]!.includes(id)
      ).length,
      imjinDirectParents: projection.parents[imjin]
    }
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const artifact = JSON.parse(
    readFileSync("scripts/tstl-research/evidence/b0.json", "utf8")
  ) as BaselineArtifact;
  const result = diagnoseBaseline(artifact);
  writeFileSync(
    "scripts/tstl-research/evidence/b0-validation.json",
    JSON.stringify(result, null, 2) + "\n"
  );
  console.log(
    JSON.stringify(
      {
        geometryLevel: result.geometryLevel,
        semanticFillEligible: result.semanticFillEligible,
        geometry: result.geometry,
        probes: result.centerNecessaryConditionDiagnostics
      },
      null,
      2
    )
  );
}
