import type { PublicCanon, PublicEvent, PublicWorld } from "@moirai/contracts";

export interface CanonicalRevisionView {
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly events: readonly PublicEvent[];
}

export interface ProjectionDocument {
  readonly key: string;
  readonly value: Readonly<Record<string, unknown>>;
}

export function projectPublicDocuments(
  view: CanonicalRevisionView,
  revision: number,
  generatedAt: string
): readonly ProjectionDocument[] {
  const prefix = `worlds/${view.world.id}/revisions/${revision}`;
  const metadata = {
    world_id: view.world.id,
    served_revision: revision,
    generated_at: generatedAt
  };
  return [
    {
      key: `${prefix}/world.json`,
      value: { ...metadata, world: view.world, canons: view.canons }
    },
    ...view.canons.map((canon) => ({
      key: `${prefix}/canons/${canon.id}.json`,
      value: {
        ...metadata,
        canon,
        events: view.events.filter((event) => event.canon_id === canon.id)
      }
    })),
    ...view.events.map((event) => ({
      key: `${prefix}/events/${event.id}.json`,
      value: { ...metadata, event }
    }))
  ];
}
