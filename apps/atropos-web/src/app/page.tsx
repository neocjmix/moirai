import { SYNTHETIC_FIXTURE } from "@moirai/contracts";
import { getPublicStatus } from "../lib/status";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const status = await getPublicStatus();
  const worldUrl = `/worlds/${SYNTHETIC_FIXTURE.worldId}`;
  return (
    <main className="landing">
      <div className="landing-mark" aria-hidden="true">
        A
      </div>
      <section className="landing-copy">
        <p className="eyebrow">MOIRAI · PUBLICATION</p>
        <h1>Atropos</h1>
        <p className="lead">출판된 세계의 현재 모습을 읽는 공개 표면입니다.</p>
        <a className="primary-action" href={worldUrl}>
          합성 세계 열기 <span>→</span>
        </a>
      </section>
      <section className="deployment-strip" aria-label="Current deployment">
        <span>served r{status.synthetic_world.served_revision}</span>
        <span className="deployment-dot" />
        <span>{status.synthetic_world.projection_status}</span>
        <span className="deployment-dot" />
        <span data-testid="commit-sha">
          {status.application.commit_sha.slice(0, 8)}
        </span>
      </section>
      <nav className="utility-nav" aria-label="Observation surfaces">
        <a href="/health">Health JSON</a>
        <a href="/__status">Status</a>
      </nav>
    </main>
  );
}
