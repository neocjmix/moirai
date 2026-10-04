import { LayoutLab } from "../../../labs/layout/layout-lab";
import { createSyntheticLabSnapshot } from "../../../labs/layout/fixtures";
import { loadLayoutLabSnapshot } from "../../../labs/layout/load-snapshot";
import { assertPublicId } from "../../../lib/publication";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moirai · Composite & Layout Lab" };

/** Independent research entry. No GraphShell, tile client, worker, or runtime
 * production layout flag is involved. The client receives one immutable input. */
export default async function LayoutLabPage({
  searchParams
}: {
  searchParams: Promise<{
    world?: string;
    revision?: string;
    timeSystem?: string;
    demo?: string;
  }>;
}) {
  const query = await searchParams;
  if (query.demo === "1" || !query.world)
    return <LayoutLab initialSnapshot={createSyntheticLabSnapshot()} />;
  try {
    assertPublicId(query.world);
    if (query.timeSystem) assertPublicId(query.timeSystem);
    const revision =
      query.revision === undefined ? undefined : Number(query.revision);
    if (
      revision !== undefined &&
      (!Number.isSafeInteger(revision) ||
        revision < 1 ||
        !/^[1-9][0-9]*$/.test(query.revision!))
    )
      throw Error("invalid_revision");
    const snapshot = await loadLayoutLabSnapshot(
      query.world,
      revision,
      query.timeSystem
    );
    return <LayoutLab initialSnapshot={snapshot} />;
  } catch (error) {
    const changed =
      error instanceof Error &&
      error.message === "lab_snapshot_revision_changed";
    return (
      <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 600 }}>
        <h1>Layout Lab snapshot</h1>
        <p>
          {changed
            ? "요청한 revision과 현재 공개 revision이 다릅니다. 저장한 JSON snapshot을 synthetic Lab에서 import하면 당시 실험을 복원할 수 있습니다."
            : "이 World의 완전한 공개 snapshot을 읽을 수 없습니다. ID·발행 상태를 확인하거나 synthetic fixture를 사용하세요."}
        </p>
        <a href="/labs/layout?demo=1">Synthetic Lab / preset import</a>
        {changed && (
          <p>
            <a href={`/labs/layout?world=${encodeURIComponent(query.world)}`}>
              현재 공개 revision으로 새 실험 열기
            </a>
          </p>
        )}
      </main>
    );
  }
}
