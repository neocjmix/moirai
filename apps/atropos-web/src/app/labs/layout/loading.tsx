import "../../../labs/layout/layout-lab.css";

/** Stream a visible shell before the read-only whole-World snapshot finishes.
 * The Lab still loads a single pinned revision; tuning remains entirely local. */
export default function LayoutLabLoading() {
  return (
    <main className="layout-lab lab-loading" data-testid="lab-loading">
      <p className="lab-eyebrow">모이라이 · 연구용</p>
      <h1>실험실을 여는 중입니다</h1>
      <p role="status" aria-live="polite">
        공개된 역사 자료를 한 번 읽고 있습니다. 사건이 많으면 수십 초가 걸릴 수
        있습니다. 준비되면 자동으로 지도가 나타납니다.
      </p>
      <p>자료를 읽은 뒤에는 확대나 설정 조절을 이 기기 안에서 처리합니다.</p>
      <p>
        <a href="/labs/layout?demo=1">기다리지 않고 연습 자료로 실험하기</a>
      </p>
    </main>
  );
}
