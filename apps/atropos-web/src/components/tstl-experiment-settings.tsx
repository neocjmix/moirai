"use client";

import type { useTstlLayout } from "./use-tstl-layout";
import type { AppLocale } from "../urdr-port/src/locale";
import type { TstlLayoutChoice } from "../lib/tstl-layout-preference";
import { tstlCandidate } from "../lib/tstl-experiment-types";
import { TstlMembershipFallback } from "./tstl-membership-fallback";
import styles from "./tstl-experiment-settings.module.css";

type Props = { locale: AppLocale; layout: ReturnType<typeof useTstlLayout> };
const primaryChoices: TstlLayoutChoice[] = [
  "current",
  "B0",
  "bubble",
  "ribbon",
  "lanes",
  "aligned",
  "anchored"
];
const researchChoices: TstlLayoutChoice[] = ["A", "B", "C"];

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
    bubble: {
      label: "버블 · 부드러운 집합면",
      description:
        "B0와 같은 사건 위치에서 소속 사건을 감싸는 부드러운 면을 비교합니다. 겹치는 면의 의미는 아직 모두 검증되지 않았습니다."
    },
    ribbon: {
      label: "리본 · 시간 리본",
      description:
        "B0와 같은 사건 위치에서 시간 방향으로 이어지는 리본 모양의 면을 비교합니다. 리본이 이어져 보여도 사건 사이의 연속성을 증명하지는 않습니다."
    },
    lanes: {
      label: "분리 · 소속별 레인",
      description:
        "서로 다른 소속의 사건 묶음을 나눕니다. 국가별 방향이 일정하지만 공유 사건을 따라갈 때 가로 이동이 커질 수 있습니다."
    },
    aligned: {
      label: "흐름 · 구간 정렬",
      description:
        "공유 사건으로 이어지는 구간의 가로 이동을 줄입니다. 일부 국가 흐름이 좌우로 움직일 수 있습니다."
    },
    anchored: {
      label: "절충 · 국가 방향 유지",
      description:
        "국가별 단독 사건의 위치를 좁은 범위에 유지하며 공유 구간을 정렬합니다. 분리와 흐름의 절충을 비교합니다."
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
    bubble: {
      label: "Bubble · smooth set areas",
      description:
        "Compare smooth areas around member events at the same positions as B0. The meaning of overlapping areas is not fully verified."
    },
    ribbon: {
      label: "Ribbon · time ribbons",
      description:
        "Compare ribbon-shaped areas along time at the same event positions as B0. A continuous-looking ribbon does not prove continuity between events."
    },
    lanes: {
      label: "Lanes · separate memberships",
      description:
        "Separate groups with different memberships. Country orientation stays stable, but shared events can require longer sideways travel."
    },
    aligned: {
      label: "Aligned · shorter flow",
      description:
        "Reduce sideways travel between shared episodes. Some country flows can drift horizontally."
    },
    anchored: {
      label: "Anchored · stable country orientation",
      description:
        "Keep exclusive country episodes in narrow corridors while aligning shared episodes. Compare the separation and continuity tradeoff."
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
      <TstlChoices locale={locale} layout={layout} choices={primaryChoices} />
      <details
        data-testid="tstl-previous-candidates"
        open={researchChoices.includes(layout.mode) || undefined}
      >
        <summary>
          {ko ? "이전 연구 후보 · A/B/C" : "Previous research · A/B/C"}
        </summary>
        <p className={styles.previousDescription}>
          {ko
            ? "A·B·C는 서로 같은 사건 배치를 사용합니다. 버블·리본의 B0 기준 배치와는 다릅니다."
            : "A, B and C share their own event positions, which differ from the B0 positions used by Bubble and Ribbon."}
        </p>
        <TstlChoices
          locale={locale}
          layout={layout}
          choices={researchChoices}
        />
      </details>
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
      {layout.artifact &&
      layout.mode !== "current" &&
      layout.mode !== "B0" &&
      tstlCandidate(layout.artifact, layout.mode).memberships ? (
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
            ? "모든 후보는 동일한 r56의 539개 사건을 비교합니다. 버블·리본은 B0의 사건 가로·세로 위치를 보존합니다. 실험 면의 모든 교차 영역과 연결 의미가 검증된 것은 아닙니다. 분리된 면이나 연결선이 하나의 연결된 면을 보장하지 않습니다. 모든 후보에서 사건 ID와 시간 좌표는 보존하지만 이 스냅샷에는 원본 시간 정보 일부가 빠져 있습니다."
            : "All candidates compare the same 539 events at r56. Bubble and Ribbon preserve B0’s event X and Y positions. Not all filled overlaps or connections are semantically verified. Separate areas and connecting lines do not guarantee one connected area. Every candidate preserves event IDs and time coordinates, but some original temporal information is absent from this snapshot."}
        </p>
      </details>
    </section>
  );
}

function TstlChoices({
  locale,
  layout,
  choices
}: Props & { choices: TstlLayoutChoice[] }) {
  const ko = locale === "ko";
  const copy = modeCopy[ko ? "ko" : "en"];
  return (
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
  );
}

export function TstlExperimentCompare({
  locale,
  layout,
  drawerOpen = false
}: Props & { drawerOpen?: boolean }) {
  if (layout.mode === "current") return null;
  const ko = locale === "ko";
  const copy = modeCopy[ko ? "ko" : "en"];
  const choices = researchChoices.includes(layout.mode)
    ? [...primaryChoices, layout.mode]
    : primaryChoices;
  const shortLabels: Record<TstlLayoutChoice, string> = {
    current: ko ? "운영" : "Current",
    B0: "B0",
    bubble: ko ? "버블" : "Bubble",
    ribbon: ko ? "리본" : "Ribbon",
    lanes: ko ? "분리" : "Lanes",
    aligned: ko ? "흐름" : "Aligned",
    anchored: ko ? "절충" : "Anchored",
    A: "A",
    B: "B",
    C: "C"
  };
  return (
    <div
      className={styles.compare}
      data-testid="tstl-layout-status"
      data-drawer-open={drawerOpen}
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
          {shortLabels[choice]}
        </button>
      ))}
    </div>
  );
}
