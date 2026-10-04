import { WorldUnavailable } from "../../../../components/world-unavailable";
import { notFound } from "next/navigation";
import { readV5StagedDocument } from "@moirai/publication/v5";
import { assertPublicId } from "../../../../lib/publication";
import { v5ShellReader } from "../../../../lib/v5-shell-reader";
export const dynamic = "force-dynamic";
export default async function EventsPage({
  params,
  searchParams
}: {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ page?: string; event?: string }>;
}) {
  const { worldId } = await params;
  const query = await searchParams;
  const page = Number(query.page ?? 0);
  if (!Number.isSafeInteger(page) || page < 0) notFound();
  try {
    assertPublicId(worldId);
    if (query.event) assertPublicId(query.event);
  } catch {
    notFound();
  }
  const result = await v5ShellReader(worldId).then(
    (shell) => ({ shell, cause: null }),
    (cause: unknown) => ({ shell: null, cause })
  );
  if (!result.shell)
    return <WorldUnavailable worldId={worldId} cause={result.cause} />;
  const shell = result.shell;
  const { store, pointer, rootBody, reader } = shell;
  const read = (suffix: string) =>
    readV5StagedDocument(
      rootBody,
      `worlds/${worldId}/revisions/${pointer.served_revision}/v5/content/${suffix}`,
      async (key) => (await store.get(key)).body
    );
  const body = await read("world.json");
  if (!body) notFound();
  const summary = JSON.parse(body) as {
    world: { title: string };
    event_count: number;
    event_page_count?: number;
  };
  const count = summary.event_page_count ?? 0;
  if (page >= count && page !== 0) notFound();
  const eventsBody = count ? await read(`events/pages/${page}.json`) : null;
  const events = eventsBody
    ? (
        JSON.parse(eventsBody) as {
          events: { id: string; title: string; summary: string | null }[];
        }
      ).events
    : [];
  const selected = query.event ? await reader.event(query.event) : null;
  if (query.event && !selected) notFound();
  return (
    <main
      style={{
        padding: "24px",
        maxWidth: 720,
        margin: "auto",
        overflowWrap: "anywhere"
      }}
    >
      <nav>
        <a href="/worlds">월드 선택</a> ·{" "}
        <a href={`/graph/v5?world=${worldId}`}>그래프</a>
      </nav>
      <h1>{summary.world.title}</h1>
      <h2>사건 {summary.event_count}개</h2>
      {selected && (
        <article aria-label="선택한 사건">
          <h2>{selected.event.title}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{selected.narrative.body}</p>
          {selected.narrative.public_references.map((ref, i) => (
            <p key={i}>
              <a href={ref.url}>{ref.label}</a>
            </p>
          ))}
          <a href={`/graph/v5?world=${worldId}&event=${selected.event.id}`}>
            그래프에서 보기
          </a>
        </article>
      )}
      {summary.event_count === 0 && <p>아직 사건이 없습니다.</p>}
      {summary.event_count > 0 && summary.event_page_count === undefined && (
        <p>이 공개본은 사건 목록을 지원하지 않습니다. 그래프에서 탐색하세요.</p>
      )}
      <ul>
        {events.map((event) => (
          <li key={event.id} style={{ padding: "12px 0" }}>
            <a href={`?page=${page}&event=${event.id}`}>{event.title}</a>
            <p>{event.summary}</p>
          </li>
        ))}
      </ul>
      <nav aria-label="사건 페이지">
        {page > 0 && <a href={`?page=${page - 1}`}>이전</a>}{" "}
        {page + 1 < count && <a href={`?page=${page + 1}`}>다음</a>}
      </nav>
    </main>
  );
}
