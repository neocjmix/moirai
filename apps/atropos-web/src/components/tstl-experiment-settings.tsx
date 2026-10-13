"use client";

import type { useTstlLayout } from "./use-tstl-layout";
import type { AppLocale } from "../urdr-port/src/locale";
import type { TstlLayoutChoice } from "../lib/tstl-layout-preference";
import styles from "./tstl-experiment-settings.module.css";

type Props = { locale: AppLocale; layout: ReturnType<typeof useTstlLayout> };
const choices: TstlLayoutChoice[] = ["current", "B0", "A"];

export function TstlExperimentSettings({ locale, layout }: Props) {
  const ko = locale === "ko";
  const labels = ko
    ? { current: "현재 운영", B0: "B0 · r56 기준선", A: "후보 A · r56" }
    : { current: "Current", B0: "B0 · r56 baseline", A: "Candidate A · r56" };
  return (
    <section
      className={styles.section}
      data-testid="tstl-layout-settings"
      aria-labelledby="tstl-settings-title"
    >
      <h2 id="tstl-settings-title">
        {ko ? "실험실 · 레이아웃" : "Labs · Layout"}
      </h2>
      <p>
        {ko
          ? "같은 역사 데이터에서 면의 배치를 비교합니다. 확대·이동·선택은 그대로 사용하며 이 브라우저에만 적용됩니다."
          : "Compare areas on the same history data using the usual zoom, pan and selection. This preference applies only to this browser."}
      </p>
      <div
        className={styles.choices}
        role="group"
        aria-label={ko ? "레이아웃 방식" : "Layout mode"}
      >
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            data-testid={`tstl-layout-${choice}`}
            aria-pressed={layout.mode === choice}
            disabled={choice !== "current" && !layout.available}
            onClick={() => void layout.choose(choice)}
          >
            {labels[choice]}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite">
        {!layout.available
          ? ko
            ? "이 실험은 역사 World의 r56에서 사용할 수 있습니다."
            : "This experiment is available for the history World at r56."
          : layout.failed
            ? ko
              ? "실험 데이터를 불러오지 못했습니다. 선택을 다시 눌러 재시도하세요. 현재 화면은 유지됩니다."
              : "Could not load the experiment. Select a mode to retry. The current view is preserved."
            : layout.pending
              ? ko
                ? `${labels[layout.pending]} 불러오는 중…`
                : `Loading ${labels[layout.pending]}…`
              : ko
                ? `적용 중: ${labels[layout.mode]}`
                : `Active: ${labels[layout.mode]}`}
      </p>
      <details>
        <summary>{ko ? "실험 범위와 한계" : "Scope and limitations"}</summary>
        <p>
          {ko
            ? "B0와 A는 동일한 r56의 539개 사건을 비교합니다. A의 면은 검토용 실험 표현이며 모든 교차 영역의 의미가 검증된 것은 아닙니다. 면을 구성하지 못한 4개 묶음은 점과 목록으로 표시합니다. 시간 좌표는 보존하지만 이 스냅샷에는 원본 시간 정보 일부가 빠져 있습니다."
            : "B0 and A compare the same 539 events at r56. A’s filled areas are experimental; not all overlap regions are semantically verified. Four groups without an area use points and lists. Time coordinates are preserved, but some original temporal information is absent from this snapshot."}
        </p>
      </details>
    </section>
  );
}

export function TstlExperimentCompare({ locale, layout }: Props) {
  if (layout.mode === "current") return null;
  return (
    <div
      className={styles.compare}
      data-testid="tstl-layout-status"
      data-mode={layout.mode}
    >
      <span>{locale === "ko" ? "실험 · r56" : "Lab · r56"}</span>
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          data-testid={`tstl-compare-${choice}`}
          aria-pressed={layout.mode === choice}
          onClick={() => void layout.choose(choice)}
        >
          {choice === "current"
            ? locale === "ko"
              ? "운영"
              : "Current"
            : choice}
        </button>
      ))}
    </div>
  );
}
