export default function GraphReadingLoading() {
  return (
    <main className="world-canvas" aria-busy="true">
      <section className="world-intro" role="status">
        <p className="eyebrow">Atropos</p>
        <h1>World와 사건을 불러오는 중입니다.</h1>
        <p>선택한 범위의 이야기와 연결을 준비하고 있습니다.</p>
      </section>
    </main>
  );
}
