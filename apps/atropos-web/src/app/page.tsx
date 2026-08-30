import { getPublicStatus } from "../lib/status";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const status = await getPublicStatus();

  return (
    <main>
      <p className="eyebrow">MOIRAI · PUBLIC INTEGRATION</p>
      <h1>Atropos</h1>
      <p className="lead">
        독자가 출판된 세계를 탐색할 공개 표면입니다. Milestone 0에서는 전달,
        관측과 보안 경계만 검증합니다.
      </p>

      <section aria-labelledby="deployment-title">
        <h2 id="deployment-title">Current deployment</h2>
        <dl>
          <div>
            <dt>Commit</dt>
            <dd data-testid="commit-sha">{status.application.commit_sha}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{status.application.version}</dd>
          </div>
          <div>
            <dt>Synthetic World</dt>
            <dd>{status.synthetic_world.world_id}</dd>
          </div>
          <div>
            <dt>Projection</dt>
            <dd>{status.synthetic_world.projection_status}</dd>
          </div>
          <div>
            <dt>Last smoke</dt>
            <dd>{status.smoke.result}</dd>
          </div>
        </dl>
      </section>

      <nav aria-label="Observation surfaces">
        <a href="/health">Health JSON</a>
        <a href="/__status">Status</a>
      </nav>
    </main>
  );
}
