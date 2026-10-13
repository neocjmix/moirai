"use client";

import type { useTstlLayout } from "./use-tstl-layout";
import type { AppLocale } from "../urdr-port/src/locale";
import type { TstlLayoutChoice } from "../lib/tstl-layout-preference";
import { TstlMembershipFallback } from "./tstl-membership-fallback";
import styles from "./tstl-experiment-settings.module.css";

type Props = { locale: AppLocale; layout: ReturnType<typeof useTstlLayout> };
const choices: TstlLayoutChoice[] = ["current", "B0", "A", "B", "C"];

const modeCopy = {
  ko: {
    current: {
      label: "현재 운영",
      description: "현재 발행된 레이아웃을 사용합니다."
    },
    B0: {
      label: "B0 · r56 기준선",
      description: "같은 r56에 발행된 기존 면을 비교 기준으로 사용합니다."
    },
    A: {
      label: "후보 A · 분리된 면",
      description:
        "사건의 배치를 조정하고 시간 구간별 면을 그립니다. 한 묶음이 여러 면으로 나뉠 수 있으며, 면을 만들지 못한 묶음은 점과 목록으로 표시합니다."
    },
    B: {
      label: "후보 B · 분기하는 면",
      description:
        "A와 같은 사건 배치에서 장애물을 피해 분기하는 경로와 좁은 면을 비교합니다. 제한된 탐색으로 구성하며, 연결하지 못한 부분은 선·점·목록으로 남습니다."
    },
    C: {
      label: "후보 C · 중심선과 연결",
      description:
        "A와 같은 사건 배치에서 묶음의 세로 중심선과 소속 사건의 연결을 표시하고 사건 주변에만 작은 면을 둡니다. 선의 교차는 새 관계를 뜻하지 않습니다."
    }
  },
  en: {
    current: {
      label: "Current",
      description: "Use the currently published layout."
    },
    B0: {
      label: "B0 · r56 baseline",
      description: "Compare the existing areas published for the same r56."
    },
    A: {
      label: "Candidate A · separate areas",
      description:
        "Adjust event positions and draw areas in time bands. A group may split into several areas; groups without an area use points and lists."
    },
    B: {
      label: "Candidate B · branching areas",
      description:
        "Use A’s event positions to compare obstacle-avoiding branches and narrow filled corridors. Routing is bounded; unresolved parts remain lines, points or lists."
    },
    C: {
      label: "Candidate C · spines and links",
      description:
        "Use A’s event positions with vertical group spines, member links and small areas only around events. Crossing lines do not imply a new relationship."
    }
  }
} satisfies Record<
  "ko" | "en",
  Record<TstlLayoutChoice, { label: string; description: string }>
>;

export function TstlExperimentSettings({ locale, layout }: Props) {
  const ko = locale === "ko";
  const copy = modeCopy[ko ? "ko" : "en"];
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
          ? "같은 역사 데이터에서 면과 연결 방식을 비교합니다. 확대·이동·선택은 그대로 사용하며 이 브라우저에만 적용됩니다."
          : "Compare areas and connections on the same history data using the usual zoom, pan and selection. This preference applies only to this browser."}
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
            <span className={styles.choiceLabel}>{copy[choice].label}</span>
            <span className={styles.choiceDescription}>
              {copy[choice].description}
            </span>
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
                ? `${copy[layout.pending].label} 불러오는 중…`
                : `Loading ${copy[layout.pending].label}…`
              : ko
                ? `적용 중: ${copy[layout.mode].label}`
                : `Active: ${copy[layout.mode].label}`}
      </p>
      {layout.artifact && (layout.mode === "B" || layout.mode === "C") ? (
        <TstlMembershipFallback
          key={layout.mode}
          artifact={layout.artifact}
          mode={layout.mode}
          locale={locale}
        />
      ) : null}
      <details>
        <summary>{ko ? "실험 범위와 한계" : "Scope and limitations"}</summary>
        <p>
          {ko
            ? "B0·A·B·C는 동일한 r56의 539개 사건을 비교합니다. A·B·C는 사건의 가로 위치도 공유하므로 표현 방식을 직접 비교할 수 있습니다. 실험 면의 모든 교차 영역과 연결 의미가 검증된 것은 아닙니다. 분리된 면이나 연결선이 하나의 연결된 면을 보장하지 않습니다. 사건 ID와 시간 좌표는 보존하지만 이 스냅샷에는 원본 시간 정보 일부가 빠져 있습니다."
            : "B0, A, B and C compare the same 539 events at r56. A, B and C also share event X positions so their geometry can be compared directly. Not all filled overlaps or connections are semantically verified. Separate areas and connecting lines do not guarantee one connected area. Event IDs and time coordinates are preserved, but some original temporal information is absent from this snapshot."}
        </p>
      </details>
    </section>
  );
}

export function TstlExperimentCompare({ locale, layout }: Props) {
  if (layout.mode === "current") return null;
  const ko = locale === "ko";
  const copy = modeCopy[ko ? "ko" : "en"];
  return (
    <div
      className={styles.compare}
      data-testid="tstl-layout-status"
      data-mode={layout.mode}
      role="group"
      aria-label={ko ? "실험 레이아웃 비교" : "Compare experimental layouts"}
    >
      <span>{ko ? "실험 · r56" : "Lab · r56"}</span>
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          data-testid={`tstl-compare-${choice}`}
          aria-pressed={layout.mode === choice}
          aria-label={copy[choice].label}
          title={copy[choice].label}
          onClick={() => void layout.choose(choice)}
        >
          {choice === "current" ? (ko ? "운영" : "Current") : choice}
        </button>
      ))}
    </div>
  );
}
