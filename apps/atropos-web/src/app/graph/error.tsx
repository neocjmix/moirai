"use client";

export default function GraphReadingError({
  reset
}: {
  readonly reset: () => void;
}) {
  return (
    <main className="world-canvas">
      <section className="world-intro" role="alert">
        <p className="eyebrow">Atropos</p>
        <h1>선택한 World를 불러오지 못했습니다.</h1>
        <p>
          선택한 판본을 읽을 수 없습니다. 다른 판본으로 조용히 바꾸지
          않았습니다. 다시 시도하거나 공개 World에서 탐색을 이어 가세요.
        </p>
        <nav className="event-detail-navigation" aria-label="탐색 복구">
          <button className="text-action" type="button" onClick={reset}>
            다시 불러오기
          </button>
          <a className="text-action" href="/">
            공개 World 둘러보기
          </a>
        </nav>
      </section>
    </main>
  );
}
