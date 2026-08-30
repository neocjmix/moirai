import { PUBLICATION_FORMAT_VERSION } from "@moirai/contracts";

export const REVISION_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const CURRENT_CACHE_CONTROL = "public, max-age=30, must-revalidate";

export interface PublicationPointer {
  readonly world_id: string;
  readonly served_revision: number;
  readonly manifest_key: string;
  readonly format_version: string;
  readonly generated_at: string;
}

export function revisionPrefix(worldId: string, revision: number): string {
  return `worlds/${worldId}/revisions/${revision}`;
}

export function currentKey(worldId: string): string {
  return `worlds/${worldId}/current.json`;
}

export function createPointer(
  worldId: string,
  revision: number,
  generatedAt: string
): PublicationPointer {
  return {
    world_id: worldId,
    served_revision: revision,
    manifest_key: `${revisionPrefix(worldId, revision)}/manifest.json`,
    format_version: PUBLICATION_FORMAT_VERSION,
    generated_at: generatedAt
  };
}
