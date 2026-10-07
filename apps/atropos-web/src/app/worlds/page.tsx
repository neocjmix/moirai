import { publishedWorldIds } from "../../lib/publication";
import { v5ShellReader } from "../../lib/v5-shell-reader";
import { readV5StagedDocument } from "@moirai/publication/v5";
import styles from "./worlds.module.css";
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
    <main className={styles.page}>
      <p className={styles.brand}>MOIRAI</p>
      <header className={styles.header}>
        <h1>월드 선택</h1>
        <p>탐색할 세계를 선택하세요.</p>
      </header>
      {worlds.length === 0 && (
        <p className={styles.empty}>현재 공개된 월드가 없습니다.</p>
      )}
      <ul className={styles.list}>
        {worlds.map((world) => (
          <li key={world.id} className={styles.card}>
            <a href={`/graph/v5?world=${world.id}`} className={styles.entry}>
              <h2>{world.world.title}</h2>
              {world.world.description && <p>{world.world.description}</p>}
              <span className={styles.arrow} aria-hidden="true">
                ↗
              </span>
            </a>
            <div className={styles.footer}>
              <a href={`/worlds/${world.id}/events`}>
                사건 {world.event_count}개 보기
              </a>
              <span className={styles.hint}>세계 탐색</span>
            </div>
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <section className={styles.pending}>
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
