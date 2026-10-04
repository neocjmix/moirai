import { publishedWorldIds } from "../lib/publication";

/** Public artifact state only; never query canonical authoring storage. */
export async function WorldUnavailable({
  worldId,
  cause
}: {
  worldId: string;
  cause: unknown;
}) {
  const withdrawn =
    cause instanceof Error && cause.message === "v5_world_withdrawn";
  const pending = !withdrawn && (await publishedWorldIds()).includes(worldId);
  return (
    <main
      style={{
        padding: 24,
        maxWidth: 720,
        margin: "auto",
        overflowWrap: "anywhere"
      }}
    >
      <a href="/worlds">월드 선택</a>
      <h1>
        {withdrawn
          ? "철회된 월드입니다"
          : pending
            ? "공개본을 준비하고 있습니다"
            : "월드 공개본을 찾을 수 없습니다"}
      </h1>
      <p>
        {withdrawn
          ? "관리자가 복원하고 새 공개본이 준비되면 다시 탐색할 수 있습니다."
          : pending
            ? "아직 완성된 공개본이 없습니다. 잠시 후 다시 확인하세요."
            : "주소를 확인하세요. 새 월드는 첫 공개본 준비가 시작된 뒤 표시됩니다."}
      </p>
      {!withdrawn && <a href={`/graph/v5?world=${worldId}`}>다시 확인</a>}
    </main>
  );
}
