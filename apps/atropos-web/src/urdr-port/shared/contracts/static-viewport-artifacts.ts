import { z } from "zod";

const BAND_INDEX_WIDTH = 6;
const GRAPH_STATIC_ABSOLUTE_PATH_PATTERN = /^\/graph-static(?:\/[A-Za-z0-9._:%-]+)+$/;
const GRAPH_STATIC_BASE_PATH_PATTERN = /^\/graph-static(?:\/[A-Za-z0-9._:%-]+)*$/;
const GRAPH_STATIC_TEMPLATE_PATH_PATTERN = /^\/graph-static(?:\/[A-Za-z0-9._:%{}-]+)+$/;

function hasUnsafePathSegments(value: string) {
  const segments = value.split("/").slice(1);
  if (value.includes("\\")) {
    return true;
  }

  return segments.some((segment) => {
    if (segment.length === 0) {
      return true;
    }
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return true;
    }
    return (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded.includes("..")
    );
  });
}

const graphStaticAbsolutePathSchema = z.string().min(1).refine(
  (value) => GRAPH_STATIC_ABSOLUTE_PATH_PATTERN.test(value) && !hasUnsafePathSegments(value),
  "Expected a confined /graph-static path.",
);

const graphStaticBasePathSchema = z.string().min(1).refine(
  (value) => GRAPH_STATIC_BASE_PATH_PATTERN.test(value) && !hasUnsafePathSegments(value),
  "Expected a confined /graph-static base path.",
);

const graphStaticTemplatePathSchema = z.string().min(1).refine(
  (value) => GRAPH_STATIC_TEMPLATE_PATH_PATTERN.test(value) && !hasUnsafePathSegments(value) && value.includes("{band}"),
  "Expected a confined /graph-static template path containing {band}.",
);

const graphStaticObjectDocTemplatePathSchema = z.string().min(1).refine(
  (value) => GRAPH_STATIC_TEMPLATE_PATH_PATTERN.test(value) && !hasUnsafePathSegments(value) && value.includes("{yBand}"),
  "Expected a confined /graph-static template path containing {yBand}.",
);

export const staticArtifactClassSchema = z.enum(["point", "segment", "region"]);
export type StaticArtifactClass = z.infer<typeof staticArtifactClassSchema>;

const editorialRoleSchema = z.enum(["declaration", "anchor", "boundary", "ordinary", "composite"]);
const editorialImportanceSchema = z.enum(["critical", "major", "supporting", "incidental"]);
const editorialContentDensitySchema = z.enum(["detail", "event", "process", "omit"]);
const editorialCertaintyPostureSchema = z.enum(["direct", "cautious", "direct_but_not_overprecise", "dispute_visible"]);
const graphEntityEditorialSchema = z.object({
  role: editorialRoleSchema,
  importance: editorialImportanceSchema,
  contentDensity: editorialContentDensitySchema,
  certaintyPosture: editorialCertaintyPostureSchema,
});

const chartPlaneDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "error"]),
  message: z.string(),
});

const graphShellChartPlaneEntityBaseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  canonId: z.string(),
  label: z.string(),
  geometryKind: staticArtifactClassSchema,
  validationState: z.enum(["ok", "warning", "error"]),
  contains: z.array(z.string()).default([]),
  containedBy: z.string().optional(),
  diagnostics: z.array(chartPlaneDiagnosticSchema).default([]),
  viewportClass: z.enum(["visible", "context-retained", "clipped", "hidden"]).default("visible"),
  editorial: graphEntityEditorialSchema.optional(),
});

const graphShellChartPlaneEntitySchema = z.discriminatedUnion("geometryKind", [
  graphShellChartPlaneEntityBaseSchema.extend({
    geometryKind: z.literal("point"),
    position: z.object({ x: z.number(), y: z.number() }),
  }),
  graphShellChartPlaneEntityBaseSchema.extend({
    geometryKind: z.literal("segment"),
    start: z.object({ x: z.number(), y: z.number() }),
    end: z.object({ x: z.number(), y: z.number() }),
  }),
  graphShellChartPlaneEntityBaseSchema.extend({
    geometryKind: z.literal("region"),
    worldBounds: z.object({ minX: z.number(), minY: z.number(), maxX: z.number(), maxY: z.number() }),
  }),
]);

const eventRelatedItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  sourceKind: z.enum(["structural", "semantic", "both"]).optional(),
});

const eventDetailResponseSchema = z.object({
  id: z.string(),
  canonId: z.string(),
  type: z.string(),
  title: z.string(),
  notes: z.string(),
  participantEventIds: z.array(z.string()).default([]),
  figureHandleIds: z.array(z.string()).default([]),
  contextEventIds: z.array(z.string()).default([]),
  chronology: z.object({ authored: z.array(z.unknown()).default([]) }).optional(),
  chronologySummary: z.string().optional(),
  placeEvents: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  people: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  causeEvents: z.array(eventRelatedItemSchema).default([]),
  resultEvents: z.array(eventRelatedItemSchema).default([]),
  editorial: z.object({
    classification: z.object({
      role: editorialRoleSchema,
      importance: editorialImportanceSchema,
      contentDensity: editorialContentDensitySchema,
      certaintyPosture: editorialCertaintyPostureSchema,
      policyVersion: z.number().int().positive().default(1),
    }),
    notesStatus: z.enum(["none", "authored", "generated", "reviewed"]).optional(),
    authoredAt: z.string().optional(),
    authoredBy: z.string().optional(),
  }).optional(),
  identityDeclaration: z.object({
    role: z.string(),
    identityKind: z.string(),
    label: z.string(),
    description: z.string().optional(),
  }).optional(),
});

export const staticGraphCurrentSchema = z.object({
  revisionId: z.string().min(1),
  manifestPath: graphStaticAbsolutePathSchema,
});
export type StaticGraphCurrent = z.infer<typeof staticGraphCurrentSchema>;

export const staticGraphLocaleManifestSchema = z.object({
  workspacePath: graphStaticAbsolutePathSchema,
  chartPlanePath: graphStaticAbsolutePathSchema,
  viewportMetaPath: graphStaticAbsolutePathSchema,
  eventDetailsBasePath: graphStaticBasePathSchema,
});
export type StaticGraphLocaleManifest = z.infer<typeof staticGraphLocaleManifestSchema>;

export const staticGraphManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  revisionId: z.string().min(1),
  canonicalRevision: z.number().int().nonnegative(),
  projectionRevision: z.number().int().nonnegative(),
  lodLevel: z.number().int().nonnegative(),
  locales: z.record(staticGraphLocaleManifestSchema),
});
export type StaticGraphManifest = z.infer<typeof staticGraphManifestSchema>;

export const staticProjectionCompletenessSchema = z.object({
  status: z.enum(["complete", "partial"]),
  notes: z.array(z.string()).default([]),
});
export type StaticProjectionCompleteness = z.infer<typeof staticProjectionCompletenessSchema>;

export const staticProjectionRootManifestSchema = z.object({
  revisionId: z.string().min(1),
  schemaVersion: z.string().min(1),
  builtAt: z.string().min(1),
  defaultTimeLevel: z.string().min(1),
  supportedTimeLevels: z.array(z.string().min(1)).min(1),
  scopes: z.array(z.string().min(1)).min(1),
  scopeMetaBasePath: graphStaticBasePathSchema,
  pathTemplate: z.object({
    band: graphStaticTemplatePathSchema,
  }),
  completeness: staticProjectionCompletenessSchema,
});
export type StaticProjectionRootManifest = z.infer<typeof staticProjectionRootManifestSchema>;

export const staticProjectionArtifactSchema = z.object({
  revisionId: z.string().min(1),
  scopeKey: z.string().min(1),
  timeLevel: z.string().min(1),
  yBand: z.string().min(1),
  artifactClass: z.string().min(1),
  artifactType: z.string().min(1),
  artifactId: z.string().min(1),
  y: z.number(),
  localX: z.number().optional(),
  sourceEventIds: z.array(z.string().min(1)).min(1),
  sourceRelationIds: z.array(z.string().min(1)).optional(),
  payload: z.record(z.string(), z.unknown()),
});
export type StaticProjectionArtifact = z.infer<typeof staticProjectionArtifactSchema>;

export const staticProjectionObjectDocSchema = z.object({
  revisionId: z.string().min(1),
  scopeKey: z.string().min(1),
  timeLevel: z.string().min(1),
  yBand: z.string().min(1),
  artifactClass: z.string().min(1),
  artifacts: z.array(staticProjectionArtifactSchema),
});
export type StaticProjectionObjectDoc = z.infer<typeof staticProjectionObjectDocSchema>;

export const staticProjectionScopeLevelMetaSchema = z.object({
  bandSize: z.number().positive(),
  classes: z.array(z.string().min(1)).min(1),
  preferredGap: z.number().nonnegative().default(0),
  widthHint: z.number().positive().default(1),
  pathTemplate: graphStaticObjectDocTemplatePathSchema,
});
export type StaticProjectionScopeLevelMeta = z.infer<typeof staticProjectionScopeLevelMetaSchema>;

export const staticProjectionScopeMetaSchema = z.object({
  scopeKey: z.string().min(1),
  defaultTimeLevel: z.string().min(1),
  supportedTimeLevels: z.array(z.string().min(1)).min(1),
  levels: z.record(staticProjectionScopeLevelMetaSchema),
});
export type StaticProjectionScopeMeta = z.infer<typeof staticProjectionScopeMetaSchema>;

export const staticViewportEntityIndexEntrySchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  canonId: z.string().min(1),
  geometryKind: staticArtifactClassSchema,
  contains: z.array(z.string()).default([]),
  containedBy: z.string().optional(),
  bandIndices: z.array(z.number().int()).default([]),
});
export type StaticViewportEntityIndexEntry = z.infer<typeof staticViewportEntityIndexEntrySchema>;

export const staticViewportCoverageRangeSchema = z.object({
  minBandIndex: z.number().int(),
  maxBandIndex: z.number().int(),
});
export type StaticViewportCoverageRange = z.infer<typeof staticViewportCoverageRangeSchema>;

export const staticViewportCanonMetaSchema = z.object({
  scopeKey: z.string().min(1),
  preferredGap: z.number().nonnegative().default(0),
  widthHint: z.number().positive().default(1),
  pathTemplateByClass: z.object({
    point: graphStaticTemplatePathSchema.optional(),
    segment: graphStaticTemplatePathSchema.optional(),
    region: graphStaticTemplatePathSchema.optional(),
  }).default({}),
  coverageByClass: z.object({
    point: staticViewportCoverageRangeSchema.optional(),
    segment: staticViewportCoverageRangeSchema.optional(),
    region: staticViewportCoverageRangeSchema.optional(),
  }).default({}),
  entityIndex: z.record(staticViewportEntityIndexEntrySchema),
});
export type StaticViewportCanonMeta = z.infer<typeof staticViewportCanonMetaSchema>;

export const staticViewportLevelMetaSchema = z.object({
  bandSize: z.number().positive(),
  classes: z.array(staticArtifactClassSchema).min(1),
  canons: z.record(staticViewportCanonMetaSchema),
});
export type StaticViewportLevelMeta = z.infer<typeof staticViewportLevelMetaSchema>;

export const staticViewportMetaSchema = z.object({
  compatibilityKey: z.string().min(1),
  timeSystemId: z.string().min(1),
  diagnostics: z.array(chartPlaneDiagnosticSchema).default([]),
  defaultTimeLevel: z.string().min(1),
  supportedTimeLevels: z.array(z.string().min(1)).min(1),
  levels: z.record(staticViewportLevelMetaSchema),
});
export type StaticViewportMeta = z.infer<typeof staticViewportMetaSchema>;

export const staticBandDocumentSchema = z.object({
  revisionId: z.string().min(1),
  locale: z.string().min(1),
  canonId: z.string().min(1),
  currentTimeLevel: z.string().min(1),
  artifactClass: staticArtifactClassSchema,
  bandIndex: z.number().int(),
  bandMinY: z.number(),
  bandMaxY: z.number(),
  artifacts: z.array(graphShellChartPlaneEntitySchema),
});
export type StaticBandDocument = z.infer<typeof staticBandDocumentSchema>;

export const staticEventDetailDocumentSchema = eventDetailResponseSchema;
export type StaticEventDetailDocument = z.infer<typeof staticEventDetailDocumentSchema>;

export function formatStaticBandIndex(index: number) {
  const absolute = Math.abs(index).toString().padStart(BAND_INDEX_WIDTH, "0");
  return index < 0 ? `n${absolute}` : absolute;
}

export function encodeStaticGraphPathSegment(segment: string) {
  return encodeURIComponent(segment);
}

export function assertStaticGraphRelativePath(relativePath: string) {
  if (!relativePath.startsWith("/graph-static/")) {
    throw new Error(`Expected /graph-static path, received ${relativePath}.`);
  }
  if (hasUnsafePathSegments(relativePath)) {
    throw new Error(`Unsafe graph-static path: ${relativePath}.`);
  }
  return relativePath;
}

function buildStaticBandBasePath(rootPrefix: string, locale: string, canonId: string, timeLevel: string, artifactClass: StaticArtifactClass) {
  return `${rootPrefix}/${encodeStaticGraphPathSegment(locale)}/canons/${encodeStaticGraphPathSegment(canonId)}/levels/${encodeStaticGraphPathSegment(timeLevel)}/classes/${artifactClass}/bands`;
}

export function buildStaticBandPathForRoot(params: {
  rootPrefix: string;
  locale: string;
  canonId: string;
  timeLevel: string;
  artifactClass: StaticArtifactClass;
  bandIndex: number;
}) {
  return assertStaticGraphRelativePath(
    `${buildStaticBandBasePath(params.rootPrefix, params.locale, params.canonId, params.timeLevel, params.artifactClass)}/${formatStaticBandIndex(params.bandIndex)}.json`,
  );
}

export function buildStaticBandPathTemplateForRoot(params: {
  rootPrefix: string;
  localeToken?: string;
  canonId: string;
  timeLevel: string;
  artifactClass: StaticArtifactClass;
}) {
  const locale = params.localeToken ?? "{locale}";
  return assertStaticGraphRelativePath(
    `${params.rootPrefix}/${locale}/canons/${encodeStaticGraphPathSegment(params.canonId)}/levels/${encodeStaticGraphPathSegment(params.timeLevel)}/classes/${params.artifactClass}/bands/{band}.json`,
  );
}

export function buildStaticBandPath(params: {
  revisionId: string;
  locale: string;
  canonId: string;
  timeLevel: string;
  artifactClass: StaticArtifactClass;
  bandIndex: number;
}) {
  return buildStaticBandPathForRoot({
    rootPrefix: `/graph-static/revisions/${encodeStaticGraphPathSegment(params.revisionId)}`,
    locale: params.locale,
    canonId: params.canonId,
    timeLevel: params.timeLevel,
    artifactClass: params.artifactClass,
    bandIndex: params.bandIndex,
  });
}

export function buildStaticBandPathTemplate(params: {
  canonId: string;
  timeLevel: string;
  artifactClass: StaticArtifactClass;
}) {
  return buildStaticBandPathTemplateForRoot({
    rootPrefix: "/graph-static/revisions/{revisionId}",
    canonId: params.canonId,
    timeLevel: params.timeLevel,
    artifactClass: params.artifactClass,
  });
}

export function resolveStaticBandPathTemplate(pathTemplate: string, params: { revisionId: string; locale: string; bandIndex: number }) {
  return assertStaticGraphRelativePath(
    pathTemplate
      .replace(/\{revisionId\}/g, encodeStaticGraphPathSegment(params.revisionId))
      .replace(/\{locale\}/g, encodeStaticGraphPathSegment(params.locale))
      .replace("{band}", formatStaticBandIndex(params.bandIndex)),
  );
}

export function buildStaticScopeMetaPath(params: { revisionId: string; scopeKey: string }) {
  return assertStaticGraphRelativePath(
    `/graph-static/revisions/${encodeStaticGraphPathSegment(params.revisionId)}/scopes/${encodeStaticGraphPathSegment(params.scopeKey)}/meta.json`,
  );
}

export function buildStaticProjectionObjectDocPath(params: {
  revisionId: string;
  scopeKey: string;
  timeLevel: string;
  yBand: string;
  artifactClass: string;
}) {
  return assertStaticGraphRelativePath(
    `/graph-static/revisions/${encodeStaticGraphPathSegment(params.revisionId)}/scopes/${encodeStaticGraphPathSegment(params.scopeKey)}/levels/${encodeStaticGraphPathSegment(params.timeLevel)}/bands/${encodeStaticGraphPathSegment(params.yBand)}/${encodeStaticGraphPathSegment(params.artifactClass)}.json`,
  );
}

export function buildStaticProjectionObjectDocPathTemplate(params: {
  scopeKey: string;
  timeLevel: string;
  artifactClass?: string;
}) {
  const artifactClass = params.artifactClass ?? "{artifactClass}";
  return assertStaticGraphRelativePath(
    `/graph-static/revisions/{revisionId}/scopes/${encodeStaticGraphPathSegment(params.scopeKey)}/levels/${encodeStaticGraphPathSegment(params.timeLevel)}/bands/{yBand}/${artifactClass === "{artifactClass}" ? artifactClass : encodeStaticGraphPathSegment(artifactClass)}.json`,
  );
}
