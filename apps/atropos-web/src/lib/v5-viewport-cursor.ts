import { z } from "zod";

/** Continuation is bound to the exact spatial query and Collection selection. */
export const v5ViewportCursorSchema = z
  .object({
    selection_digest: z.string().regex(/^[0-9a-f]{64}$/),
    spatial: z
      .object({
        query_digest: z.string().regex(/^[0-9a-f]{64}$/),
        pending: z
          .array(
            z
              .object({
                key: z.string().max(256),
                level: z.number().int().min(0).max(8),
                offset: z.number().int().min(0).max(127),
                bounds: z
                  .object({
                    minX: z.number().finite(),
                    maxX: z.number().finite(),
                    minY: z.number().finite(),
                    maxY: z.number().finite()
                  })
                  .strict()
              })
              .strict()
          )
          .min(1)
          .max(2048)
      })
      .strict()
  })
  .strict();
