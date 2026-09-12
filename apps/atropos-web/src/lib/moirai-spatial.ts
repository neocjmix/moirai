import { z } from "zod";
import { presentationScopeKey } from "@moirai/graph-presentation";
import { readPublicationObject } from "./publication";
import { createMoiraiSpatialReader } from "../urdr-port/src/moirai-spatial-reader";
import { graphShellViewportQuerySchema } from "../urdr-port/shared/contracts";

const sourceSchema = z.object({
  world_id: z.string().uuid(),
  served_revision: z.number().int().positive().safe(),
  canon_ids: z.array(z.string().uuid()).min(1).max(32),
  time_systems: z
    .array(z.unknown())
    .max(32)
    .transform(() => [])
});
export const spatialRequestSchema = z
  .object({
    sources: z.array(sourceSchema).min(1).max(8),
    viewport: graphShellViewportQuerySchema.extend({
      canonIds: z.array(z.string().max(512)).min(1).max(32),
      selectedEntityId: z.string().max(4096).optional(),
      artifactClasses: z
        .array(z.enum(["point", "segment", "region"]))
        .max(3)
        .optional(),
      currentTimeLevel: z.literal("full").optional(),
      scale: z.number().positive().finite(),
      viewportWidth: z.number().positive().finite(),
      viewportHeight: z.number().positive().finite()
    }),
    maxEntities: z.number().int().positive().max(2500).optional()
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.sources.map((s) => s.world_id)).size !==
        value.sources.length ||
      value.sources.reduce((n, s) => n + s.canon_ids.length, 0) > 32 ||
      value.sources.some(
        (s) => new Set(s.canon_ids).size !== s.canon_ids.length
      )
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duplicate_or_excess_sources"
      });
    const allowed = new Set(
      value.sources.flatMap((s) =>
        s.canon_ids.map((c) =>
          presentationScopeKey({
            world_id: s.world_id,
            served_revision: s.served_revision,
            canon_id: c
          })
        )
      )
    );
    if (
      value.viewport.canonIds.some((id) => !allowed.has(id)) ||
      new Set(value.viewport.canonIds).size !== value.viewport.canonIds.length
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_scope" });
  });
export const moiraiSpatialReader = createMoiraiSpatialReader(
  readPublicationObject
);
