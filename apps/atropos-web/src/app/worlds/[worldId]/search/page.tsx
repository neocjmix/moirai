import { notFound } from "next/navigation";
import { StatusIsland } from "../../../../components/status-island";
import {
  readWorld,
  searchWorld,
  selectPublication
} from "../../../../lib/publication";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
  searchParams
}: {
  readonly params: Promise<{ worldId: string }>;
  readonly searchParams: Promise<{ q?: string }>;
}) {
  const { worldId } = await params;
  const { q = "" } = await searchParams;
  try {
    const selected = await selectPublication(worldId);
    const [{ world }, { pointer, entries }] = await Promise.all([
      readWorld(worldId, selected),
      searchWorld(worldId, q, selected)
    ]);
    return (
      <main className="world-canvas">
        <StatusIsland
          worldId={worldId}
          worldTitle={world.title}
          revision={pointer.served_revision}
        />
        <nav className="breadcrumb">
          <a href={`/worlds/${worldId}`}>{world.title}</a>
          <span>/</span>
          <span>Search</span>
        </nav>
        <section className="search-surface">
          <p className="eyebrow">
            PUBLIC SEARCH · REVISION {pointer.served_revision}
          </p>
          <h1>세계 안에서 찾기</h1>
          <form action={`/worlds/${worldId}/search`} className="search-form">
            <label htmlFor="world-search">제목과 공개 Narrative 검색</label>
            <div>
              <input
                defaultValue={q}
                id="world-search"
                name="q"
                placeholder="lantern"
                type="search"
              />
              <button type="submit">검색</button>
            </div>
          </form>
          <div className="search-results" aria-live="polite">
            {entries.map((entry) => (
              <a
                className="canon-card"
                href={entry.canonical_url}
                key={entry.target_id}
              >
                <span>{entry.title}</span>
                <small>
                  {entry.target_type.toUpperCase()} · {entry.text.slice(0, 150)}
                </small>
                <b aria-hidden="true">→</b>
              </a>
            ))}
            {entries.length === 0 ? (
              <p>일치하는 공개 문서가 없습니다.</p>
            ) : null}
          </div>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
