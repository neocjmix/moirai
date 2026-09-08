import { getPublicStatus } from "../lib/status";
import { readPublishedWorlds } from "../lib/publication";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [status, directory] = await Promise.all([
    getPublicStatus(),
    readPublishedWorlds()
      .then((worlds) => ({ state: "ready" as const, worlds }))
      .catch(() => ({ state: "unavailable" as const, worlds: [] }))
  ]);
  const readyWorlds = directory.worlds.filter(
    (entry) => entry.availability === "ready"
  );
  return (
    <main className="landing observation-home">
      <div className="landing-mark" aria-hidden="true">
        A
      </div>
      <section className="landing-copy">
        <p className="eyebrow">MOIRAI · PUBLICATION</p>
        <h1>Atropos</h1>
        <p className="lead">
          실제로 출판되어 현재 서비스 중인 World와 Canon을 관측하는 공개
          표면입니다.
        </p>
      </section>
      <section className="world-observatory" aria-labelledby="worlds-title">
        <div className="observatory-heading">
          <div>
            <p className="eyebrow">PUBLICATION STORE · CURRENT POINTERS</p>
            <h2 id="worlds-title">공개 World</h2>
          </div>
          <span className="world-count">
            {directory.state === "ready" ? readyWorlds.length : "—"}
          </span>
        </div>
        {directory.state === "unavailable" ? (
          <div className="observatory-empty" role="status">
            <strong>Publication Store를 조회할 수 없습니다.</strong>
            <span>공개 상태 JSON에서 배포 상태를 함께 확인할 수 있습니다.</span>
          </div>
        ) : directory.worlds.length === 0 ? (
          <div className="observatory-empty" role="status">
            <strong>아직 공개된 World가 없습니다.</strong>
            <span>
              첫 Publication의 current pointer가 생성되면 여기에 나타납니다.
            </span>
          </div>
        ) : (
          <div className="published-world-list">
            {directory.worlds.map((entry) =>
              entry.availability === "ready" ? (
                <article className="published-world-card" key={entry.worldId}>
                  <div className="world-card-heading">
                    <div>
                      <p className="eyebrow">
                        SERVED REVISION {entry.pointer.served_revision}
                      </p>
                      <h3>{entry.world.title}</h3>
                    </div>
                    <a
                      className="world-open-action"
                      href={`/worlds/${entry.world.id}`}
                      aria-label={`${entry.world.title} World 열기`}
                    >
                      World 열기 →
                    </a>
                  </div>
                  {entry.world.description ? (
                    <p>{entry.world.description}</p>
                  ) : null}
                  <code>{entry.world.id}</code>
                  <div
                    className="canon-observation-list"
                    aria-label="공개 Canon"
                  >
                    {entry.canons.map((canon) => (
                      <a
                        href={`/worlds/${entry.world.id}/canons/${canon.id}`}
                        key={canon.id}
                      >
                        <span>{canon.title}</span>
                        <small>Canon 관측면 →</small>
                      </a>
                    ))}
                  </div>
                </article>
              ) : (
                <article
                  className="published-world-card unavailable"
                  key={entry.worldId}
                >
                  <p className="eyebrow">PUBLICATION INCONSISTENCY</p>
                  <h3>World 문서를 읽을 수 없습니다.</h3>
                  <code>{entry.worldId}</code>
                </article>
              )
            )}
          </div>
        )}
      </section>
      <section className="deployment-strip" aria-label="Current deployment">
        <a href="/status-public">공개 상태</a>
        <span className="deployment-dot" />
        <span>smoke {status.smoke.result}</span>
        <span className="deployment-dot" />
        <span data-testid="commit-sha">
          {status.application.commit_sha.slice(0, 8)}
        </span>
      </section>
      <nav className="utility-nav" aria-label="Observation surfaces">
        <a href="/health">Health JSON</a>
        <a href="/__status">Runtime JSON</a>
      </nav>
    </main>
  );
}
