import { LayoutLab } from "../../../labs/layout/layout-lab";
import { createSyntheticLabSnapshot } from "../../../labs/layout/fixtures";
import { loadLayoutLabSnapshot } from "../../../labs/layout/load-snapshot";
import { assertPublicId } from "../../../lib/publication";

export const dynamic = "force-dynamic";
export const metadata = { title: "모이라이 · 사건 표현·배치 실험실" };

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
        <h1>실험에 쓸 사건 자료를 열 수 없습니다</h1>
        <p>
          {changed
            ? "요청한 자료 버전과 지금 공개된 버전이 다릅니다. 전에 저장한 실험 파일이 있다면 연습 자료 화면에서 그 파일을 열어 당시 조건을 복원할 수 있습니다."
            : "요청한 사건 세계의 공개 자료를 모두 읽지 못했습니다. 주소를 확인하거나 잠시 뒤 다시 열어 주세요. 연습 자료에서는 바로 실험할 수 있습니다."}
        </p>
        <a href="/labs/layout?demo=1">연습 자료 열기 · 저장한 실험 다시 열기</a>
        {changed && (
          <p>
            <a href={`/labs/layout?world=${encodeURIComponent(query.world)}`}>
              지금 공개된 자료로 새 실험 시작하기
            </a>
          </p>
        )}
      </main>
    );
  }
}
