import { notFound } from "next/navigation";
import { StatusIsland } from "../../../components/status-island";
import { readWorld } from "../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function WorldPage({
  params
}: {
  readonly params: Promise<{ worldId: string }>;
}) {
  const { worldId } = await params;
  try {
    const { world, canons, pointer } = await readWorld(worldId);
    return (
      <main className="world-canvas">
        <StatusIsland
          worldId={world.id}
          worldTitle={world.title}
          revision={pointer.served_revision}
        />
        <section className="world-intro">
          <p className="eyebrow">WORLD · REVISION {pointer.served_revision}</p>
          <h1>{world.title}</h1>
          <p>{world.description}</p>
        </section>
        <section className="card-dock" aria-labelledby="canons-title">
          <p className="eyebrow" id="canons-title">
            CANONS · EQUAL TRUTH CONTEXTS
          </p>
          <div className="card-list">
            {canons.map((canon) => (
              <a
                className="canon-card"
                href={`/worlds/${world.id}/canons/${canon.id}`}
                key={canon.id}
              >
                <span>{canon.title}</span>
                <small>{canon.description}</small>
                <b aria-hidden="true">→</b>
              </a>
            ))}
          </div>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
