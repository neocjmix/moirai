import { z } from "zod";

export const preferredIdentityKinds = ["person", "organization", "group", "artifact", "character", "place"] as const;
export const identityKindSchema = z.string().min(1);
export type IdentityKind = z.infer<typeof identityKindSchema>;

export const canonicalEventTypes = [
  "temporal-anchor",
  "instant",
  "composite",
  "durative-composite",
  "existential-composite",
  "causal-composite"
] as const;
export const canonicalEventTypeSchema = z.string().min(1);
export type CanonicalEventType = z.infer<typeof canonicalEventTypeSchema>;

export const preferredRelationTypes = [
  "contains",
  "contained-in",
  "boundary-of",
  "starts",
  "ends",
  "before",
  "after",
  "not-before",
  "not-after",
  "overlaps",
  "causes",
  "retro-causes",
  "enables",
  "prevents",
  "influences",
  "same-subject",
  "belongs-to-existence",
  "continues-identity-of"
] as const;
export const relationTypeSchema = z.string().min(1);
export type RelationType = z.infer<typeof relationTypeSchema>;

export type TemporalRelationDirection = "forward" | "reverse" | "none";

const forwardTemporalRelationTypes = new Set([
  "before",
  "precedes",
  "causes",
  "enables",
  "influences"
]);

const reverseTemporalRelationTypes = new Set([
  "after",
  "not-before",
  "retro-causes"
]);

const forwardStructuralRelationKinds = new Set(["PRECEDES", "CAUSES"]);

export function getTemporalDirectionForRelationType(type: string): TemporalRelationDirection {
  const normalized = type.trim().toLowerCase();
  if (forwardTemporalRelationTypes.has(normalized)) {
    return "forward";
  }

  if (reverseTemporalRelationTypes.has(normalized)) {
    return "reverse";
  }

  if (normalized === "not-after") {
    return "forward";
  }

  return "none";
}

export function getTemporalDirectionForStructuralLinkKind(type: string): TemporalRelationDirection {
  return forwardStructuralRelationKinds.has(type.trim().toUpperCase()) ? "forward" : "none";
}

export const structuralLinkKindSchema = z.enum(["PRECEDES", "CAUSES", "PART_OF_PROCESS"]);
export type StructuralLinkKind = z.infer<typeof structuralLinkKindSchema>;

export const preferredSemanticLinkKinds = ["FIGURE_MEMBER", "INTERPRETS", "CROSSOVER_WITH", "CARRIES_OVER", "INVERTED_FROM", "BOOTSTRAPS"] as const;
export const semanticLinkKindSchema = z.string().min(1);
export type SemanticLinkKind = z.infer<typeof semanticLinkKindSchema>;

export const preferredChronologySchemes = [
  "structural",
  "gregorian_utc",
  "julian",
  "joseon_annals",
  "regnal",
  "star-wars-galactic-standard",
  "dune-imperial-reckoning",
  "middle-earth-ages",
  "loop-structural-order"
] as const;
export const chronologySchemeSchema = z.string().min(1);
export type ChronologyScheme = z.infer<typeof chronologySchemeSchema>;

export const chronologyPrecisionSchema = z.enum(["year", "month", "day", "minute", "second"]);
export type ChronologyPrecision = z.infer<typeof chronologyPrecisionSchema>;

export const chronologyCertaintySchema = z.enum(["exact", "approximate", "inferred", "disputed"]);
export type ChronologyCertainty = z.infer<typeof chronologyCertaintySchema>;

export const chronologySourceSchema = z.enum(["authored", "computed", "imported"]);
export type ChronologySource = z.infer<typeof chronologySourceSchema>;

export const chronologyEraSchema = z.enum(["BCE", "CE"]);
export type ChronologyEra = z.infer<typeof chronologyEraSchema>;

export const temporalPointSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  second: z.number().int().min(0).max(59).optional(),
  era: chronologyEraSchema.optional().default("CE"),
  timezone: z.string().optional().default("UTC")
});
export type TemporalPoint = z.infer<typeof temporalPointSchema>;

export const chronologyRangeSchema = z.object({
  start: temporalPointSchema,
  end: temporalPointSchema,
  boundaryMode: z.enum(["closed", "open", "half_open"]).optional().default("closed")
});
export type ChronologyRange = z.infer<typeof chronologyRangeSchema>;

export const joseonAnnalsGregorianCompatibilitySchema = z.object({
  instant: temporalPointSchema.optional(),
  range: chronologyRangeSchema.optional(),
  precision: chronologyPrecisionSchema,
  certainty: chronologyCertaintySchema.optional().default("approximate"),
  label: z.string().optional().default("")
});
export type JoseonAnnalsGregorianCompatibility = z.infer<typeof joseonAnnalsGregorianCompatibilitySchema>;

export const joseonAnnalsAnchorMetadataSchema = z.object({
  reignLabel: z.string().min(1),
  regnalYear: z.number().int().positive(),
  lunarMonth: z.number().int().min(1).max(12).optional(),
  isLeapMonth: z.boolean().optional().default(false),
  day: z.number().int().min(1).max(30).optional(),
  annalsLabel: z.string().optional(),
  provenance: z.string().optional(),
  gregorianCompatibility: joseonAnnalsGregorianCompatibilitySchema.optional()
});
export type JoseonAnnalsAnchorMetadata = z.infer<typeof joseonAnnalsAnchorMetadataSchema>;

export const worldAnchorSchema = z.object({
  scheme: chronologySchemeSchema,
  instant: temporalPointSchema.optional(),
  range: chronologyRangeSchema.optional(),
  precision: chronologyPrecisionSchema.optional(),
  certainty: chronologyCertaintySchema.optional().default("exact"),
  source: chronologySourceSchema.optional().default("authored"),
  label: z.string().optional().default(""),
  metadata: z.record(z.unknown()).optional()
});
export type WorldAnchor = z.infer<typeof worldAnchorSchema>;

export const provenanceSchema = z.object({
  source: z.string().optional(),
  sourceType: z.string().optional(),
  author: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  note: z.string().optional()
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const eventChronologySchema = z.object({
  authored: z.array(worldAnchorSchema).default([])
});
export type EventChronology = z.infer<typeof eventChronologySchema>;

export const worldSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  canonIds: z.array(z.string()).default([])
});
export type WorldRecord = z.infer<typeof worldSchema>;

export const updateWorldInputSchema = z.object({
  label: z.string().min(1).optional(),
  canonIds: z.array(z.string()).default([]).optional(),
});
export type UpdateWorldInput = z.infer<typeof updateWorldInputSchema>;

export const timeSystemKindSchema = z.enum(["calendar", "relative", "mixed"]);
export type TimeSystemKind = z.infer<typeof timeSystemKindSchema>;

export const timeSystemSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  kind: timeSystemKindSchema,
  compatibilityKey: z.string().min(1),
  description: z.string().optional()
});
export type TimeSystemRecord = z.infer<typeof timeSystemSchema>;

export const canonSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  label: z.string().min(1),
  timeSystemId: z.string().min(1)
});
export type CanonRecord = z.infer<typeof canonSchema>;

export const adminWorldSchema = worldSchema;
export type AdminWorldRecord = WorldRecord;

export const adminTimeSystemSchema = timeSystemSchema;
export type AdminTimeSystemRecord = TimeSystemRecord;

export const adminCanonSchema = canonSchema;
export type AdminCanonRecord = CanonRecord;

export const updateCanonInputSchema = z.object({
  label: z.string().min(1).optional(),
  worldId: z.string().min(1).optional(),
  timeSystemId: z.string().min(1).optional(),
});
export type UpdateCanonInput = z.infer<typeof updateCanonInputSchema>;

export const adminMetadataBundleSchema = z.object({
  worlds: z.array(adminWorldSchema).default([]),
  timeSystems: z.array(adminTimeSystemSchema).default([]),
  canons: z.array(adminCanonSchema).default([])
});
export type AdminMetadataBundle = z.infer<typeof adminMetadataBundleSchema>;

export const figureHandleSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  memberDeclarationEventIds: z.array(z.string()).default([])
});
export const updateFigureHandleInputSchema = z.object({
  label: z.string().min(1).optional(),
  memberDeclarationEventIds: z.array(z.string()).default([]).optional(),
});
export type UpdateFigureHandleInput = z.infer<typeof updateFigureHandleInputSchema>;

export const subjectSchema = z.object({
  id: z.string(),
  canonId: z.string(),
  kind: identityKindSchema,
  label: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional().default("")
});
export type Subject = {
  id: string;
  canonId: string;
  kind: IdentityKind;
  label: string;
  slug?: string;
  description: string;
};

export type FigureHandleRecord = z.infer<typeof figureHandleSchema>;

export const identityDeclarationSchema = z.object({
  role: z.literal("IDENTITY_DECLARATION"),
  identityKind: identityKindSchema,
  label: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().optional().default("")
});
export type IdentityDeclaration = z.infer<typeof identityDeclarationSchema>;

export const EVENT_NOTES_FORMAT = "markdown" as const;
export const eventNotesSchema = z.string().optional().default("");

export const editorialRoleSchema = z.enum(["declaration", "anchor", "boundary", "ordinary", "composite"]);
export type EditorialRole = z.infer<typeof editorialRoleSchema>;

export const editorialImportanceSchema = z.enum(["critical", "major", "supporting", "incidental"]);
export type EditorialImportance = z.infer<typeof editorialImportanceSchema>;

export const editorialContentDensitySchema = z.enum(["detail", "event", "process", "omit"]);
export type EditorialContentDensity = z.infer<typeof editorialContentDensitySchema>;

export const editorialCertaintyPostureSchema = z.enum(["direct", "cautious", "direct_but_not_overprecise", "dispute_visible"]);
export type EditorialCertaintyPosture = z.infer<typeof editorialCertaintyPostureSchema>;

export const editorialClassificationSchema = z.object({
  role: editorialRoleSchema,
  importance: editorialImportanceSchema,
  contentDensity: editorialContentDensitySchema,
  certaintyPosture: editorialCertaintyPostureSchema,
  policyVersion: z.number().int().positive().default(1),
});
export type EditorialClassification = z.infer<typeof editorialClassificationSchema>;

export const eventNoteValidationDecisionSchema = z.enum(["accept", "revise"]);
export type EventNoteValidationDecision = z.infer<typeof eventNoteValidationDecisionSchema>;

export const eventNoteValidationRequestSchema = z.object({
  classification: editorialClassificationSchema,
  notesDraft: z.string(),
  workflowRunReceipt: z.object({
    version: z.literal(1),
    eventId: z.string().min(1),
    workflowId: z.string().min(1),
    skillVersion: z.string().min(1),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    nonce: z.string().min(1),
    signature: z.string().min(1),
  }),
  requiredCoverage: z.array(z.string()).default([]),
  requiredAbsoluteUrls: z.array(z.string().url()).default([]),
  requiredLinkTargets: z.array(z.string()).default([]),
  rubricChecks: z.array(z.string()).default([]),
});
export type EventNoteValidationRequest = z.infer<typeof eventNoteValidationRequestSchema>;

export const eventNoteValidationRubricScoresSchema = z.object({
  eventGrounding: z.number().int().min(0).max(2),
  importanceFit: z.number().int().min(0).max(2),
  densityFit: z.number().int().min(0).max(2),
  certaintyHandling: z.number().int().min(0).max(2),
  coverageCompleteness: z.number().int().min(0).max(2),
  linkCompliance: z.number().int().min(0).max(2),
  readability: z.number().int().min(0).max(2),
});
export type EventNoteValidationRubricScores = z.infer<typeof eventNoteValidationRubricScoresSchema>;

export const eventNoteValidationReportSchema = z.object({
  scoreTotal: z.number().int().min(0),
  decision: eventNoteValidationDecisionSchema,
  failReasons: z.array(z.string()).default([]),
  hardFail: z.boolean().default(false),
  rubricScores: eventNoteValidationRubricScoresSchema,
  normalizedHints: z.array(z.string()).default([]),
});
export type EventNoteValidationReport = z.infer<typeof eventNoteValidationReportSchema>;

export const eventNoteApprovalArtifactSchema = z.object({
  version: z.literal(1),
  validationRecordId: z.string().min(1),
  eventId: z.string(),
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
  workflowNonce: z.string().min(1),
  noteDigest: z.string().min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signature: z.string().min(1),
});
export type EventNoteApprovalArtifact = z.infer<typeof eventNoteApprovalArtifactSchema>;

export const eventNoteWorkflowRunReceiptSchema = eventNoteValidationRequestSchema.shape.workflowRunReceipt;
export type EventNoteWorkflowRunReceipt = z.infer<typeof eventNoteWorkflowRunReceiptSchema>;

export const eventNoteValidationResponseSchema = z.object({
  eventId: z.string(),
  report: eventNoteValidationReportSchema,
  approvalArtifact: eventNoteApprovalArtifactSchema.optional(),
});
export type EventNoteValidationResponse = z.infer<typeof eventNoteValidationResponseSchema>;

export const eventNoteWorkflowMetadataSchema = z.object({
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
  validationIssuedAt: z.string().datetime(),
  validationExpiresAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  noteDigest: z.string().min(1),
});
export type EventNoteWorkflowMetadata = z.infer<typeof eventNoteWorkflowMetadataSchema>;

export const eventNotePublishRequestSchema = z.object({
  notes: z.string(),
  approvalArtifact: eventNoteApprovalArtifactSchema,
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
});
export type EventNotePublishRequest = z.infer<typeof eventNotePublishRequestSchema>;

export const graphShellAbsoluteLinkSchema = z.object({
  targetEventId: z.string().min(1),
  absoluteUrl: z.string().url()
});
export type GraphShellAbsoluteLink = z.infer<typeof graphShellAbsoluteLinkSchema>;

export const eventNoteManifestStatusSchema = z.enum(["pending", "drafted", "evaluated", "revised", "accepted"]);
export type EventNoteManifestStatus = z.infer<typeof eventNoteManifestStatusSchema>;

export const eventNoteAuthoringContextSchema = z.object({
  eventId: z.string().min(1),
  eventDetail: z.lazy(() => eventDetailResponseSchema),
  workflowRunReceipt: eventNoteWorkflowRunReceiptSchema.optional(),
  selectedTimelineId: z.string().min(1).optional(),
  enabledCanonIds: z.array(z.string().min(1)).default([]),
  targetRole: editorialRoleSchema.optional(),
  targetImportance: editorialImportanceSchema.optional(),
  targetDensity: editorialContentDensitySchema.optional(),
  certaintyPosture: editorialCertaintyPostureSchema.optional(),
  requiredCoverage: z.array(z.string().min(1)).default([]),
  requiredLinkTargets: z.array(z.string().min(1)).default([]),
  requiredAbsoluteUrls: z.array(z.string().url()).default([]),
  rubricChecks: z.array(z.string().min(1)).default([]),
  status: eventNoteManifestStatusSchema.optional(),
  graphShellLinks: z.array(graphShellAbsoluteLinkSchema).default([])
}).superRefine((value, ctx) => {
  if (value.eventDetail.id !== value.eventId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `event detail id ${value.eventDetail.id} does not match authoring context event ${value.eventId}`,
      path: ["eventDetail", "id"]
    });
  }

  const availableTargetIds = new Set(value.graphShellLinks.map((link) => link.targetEventId));
  const availableAbsoluteUrls = new Set(value.graphShellLinks.map((link) => link.absoluteUrl));

  for (const targetEventId of value.requiredLinkTargets) {
    if (!availableTargetIds.has(targetEventId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `missing graph-shell link for required target ${targetEventId}`,
        path: ["graphShellLinks"]
      });
    }
  }

  for (const absoluteUrl of value.requiredAbsoluteUrls) {
    if (!availableAbsoluteUrls.has(absoluteUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `missing graph-shell link for required absolute url ${absoluteUrl}`,
        path: ["graphShellLinks"]
      });
    }
  }
});
export type EventNoteAuthoringContext = z.infer<typeof eventNoteAuthoringContextSchema>;

export const editorialMetadataSchema = z.object({
  classification: editorialClassificationSchema,
  notesStatus: z.enum(["none", "authored", "generated", "reviewed"]).optional(),
  authoredAt: z.string().optional(),
  authoredBy: z.string().optional(),
});
export type EditorialMetadata = z.infer<typeof editorialMetadataSchema>;

export const graphEntityEditorialSchema = editorialClassificationSchema.pick({
  role: true,
  importance: true,
  contentDensity: true,
  certaintyPosture: true,
});
export type GraphEntityEditorial = z.infer<typeof graphEntityEditorialSchema>;

const eventSchemaBase = z.object({
  id: z.string(),
  canonId: z.string(),
  type: z.string().min(1),
  title: z.string().min(1),
  participantEventIds: z.array(z.string()).default([]),
  figureHandleIds: z.array(z.string()).default([]),
  slug: z.string().optional(),
  notes: eventNotesSchema,
  contextEventIds: z.array(z.string()).default([]),
  identityDeclaration: identityDeclarationSchema.optional(),
  chronology: eventChronologySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
  editorial: editorialMetadataSchema.optional()
});

export const eventSchema = eventSchemaBase;
export type EventRecord = z.infer<typeof eventSchema>;

export const canonicalEventSchema = z.object({
  id: z.string(),
  type: canonicalEventTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
  provenance: provenanceSchema.optional()
});
export type CanonicalEventRecord = z.infer<typeof canonicalEventSchema>;

export const relationRecordSchema = z.object({
  id: z.string(),
  type: relationTypeSchema,
  fromEventId: z.string(),
  toEventId: z.string(),
  directed: z.boolean().default(true),
  weight: z.number().optional(),
  confidence: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  provenance: provenanceSchema.optional()
});
export type RelationRecord = z.infer<typeof relationRecordSchema>;

export const canonicalDatasetSchema = z.object({
  events: z.array(canonicalEventSchema),
  relations: z.array(relationRecordSchema),
  admin: adminMetadataBundleSchema.optional()
});
export type CanonicalDataset = z.infer<typeof canonicalDatasetSchema>;

export const structuralLinkSchema = z.object({
  id: z.string(),
  canonId: z.string(),
  type: structuralLinkKindSchema,
  fromEventId: z.string(),
  toEventId: z.string()
});
export type StructuralLink = z.infer<typeof structuralLinkSchema>;

export const semanticLinkSchema = z.object({
  id: z.string(),
  type: semanticLinkKindSchema,
  fromId: z.string(),
  toId: z.string(),
  metadata: z.record(z.unknown()).optional()
});
export type SemanticLink = z.infer<typeof semanticLinkSchema>;

export const updateSemanticLinkInputSchema = z.object({
  type: semanticLinkKindSchema.optional(),
  fromId: z.string().min(1).optional(),
  toId: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type UpdateSemanticLinkInput = z.infer<typeof updateSemanticLinkInputSchema>;

export const datasetSchema = z.object({
  timeSystems: z.array(timeSystemSchema),
  worlds: z.array(worldSchema),
  canons: z.array(canonSchema),
  figureHandles: z.array(figureHandleSchema),
  events: z.array(eventSchema),
  structuralLinks: z.array(structuralLinkSchema),
  semanticLinks: z.array(semanticLinkSchema)
}).transform((value) => ({
  ...value,
  identities: value.events.flatMap((event) => {
    const declaration = event.identityDeclaration;
    if (declaration?.role !== "IDENTITY_DECLARATION") {
      return [];
    }

    return [
      {
        id: event.id,
        canonId: event.canonId,
        kind: declaration.identityKind,
        label: declaration.label,
        slug: declaration.slug,
        description: declaration.description
      }
    ];
  })
}));
export type Dataset = Omit<z.infer<typeof datasetSchema>, "identities" | "events" | "figureHandles"> & {
  identities: Subject[];
  events: EventRecord[];
  figureHandles: FigureHandleRecord[];
};

export const importDatasetInputSchema = z.object({
  dataset: datasetSchema
});
export type ImportDatasetInput = z.infer<typeof importDatasetInputSchema>;

const createEventInputSchemaBase = z.object({
  canonId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  participantEventIds: z.array(z.string()).default([]),
  figureHandleIds: z.array(z.string()).default([]),
  slug: z.string().optional(),
  notes: eventNotesSchema,
  contextEventIds: z.array(z.string()).default([]),
  editorial: editorialMetadataSchema.optional(),
  identityDeclaration: identityDeclarationSchema.optional(),
  chronology: eventChronologySchema.optional(),
  metadata: z.record(z.unknown()).optional()
});

export const createEventInputSchema = createEventInputSchemaBase;
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

const updateEventInputSchemaBase = createEventInputSchemaBase.partial().extend({
  canonId: z.string().min(1).optional(),
  slug: z.string().min(1).optional()
});

export const updateEventInputSchema = updateEventInputSchemaBase;
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

export const eventRelatedItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  sourceKind: z.enum(["structural", "semantic", "both"]).optional()
});
export type EventRelatedItem = z.infer<typeof eventRelatedItemSchema>;

export const eventDetailResponseSchema = eventSchema.extend({
  chronologySummary: z.string().optional(),
  placeEvents: z.array(eventRelatedItemSchema).default([]),
  people: z.array(eventRelatedItemSchema).default([]),
  causeEvents: z.array(eventRelatedItemSchema).default([]),
  resultEvents: z.array(eventRelatedItemSchema).default([])
});
export type EventDetailResponse = z.infer<typeof eventDetailResponseSchema>;

export const createStructuralLinkInputSchema = z.object({
  canonId: z.string().min(1),
  fromEventId: z.string().min(1),
  toEventId: z.string().min(1),
  type: structuralLinkKindSchema
});
export type CreateStructuralLinkInput = z.infer<typeof createStructuralLinkInputSchema>;

export const updateStructuralLinkInputSchema = createStructuralLinkInputSchema.partial();
export type UpdateStructuralLinkInput = z.infer<typeof updateStructuralLinkInputSchema>;

export const storyIngestStructuralLinkUpdateRequestSchema = updateStructuralLinkInputSchema.strict().superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one structural-link field must be provided for update." });
  }
});
export type StoryIngestStructuralLinkUpdateRequest = z.infer<typeof storyIngestStructuralLinkUpdateRequestSchema>;

export const storyIngestStructuralLinkUpdateResponseSchema = z.object({
  structuralLink: structuralLinkSchema,
});
export type StoryIngestStructuralLinkUpdateResponse = z.infer<typeof storyIngestStructuralLinkUpdateResponseSchema>;

export const storyIngestStructuralLinkDeleteResponseSchema = z.object({
  id: z.string().min(1),
  deleted: z.literal(true),
});
export type StoryIngestStructuralLinkDeleteResponse = z.infer<typeof storyIngestStructuralLinkDeleteResponseSchema>;

export const storyIngestSemanticLinkUpdateRequestSchema = z.object({
  type: semanticLinkKindSchema,
}).strict();
export type StoryIngestSemanticLinkUpdateRequest = z.infer<typeof storyIngestSemanticLinkUpdateRequestSchema>;

export const storyIngestSemanticLinkUpdateResponseSchema = z.object({
  semanticLink: semanticLinkSchema,
});
export type StoryIngestSemanticLinkUpdateResponse = z.infer<typeof storyIngestSemanticLinkUpdateResponseSchema>;

export const storyIngestSemanticLinkDeleteResponseSchema = z.object({
  id: z.string().min(1),
  deleted: z.literal(true),
});
export type StoryIngestSemanticLinkDeleteResponse = z.infer<typeof storyIngestSemanticLinkDeleteResponseSchema>;

export const storyIngestCanonSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  worldId: z.string(),
  worldLabel: z.string(),
  timeSystemId: z.string(),
  timeSystemLabel: z.string(),
  compatibilityKey: z.string(),
});
export type StoryIngestCanonSummary = z.infer<typeof storyIngestCanonSummarySchema>;

export const storyIngestCanonListResponseSchema = z.object({
  items: z.array(storyIngestCanonSummarySchema),
});
export type StoryIngestCanonListResponse = z.infer<typeof storyIngestCanonListResponseSchema>;

export const storyIngestCanonUpdateRequestSchema = z.object({
  label: z.string().trim().min(1),
}).strict();
export type StoryIngestCanonUpdateRequest = z.infer<typeof storyIngestCanonUpdateRequestSchema>;

export const storyIngestCanonUpdateResponseSchema = z.object({
  canon: canonSchema,
});
export type StoryIngestCanonUpdateResponse = z.infer<typeof storyIngestCanonUpdateResponseSchema>;

export const storyIngestWorldSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  canonIds: z.array(z.string()).default([]),
  canonCount: z.number().int().nonnegative(),
});
export type StoryIngestWorldSummary = z.infer<typeof storyIngestWorldSummarySchema>;

export const storyIngestWorldGetRequestSchema = z.object({
  id: z.string().min(1),
});
export type StoryIngestWorldGetRequest = z.infer<typeof storyIngestWorldGetRequestSchema>;

export const storyIngestWorldCanonSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  timeSystemId: z.string(),
  timeSystemLabel: z.string(),
  compatibilityKey: z.string(),
});
export type StoryIngestWorldCanonSummary = z.infer<typeof storyIngestWorldCanonSummarySchema>;

export const storyIngestWorldTimeSystemSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  compatibilityKey: z.string(),
  canonIds: z.array(z.string()).default([]),
  canonCount: z.number().int().nonnegative(),
});
export type StoryIngestWorldTimeSystemSummary = z.infer<typeof storyIngestWorldTimeSystemSummarySchema>;

export const storyIngestWorldGetResponseSchema = z.object({
  world: storyIngestWorldSummarySchema,
  canons: z.array(storyIngestWorldCanonSummarySchema),
  timeSystems: z.array(storyIngestWorldTimeSystemSummarySchema),
});
export type StoryIngestWorldGetResponse = z.infer<typeof storyIngestWorldGetResponseSchema>;

export const storyIngestWorldListResponseSchema = z.object({
  items: z.array(storyIngestWorldSummarySchema),
});
export type StoryIngestWorldListResponse = z.infer<typeof storyIngestWorldListResponseSchema>;

export const storyIngestWorldUpdateRequestSchema = z.object({
  label: z.string().trim().min(1),
}).strict();
export type StoryIngestWorldUpdateRequest = z.infer<typeof storyIngestWorldUpdateRequestSchema>;

export const storyIngestWorldUpdateResponseSchema = z.object({
  world: worldSchema,
});
export type StoryIngestWorldUpdateResponse = z.infer<typeof storyIngestWorldUpdateResponseSchema>;

export const storyIngestFigureHandleUpdateRequestSchema = z.object({
  label: z.string().trim().min(1),
}).strict();
export type StoryIngestFigureHandleUpdateRequest = z.infer<typeof storyIngestFigureHandleUpdateRequestSchema>;

export const storyIngestFigureHandleUpdateResponseSchema = z.object({
  figureHandle: figureHandleSchema,
});
export type StoryIngestFigureHandleUpdateResponse = z.infer<typeof storyIngestFigureHandleUpdateResponseSchema>;

export const storyIngestTimelineSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  timeSystemId: z.string(),
  compatibilityKey: z.string(),
  canonIds: z.array(z.string()).default([]),
  canonCount: z.number().int().nonnegative(),
});
export type StoryIngestTimelineSummary = z.infer<typeof storyIngestTimelineSummarySchema>;

export const storyIngestTimelineListResponseSchema = z.object({
  items: z.array(storyIngestTimelineSummarySchema),
});
export type StoryIngestTimelineListResponse = z.infer<typeof storyIngestTimelineListResponseSchema>;

export const storyIngestEventSearchRequestSchema = z.object({
  query: z.string().min(1),
  canonIds: z.array(z.string().min(1)).default([]),
  limit: z.number().int().min(1).max(50).default(10),
});
export type StoryIngestEventSearchRequest = z.infer<typeof storyIngestEventSearchRequestSchema>;

export const storyIngestEventSearchHitSchema = z.object({
  id: z.string(),
  canonId: z.string(),
  canonLabel: z.string(),
  title: z.string(),
  type: z.string(),
  slug: z.string().optional(),
  chronologySummary: z.string().optional(),
});
export type StoryIngestEventSearchHit = z.infer<typeof storyIngestEventSearchHitSchema>;

export const storyIngestEventSearchResponseSchema = z.object({
  items: z.array(storyIngestEventSearchHitSchema),
});
export type StoryIngestEventSearchResponse = z.infer<typeof storyIngestEventSearchResponseSchema>;

export const storyIngestGraphNodeSchema = z.object({
  id: z.string(),
  canonId: z.string(),
  title: z.string(),
  type: z.string(),
});
export type StoryIngestGraphNode = z.infer<typeof storyIngestGraphNodeSchema>;

export const storyIngestGraphEdgeSchema = z.object({
  id: z.string(),
  kind: z.enum(["structural", "semantic"]),
  type: z.string(),
  fromEventId: z.string(),
  toEventId: z.string(),
});
export type StoryIngestGraphEdge = z.infer<typeof storyIngestGraphEdgeSchema>;

export const storyIngestGraphNeighborsRequestSchema = z.object({
  eventId: z.string().min(1),
  includeSemantic: z.boolean().default(true),
});
export type StoryIngestGraphNeighborsRequest = z.infer<typeof storyIngestGraphNeighborsRequestSchema>;

export const storyIngestGraphNeighborsResponseSchema = z.object({
  seedEventId: z.string(),
  nodes: z.array(storyIngestGraphNodeSchema),
  edges: z.array(storyIngestGraphEdgeSchema),
});
export type StoryIngestGraphNeighborsResponse = z.infer<typeof storyIngestGraphNeighborsResponseSchema>;

export const storyIngestBatchEventReferenceSchema = z.object({
  eventId: z.string().min(1).optional(),
  clientId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.eventId && !value.clientId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Story-ingest batch references must include eventId or clientId.",
    });
  }
});
export type StoryIngestBatchEventReference = z.infer<typeof storyIngestBatchEventReferenceSchema>;

export const storyIngestBatchWorldInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type StoryIngestBatchWorldInput = z.infer<typeof storyIngestBatchWorldInputSchema>;

export const storyIngestBatchWorldReferenceSchema = z.object({
  worldId: z.string().min(1).optional(),
  worldRef: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.worldId && !value.worldRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Story-ingest batch world references must include worldId or worldRef.",
    });
  }
});
export type StoryIngestBatchWorldReference = z.infer<typeof storyIngestBatchWorldReferenceSchema>;

export const storyIngestBatchCanonReferenceSchema = z.object({
  canonId: z.string().min(1).optional(),
  canonRef: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.canonId && !value.canonRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Story-ingest batch canon references must include canonId or canonRef.",
    });
  }
});
export type StoryIngestBatchCanonReference = z.infer<typeof storyIngestBatchCanonReferenceSchema>;

export const storyIngestBatchCanonInputSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  timeSystemId: z.string().min(1),
  worldId: z.string().min(1).optional(),
  worldRef: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (!value.worldId && !value.worldRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Story-ingest batch canons must include worldId or worldRef.",
      path: ["worldId"],
    });
  }
});
export type StoryIngestBatchCanonInput = z.infer<typeof storyIngestBatchCanonInputSchema>;

export const storyIngestBatchEventInputSchema = z.object({
  clientId: z.string().min(1),
  canonId: z.string().min(1).optional(),
  canonRef: z.string().min(1).optional(),
  type: z.string().min(1),
  title: z.string().min(1),
  participantRefs: z.array(storyIngestBatchEventReferenceSchema).default([]),
  figureHandleIds: z.array(z.string()).default([]),
  slug: z.string().optional(),
  notes: eventNotesSchema,
  contextRefs: z.array(storyIngestBatchEventReferenceSchema).default([]),
  editorial: editorialMetadataSchema.optional(),
  identityDeclaration: identityDeclarationSchema.optional(),
  chronology: eventChronologySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  if (!value.canonId && !value.canonRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Story-ingest batch events must include canonId or canonRef.",
      path: ["canonId"],
    });
  }
});
export type StoryIngestBatchEventInput = z.infer<typeof storyIngestBatchEventInputSchema>;

export const storyIngestBatchStructuralLinkInputSchema = z.object({
  clientId: z.string().min(1).optional(),
  canonId: z.string().min(1).optional(),
  canonRef: z.string().min(1).optional(),
  from: storyIngestBatchEventReferenceSchema,
  to: storyIngestBatchEventReferenceSchema,
  type: structuralLinkKindSchema,
}).superRefine((value, ctx) => {
  if (!value.canonId && !value.canonRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Story-ingest batch structural links must include canonId or canonRef.",
      path: ["canonId"],
    });
  }
});
export type StoryIngestBatchStructuralLinkInput = z.infer<typeof storyIngestBatchStructuralLinkInputSchema>;

export const storyIngestBatchPlanSchema = z.object({
  canonId: z.string().min(1).optional(),
  worlds: z.array(storyIngestBatchWorldInputSchema).default([]),
  canons: z.array(storyIngestBatchCanonInputSchema).default([]),
  events: z.array(storyIngestBatchEventInputSchema).default([]),
  structuralLinks: z.array(storyIngestBatchStructuralLinkInputSchema).default([]),
});
export type StoryIngestBatchPlan = z.infer<typeof storyIngestBatchPlanSchema>;

export const storyIngestWorkflowRunReceiptSchema = z.object({
  version: z.literal(1),
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
  scope: z.literal("world-canon-bootstrap"),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  nonce: z.string().min(1),
  signature: z.string().min(1),
});
export type StoryIngestWorkflowRunReceipt = z.infer<typeof storyIngestWorkflowRunReceiptSchema>;

export const storyIngestAuthoringContextSchema = z.object({
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
  scope: z.literal("world-canon-bootstrap"),
  workflowRunReceipt: storyIngestWorkflowRunReceiptSchema,
});
export type StoryIngestAuthoringContext = z.infer<typeof storyIngestAuthoringContextSchema>;

export const storyIngestBatchPlanValidationRequestSchema = z.object({
  plan: storyIngestBatchPlanSchema,
  workflowRunReceipt: storyIngestWorkflowRunReceiptSchema,
});
export type StoryIngestBatchPlanValidationRequest = z.infer<typeof storyIngestBatchPlanValidationRequestSchema>;

export const storyIngestBatchPlanIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string(),
  severity: z.enum(["error", "warning"]).default("error"),
});
export type StoryIngestBatchPlanIssue = z.infer<typeof storyIngestBatchPlanIssueSchema>;

export const storyIngestWriteWarningSchema = storyIngestBatchPlanIssueSchema;
export type StoryIngestWriteWarning = z.infer<typeof storyIngestWriteWarningSchema>;

export const storyIngestBatchWorldPreviewSchema = z.object({
  worldId: z.string(),
  label: z.string(),
});
export type StoryIngestBatchWorldPreview = z.infer<typeof storyIngestBatchWorldPreviewSchema>;

export const storyIngestBatchCanonPreviewSchema = z.object({
  canonId: z.string(),
  worldId: z.string(),
  label: z.string(),
  timeSystemId: z.string(),
});
export type StoryIngestBatchCanonPreview = z.infer<typeof storyIngestBatchCanonPreviewSchema>;

export const storyIngestBatchEventPreviewSchema = z.object({
  clientId: z.string(),
  eventId: z.string(),
  canonId: z.string(),
  title: z.string(),
});
export type StoryIngestBatchEventPreview = z.infer<typeof storyIngestBatchEventPreviewSchema>;

export const storyIngestBatchStructuralLinkPreviewSchema = z.object({
  clientId: z.string().optional(),
  linkId: z.string(),
  canonId: z.string(),
  fromEventId: z.string(),
  toEventId: z.string(),
  type: structuralLinkKindSchema,
});
export type StoryIngestBatchStructuralLinkPreview = z.infer<typeof storyIngestBatchStructuralLinkPreviewSchema>;

export const storyIngestApprovalArtifactSchema = z.object({
  version: z.literal(1),
  validationRecordId: z.string().min(1),
  canonId: z.string().min(1),
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
  workflowNonce: z.string().min(1),
  planDigest: z.string().min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  signature: z.string().min(1),
});
export type StoryIngestApprovalArtifact = z.infer<typeof storyIngestApprovalArtifactSchema>;

export const storyIngestLowLevelWriteProofSchema = z.object({
  plan: storyIngestBatchPlanSchema,
  approvalArtifact: storyIngestApprovalArtifactSchema,
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
});
export type StoryIngestLowLevelWriteProof = z.infer<typeof storyIngestLowLevelWriteProofSchema>;

export const storyIngestEventCreateRequestSchema = createEventInputSchema.extend({
  proof: storyIngestLowLevelWriteProofSchema.optional(),
});
export type StoryIngestEventCreateRequest = z.infer<typeof storyIngestEventCreateRequestSchema>;

export const storyIngestEventUpdateRequestSchema = updateEventInputSchema.omit({ canonId: true }).strict();
export type StoryIngestEventUpdateRequest = z.infer<typeof storyIngestEventUpdateRequestSchema>;

export const storyIngestStructuralLinkCreateRequestSchema = createStructuralLinkInputSchema.extend({
  proof: storyIngestLowLevelWriteProofSchema.optional(),
});
export type StoryIngestStructuralLinkCreateRequest = z.infer<typeof storyIngestStructuralLinkCreateRequestSchema>;

export const storyIngestBatchPlanValidationResponseSchema = z.object({
  ok: z.boolean(),
  canonId: z.string().optional(),
  issues: z.array(storyIngestBatchPlanIssueSchema).default([]),
  worlds: z.array(storyIngestBatchWorldPreviewSchema).default([]),
  canons: z.array(storyIngestBatchCanonPreviewSchema).default([]),
  events: z.array(storyIngestBatchEventPreviewSchema).default([]),
  structuralLinks: z.array(storyIngestBatchStructuralLinkPreviewSchema).default([]),
  planDigest: z.string().min(1).optional(),
  approvalArtifact: storyIngestApprovalArtifactSchema.optional(),
});
export type StoryIngestBatchPlanValidationResponse = z.infer<typeof storyIngestBatchPlanValidationResponseSchema>;

export const storyIngestEventCreateResponseSchema = z.object({
  event: eventSchema,
  warnings: z.array(storyIngestWriteWarningSchema).default([]),
});
export type StoryIngestEventCreateResponse = z.infer<typeof storyIngestEventCreateResponseSchema>;

export const storyIngestEventUpdateResponseSchema = storyIngestEventCreateResponseSchema;
export type StoryIngestEventUpdateResponse = z.infer<typeof storyIngestEventUpdateResponseSchema>;

export const storyIngestBatchCommitRequestSchema = z.object({
  plan: storyIngestBatchPlanSchema,
  approvalArtifact: storyIngestApprovalArtifactSchema,
  workflowId: z.string().min(1),
  skillVersion: z.string().min(1),
});
export type StoryIngestBatchCommitRequest = z.infer<typeof storyIngestBatchCommitRequestSchema>;

export const storyIngestBatchCommittedEventSchema = z.object({
  clientId: z.string(),
  event: eventSchema,
});
export type StoryIngestBatchCommittedEvent = z.infer<typeof storyIngestBatchCommittedEventSchema>;

export const storyIngestBatchCommittedWorldSchema = worldSchema;
export type StoryIngestBatchCommittedWorld = z.infer<typeof storyIngestBatchCommittedWorldSchema>;

export const storyIngestBatchCommittedCanonSchema = canonSchema;
export type StoryIngestBatchCommittedCanon = z.infer<typeof storyIngestBatchCommittedCanonSchema>;

export const storyIngestBatchCommittedStructuralLinkSchema = z.object({
  clientId: z.string().optional(),
  structuralLink: structuralLinkSchema,
});
export type StoryIngestBatchCommittedStructuralLink = z.infer<typeof storyIngestBatchCommittedStructuralLinkSchema>;

export const storyIngestBatchCommitResponseSchema = z.object({
  canonId: z.string(),
  worlds: z.array(storyIngestBatchCommittedWorldSchema).default([]),
  canons: z.array(storyIngestBatchCommittedCanonSchema).default([]),
  events: z.array(storyIngestBatchCommittedEventSchema).default([]),
  structuralLinks: z.array(storyIngestBatchCommittedStructuralLinkSchema).default([]),
  warnings: z.array(storyIngestWriteWarningSchema).default([]),
});
export type StoryIngestBatchCommitResponse = z.infer<typeof storyIngestBatchCommitResponseSchema>;

export const validationIssueSchema = z.object({
  id: z.string(),
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  scope: z.enum(["dataset", "record", "relationship"]),
  affectedRecordIds: z.array(z.string()),
  navigationHints: z.array(
    z.object({
      type: z.string(),
      id: z.string()
    })
  )
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationResponseSchema = z.object({
  status: z.enum(["ok", "warning", "error"]),
  scope: z.string(),
  issues: z.array(validationIssueSchema)
});
export type ValidationResponse = z.infer<typeof validationResponseSchema>;

export const graphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["subject", "figureHandle", "event"]),
  label: z.string(),
  validationState: z.enum(["ok", "warning", "error"])
});
export type GraphNode = Omit<z.infer<typeof graphNodeSchema>, "kind"> & {
  kind: z.infer<typeof graphNodeSchema>["kind"] | "identity";
};

export const graphEdgeSchema = z.object({
  id: z.string(),
  kind: z.enum(["structural", "semantic", "association"]),
  edgeType: z.string(),
  source: z.string(),
  target: z.string()
});
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

export const graphProjectionSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema)
});
export type GraphProjection = {
  nodes: GraphNode[];
  edges: z.infer<typeof graphProjectionSchema>["edges"];
};

export const timelineItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  position: z.number().int(),
  validationState: z.enum(["ok", "warning", "error"]),
  chronologySummary: z.string().optional(),
  anchors: z.array(worldAnchorSchema).default([])
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;

export const timelineProjectionSchema = z.object({
  items: z.array(timelineItemSchema)
});
export type TimelineProjection = z.infer<typeof timelineProjectionSchema>;

export const chronologyMappingSchema = z.object({
  eventId: z.string(),
  structuralPosition: z.string(),
  chronologySummary: z.string().optional(),
  anchors: z.array(worldAnchorSchema).default([])
});
export type ChronologyMapping = z.infer<typeof chronologyMappingSchema>;

export const subjectTimelineItemSchema = timelineItemSchema.extend({
  eventId: z.string(),
  involvement: z.enum(["participant", "context", "both"])
});
export type SubjectTimelineItem = z.infer<typeof subjectTimelineItemSchema>;

export const subjectTimelineProjectionSchema = z.object({
  subjectId: z.string(),
  canonId: z.string(),
  items: z.array(subjectTimelineItemSchema)
});
export type SubjectTimelineProjection = z.infer<typeof subjectTimelineProjectionSchema>;

export const graphShellLensSchema = z.enum(["timeOverlay"]);
export type GraphShellLens = z.infer<typeof graphShellLensSchema>;

export const graphShellTabSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  availableCanonIds: z.array(z.string()),
  defaultEnabledCanonIds: z.array(z.string()),
  timeSystemId: z.string().optional(),
  compatibilityKey: z.string().optional()
});
export type GraphShellTab = z.infer<typeof graphShellTabSchema>;

export const graphShellCanonSchema = z.object({
  id: z.string(),
  label: z.string(),
  worldId: z.string(),
  worldLabel: z.string(),
  timeSystemId: z.string(),
  timeSystemLabel: z.string(),
  compatibilityKey: z.string()
});
export type GraphShellCanon = z.infer<typeof graphShellCanonSchema>;

export const graphShellChronologyAxisSchema = z.object({
  coordinateScale: z.enum(["fractional-year", "elapsed-gregorian"]).optional(),
  scheme: z.literal("gregorian_utc"),
  timeSystemId: z.string(),
  compatibilityKey: z.string(),
  startYear: z.number(),
  endYear: z.number(),
  tickYears: z.array(z.number())
});
export type GraphShellChronologyAxis = z.infer<typeof graphShellChronologyAxisSchema>;

export const graphShellChronologyColumnSchema = z.object({
  id: z.string(),
  canonId: z.string(),
  label: z.string(),
  kind: identityKindSchema,
  eventCount: z.number().int().nonnegative(),
  firstYear: z.number(),
  lastYear: z.number(),
  startEventId: z.string()
});
export type GraphShellChronologyColumn = z.infer<typeof graphShellChronologyColumnSchema>;

export const graphShellChronologyPlacementSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  canonId: z.string(),
  columnId: z.string(),
  label: z.string(),
  year: z.number(),
  yearLabel: z.string(),
  chronologySummary: z.string().optional(),
  precision: chronologyPrecisionSchema.optional(),
  certainty: chronologyCertaintySchema.optional(),
  validationState: z.enum(["ok", "warning", "error"]),
  involvement: z.enum(["participant", "context", "both"]),
  stackIndex: z.number().int().nonnegative(),
  laneStart: z.boolean().default(false),
  laneEnd: z.boolean().default(false)
});
export type GraphShellChronologyPlacement = z.infer<typeof graphShellChronologyPlacementSchema>;

export const graphShellChronologyUnplacedSchema = z.object({
  eventId: z.string(),
  canonId: z.string(),
  label: z.string(),
  reason: z.string()
});
export type GraphShellChronologyUnplaced = z.infer<typeof graphShellChronologyUnplacedSchema>;

export const graphShellChronologyBoardSchema = z.object({
  mode: z.literal("gregorian"),
  axis: graphShellChronologyAxisSchema,
  columns: z.array(graphShellChronologyColumnSchema),
  placements: z.array(graphShellChronologyPlacementSchema),
  unplaced: z.array(graphShellChronologyUnplacedSchema)
});
export type GraphShellChronologyBoard = z.infer<typeof graphShellChronologyBoardSchema>;

export const chartPlaneWorldPointSchema = z.object({
  x: z.number(),
  y: z.number()
});
export type ChartPlaneWorldPoint = z.infer<typeof chartPlaneWorldPointSchema>;

export const chartPlaneWorldBoundsSchema = z.object({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});
export type ChartPlaneWorldBounds = z.infer<typeof chartPlaneWorldBoundsSchema>;

export const chartPlaneDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["warning", "error"]),
  message: z.string()
});
export type ChartPlaneDiagnostic = z.infer<typeof chartPlaneDiagnosticSchema>;

const graphShellChartPlaneEntityBaseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  canonId: z.string(),
  label: z.string(),
  geometryKind: z.enum(["point", "segment", "region"]),
  validationState: z.enum(["ok", "warning", "error"]),
  contains: z.array(z.string()).default([]),
  containedBy: z.string().optional(),
  diagnostics: z.array(chartPlaneDiagnosticSchema).default([]),
  viewportClass: z.enum(["visible", "context-retained", "clipped", "hidden"]).default("visible"),
  editorial: graphEntityEditorialSchema.optional()
});

export const graphShellChartPlanePointEntitySchema = graphShellChartPlaneEntityBaseSchema.extend({
  geometryKind: z.literal("point"),
  position: chartPlaneWorldPointSchema
});
export type GraphShellChartPlanePointEntity = z.infer<typeof graphShellChartPlanePointEntitySchema>;

export const graphShellChartPlaneSegmentEntitySchema = graphShellChartPlaneEntityBaseSchema.extend({
  geometryKind: z.literal("segment"),
  start: chartPlaneWorldPointSchema,
  end: chartPlaneWorldPointSchema
});
export type GraphShellChartPlaneSegmentEntity = z.infer<typeof graphShellChartPlaneSegmentEntitySchema>;

export const graphShellChartPlaneRegionEntitySchema = graphShellChartPlaneEntityBaseSchema.extend({
  geometryKind: z.literal("region"),
  worldBounds: chartPlaneWorldBoundsSchema,
});
export type GraphShellChartPlaneRegionEntity = z.infer<typeof graphShellChartPlaneRegionEntitySchema>;

export const graphShellChartPlaneEntitySchema = z.discriminatedUnion("geometryKind", [
  graphShellChartPlanePointEntitySchema,
  graphShellChartPlaneSegmentEntitySchema,
  graphShellChartPlaneRegionEntitySchema
]);
export type GraphShellChartPlaneEntity = z.infer<typeof graphShellChartPlaneEntitySchema>;

export const graphShellChartPlaneSchema = z.object({
  compatibilityKey: z.string(),
  timeSystemId: z.string(),
  entities: z.array(graphShellChartPlaneEntitySchema),
  diagnostics: z.array(chartPlaneDiagnosticSchema).default([])
});
export type GraphShellChartPlane = z.infer<typeof graphShellChartPlaneSchema>;

export const viewportBboxSchema = z.object({
  minX: z.number(),
  minY: z.number(),
  maxX: z.number(),
  maxY: z.number(),
});
export type ViewportBbox = z.infer<typeof viewportBboxSchema>;

export const graphShellViewportQuerySchema = z.object({
  canonIds: z.array(z.string()).min(1),
  bbox: viewportBboxSchema,
  scale: z.number(),
  viewportWidth: z.number().positive(),
  viewportHeight: z.number().positive(),
  currentTimeLevel: z.string().min(1).optional(),
  artifactClasses: z.array(z.string().min(1)).optional(),
  selectedEntityId: z.string().optional(),
  includeNeighbors: z.boolean().optional().default(false),
  revision: z.number().int().positive().optional(),
});
export type GraphShellViewportQuery = z.infer<typeof graphShellViewportQuerySchema>;

export const graphShellViewportResponseSchema = z.object({
  revision: z.number().int().nonnegative(),
  canonicalRevision: z.number().int().nonnegative(),
  lodLevel: z.number().int().nonnegative(),
  entities: z.array(graphShellChartPlaneEntitySchema),
  edges: z.array(graphShellChartPlaneEntitySchema),
  regions: z.array(graphShellChartPlaneEntitySchema),
  diagnostics: z.array(chartPlaneDiagnosticSchema),
  truncated: z.boolean(),
  cache: z.object({ stale: z.boolean() }),
  nextSuggestedLod: z.number().int().optional(),
});
export type GraphShellViewportResponse = z.infer<typeof graphShellViewportResponseSchema>;

export const graphShellWorkspaceShellSchema = z.object({
  menuItems: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      active: z.boolean()
    })
  ),
  tabs: z.array(graphShellTabSchema),
  canons: z.array(graphShellCanonSchema),
  defaultTabId: z.string(),
  buildRevision: z.string().optional(),
  chronologyBoard: graphShellChronologyBoardSchema.optional(),
});
export type GraphShellWorkspaceShell = z.infer<typeof graphShellWorkspaceShellSchema>;

export const graphShellWorkspaceSchema = graphShellWorkspaceShellSchema;
export type GraphShellWorkspace = GraphShellWorkspaceShell;

export const WRITE_SECRET_HEADER = "x-urdr-write-secret";

export const SUPPORTED_WRITE_ROUTES = ["event.create", "event.update", "world.update", "canon.update", "figure-handle.update", "structural-link.create", "structural-link.update", "structural-link.delete", "semantic-link.update", "semantic-link.delete", "batch.plan.validate", "batch.commit"] as const;

export const SUPPORTED_READ_ROUTES = [
  "world.list",
  "world.get",
  "canon.list",
  "timeline.list",
  "story-ingest.context",
  "event.search",
  "graph.neighbors",
] as const;

export const GRAPH_ONLY_VISIBLE_SURFACE = {
  primaryRoute: "/visualizations/graph",
  redirectedRoutes: [
    "/",
    "/events",
    "/events/[id]",
    "/links",
    "/validation",
    "/visualizations/timeline"
  ],
  browserWriteFlowsExposed: false
} as const;

export const STORY_INGEST_ROUTE_SELECTION_SEQUENCE = ["world.list", "canon.list", "timeline.list", "story-ingest.context"] as const;

export const STORY_INGEST_OPTIONAL_ROUTE_REFINEMENTS = {
  "world.list": ["world.get"],
} as const;

export const STORY_INGEST_ROUTE_EXAMPLES = {
  existingCanon: {
    canonId: "canon:existing",
    worlds: [],
    canons: [],
    events: [
      {
        clientId: "beat",
        canonId: "canon:existing",
        type: "instant",
        title: "Existing Canon Beat",
        notes: "",
        participantRefs: [],
        figureHandleIds: [],
        contextRefs: [],
      },
    ],
    structuralLinks: [],
  },
  existingWorldNewCanon: {
    canonId: "canon:new",
    worlds: [],
    canons: [
      {
        id: "canon:new",
        worldId: "world:existing",
        label: "New Canon",
        timeSystemId: "time:existing",
      },
    ],
    events: [
      {
        clientId: "beat",
        canonRef: "canon:new",
        type: "instant",
        title: "Existing World New Canon Beat",
        notes: "",
        participantRefs: [],
        figureHandleIds: [],
        contextRefs: [],
      },
    ],
    structuralLinks: [],
  },
  newWorldNewCanon: {
    canonId: "canon:new",
    worlds: [{ id: "world:new", label: "New World" }],
    canons: [
      {
        id: "canon:new",
        worldRef: "world:new",
        label: "New Canon",
        timeSystemId: "time:existing",
      },
    ],
    events: [
      {
        clientId: "beat",
        canonRef: "canon:new",
        type: "instant",
        title: "New World New Canon Beat",
        notes: "",
        participantRefs: [],
        figureHandleIds: [],
        contextRefs: [],
      },
    ],
    structuralLinks: [],
  },
} as const satisfies Record<string, StoryIngestBatchPlan>;

export {
  assertStaticGraphRelativePath,
  buildStaticBandPath,
  buildStaticBandPathForRoot,
  buildStaticProjectionObjectDocPath,
  buildStaticProjectionObjectDocPathTemplate,
  buildStaticScopeMetaPath,
  buildStaticBandPathTemplate,
  buildStaticBandPathTemplateForRoot,
  encodeStaticGraphPathSegment,
  formatStaticBandIndex,
  resolveStaticBandPathTemplate,
  staticProjectionCompletenessSchema,
  staticProjectionArtifactSchema,
  staticProjectionObjectDocSchema,
  staticProjectionRootManifestSchema,
  staticProjectionScopeLevelMetaSchema,
  staticProjectionScopeMetaSchema,
  staticArtifactClassSchema,
  staticBandDocumentSchema,
  staticEventDetailDocumentSchema,
  staticGraphCurrentSchema,
  staticGraphLocaleManifestSchema,
  staticGraphManifestSchema,
  staticViewportCanonMetaSchema,
  staticViewportCoverageRangeSchema,
  staticViewportEntityIndexEntrySchema,
  staticViewportLevelMetaSchema,
  staticViewportMetaSchema,
  type StaticArtifactClass,
  type StaticProjectionArtifact,
  type StaticProjectionCompleteness,
  type StaticProjectionObjectDoc,
  type StaticProjectionRootManifest,
  type StaticProjectionScopeLevelMeta,
  type StaticProjectionScopeMeta,
  type StaticBandDocument,
  type StaticEventDetailDocument,
  type StaticGraphCurrent,
  type StaticGraphLocaleManifest,
  type StaticGraphManifest,
  type StaticViewportCanonMeta,
  type StaticViewportCoverageRange,
  type StaticViewportEntityIndexEntry,
  type StaticViewportLevelMeta,
  type StaticViewportMeta,
} from "./static-viewport-artifacts";
