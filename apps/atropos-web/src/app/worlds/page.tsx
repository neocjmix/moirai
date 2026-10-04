import { publishedWorldIds } from "../../lib/publication";
import { v5ShellReader } from "../../lib/v5-shell-reader";
import { readV5StagedDocument } from "@moirai/publication/v5";
export const dynamic = "force-dynamic";
export default async function WorldsPage() {
  const ids = await publishedWorldIds();
  const worlds = [];
  const pending: string[] = [];
  // Bound concurrent store reads; omit withdrawn or incomplete publications.
  for (const id of ids) {
    try {
      const { store, pointer, rootBody } = await v5ShellReader(id);
      const body = await readV5StagedDocument(
        rootBody,
        `worlds/${id}/revisions/${pointer.served_revision}/v5/content/world.json`,
        async (key) => (await store.get(key)).body
      );
      if (!body) continue;
      const summary = JSON.parse(body) as {
        world: { title: string; description: string | null };
        event_count: number;
      };
      worlds.push({ id, ...summary });
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "v5_publication_pointer_unavailable"
      )
        pending.push(id);
    }
  }
  return (
    <main style={{ padding: "24px", maxWidth: 720, margin: "auto" }}>
      <h1>월드 선택</h1>
      <p>탐색할 세계를 선택하세요.</p>
      {worlds.length === 0 && <p>현재 공개된 월드가 없습니다.</p>}
      <ul style={{ padding: 0, listStyle: "none" }}>
        {worlds.map((world) => (
          <li
            key={world.id}
            style={{ padding: "16px 0", borderBottom: "1px solid #d6dcd3" }}
          >
            <a
              href={`/graph/v5?world=${world.id}`}
              style={{
                display: "block",
                padding: "12px 0",
                fontSize: "1.2rem"
              }}
            >
              {world.world.title}
            </a>
            <p>{world.world.description}</p>
            <a href={`/worlds/${world.id}/events`}>
              사건 {world.event_count}개 보기
            </a>
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <section>
          <h2>공개본 준비 중</h2>
          <ul>
            {pending.map((id) => (
              <li key={id}>
                <a href={`/graph/v5?world=${id}`}>{id}</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
