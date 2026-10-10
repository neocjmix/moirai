import type { RepresentationConfig } from "./representation";

type ControlCopy = {
  label: string;
  description: string;
  options?: Record<string, string>;
};

/** Lab-only reading aids. Algorithm IDs, parameter values and saved inputs are unchanged. */
export const LAYOUT_COPY: Record<
  string,
  {
    title: string;
    description: string;
    parameters: Record<string, ControlCopy>;
  }
> = {
  "legacy-force": {
    title: "서로 밀고 당기는 배치 · 이전 기준",
    description:
      "사건끼리는 가로로 벌리고, 관계가 있는 사건은 서로 모으며 배치를 다듬습니다. 여러 값이 함께 작용하므로 한 값을 바꾼 효과가 다른 값에 따라 달라질 수 있습니다. 사건의 시간 위치는 그대로 둡니다.",
    parameters: {
      iterations: {
        label: "배치를 다듬는 횟수",
        description:
          "늘리면 밀고 당기는 계산을 더 반복합니다. 뒤로 갈수록 이동을 줄이는 과정도 함께 달라져, 최종 모양이 바뀔 수 있습니다."
      },
      repulsion: {
        label: "사건을 벌리는 힘",
        description:
          "값이 클수록 가까운 사건을 가로로 더 벌리려 합니다. 한 번에 옮길 수 있는 거리가 작으면 효과가 제한됩니다. 겹침을 모두 없애는 값은 아닙니다."
      },
      causesAttraction: {
        label: "이전 방식의 끌어당김 · 현재 적용 안 됨",
        description:
          "이전 입력 방식에만 쓰이는 값입니다. 현재 실험 자료에서는 바꿔도 배치가 달라지지 않습니다. 인과관계에는 아래 ‘연결된 사건을 모으는 힘’이 적용됩니다."
      },
      temporalAttraction: {
        label: "연결된 사건을 모으는 힘",
        description:
          "시간 관계나 인과관계로 연결된 사건을 가로로 모읍니다. ‘사건을 벌리는 힘’과 반대 방향으로 작용합니다."
      },
      maxStep: {
        label: "한 번에 옮길 수 있는 거리",
        description:
          "한 차례 계산에서 사건이 가로로 움직일 수 있는 최대 거리입니다. 작게 두면 다른 힘을 크게 바꿔도 결과 차이가 작을 수 있습니다. 기준 가로 칸을 1로 보는 거리이며 화면 픽셀과는 다릅니다."
      },
      repulsionMode: {
        label: "서로 벌릴 사건의 범위",
        description:
          "전체 사건을 서로 비교할지, 시간상 가까운 사건만 비교할지 정합니다. 자동은 묶음 사건과 시간 위치가 없는 사건까지 합쳐 500개를 넘으면 가까운 사건만 비교합니다.",
        options: {
          auto: "자동 · 500개 초과 시 가까운 사건만",
          all: "모든 사건을 서로 비교",
          bounded: "시간상 가까운 사건만 비교"
        }
      },
      neighborsPerSide: {
        label: "앞뒤로 비교할 사건 수",
        description:
          "가까운 사건만 비교할 때, 시간순으로 앞쪽과 뒤쪽에서 각각 몇 개까지 볼지 정합니다. 모든 사건을 비교하는 설정에서는 쓰이지 않습니다."
      },
      windowYears: {
        label: "가까운 사건으로 볼 시간 범위",
        description:
          "가까운 사건만 비교할 때 적용하는 시간 범위입니다. 연도 기준 자료에서는 1이 약 1년입니다. 앞뒤 사건 수와 이 시간 범위를 모두 만족해야 서로 비교합니다."
      }
    }
  },
  "global-incidence": {
    title: "전역 incidence · 데이터 기반 중심",
    description:
      "전체 세계의 컬렉션 소속과 사건 관계에서 가로 중심을 계산합니다. 공유 사건은 하나로 유지하고 시간 위치는 그대로 둡니다. 희박한 공유 관계도 전역 중심에 영향을 줄 수 있습니다.",
    parameters: {
      iterations: {
        label: "배치를 다듬는 횟수",
        description: "소속과 관계에 따른 가로 배치 계산을 반복하는 횟수입니다."
      },
      windowYears: {
        label: "사건 관계의 시간 척도",
        description:
          "시간이 멀리 떨어진 사건 사이의 관계와 반발을 줄이는 척도입니다. 컬렉션 중심은 전체 기간을 사용합니다."
      },
      spacing: {
        label: "가로 분리의 기준 거리",
        description:
          "사건을 벌리는 기준 거리입니다. 컬렉션 사이의 목표 간격은 규모와 공유 비율에 따라 달라집니다."
      },
      cohesion: {
        label: "소속 컬렉션으로 모으는 힘",
        description:
          "사건을 소속 컬렉션의 계산된 중심으로 모으는 정도입니다. 여러 소속은 정규화해 함께 반영합니다."
      },
      relation: {
        label: "연결된 사건을 모으는 힘",
        description:
          "구성·인과·선후 관계로 연결된 사건을 가로로 모으는 정도입니다."
      }
    }
  },
  "deterministic-slots": {
    title: "시간순으로 빈 칸에 놓는 배치 · 비교용",
    description:
      "시간이 이른 사건부터 가로 칸에 놓고, 충분한 시간이 지난 칸은 다시 씁니다. 같은 자료와 값이면 같은 결과를 만듭니다. 제목이나 묶음 영역의 겹침까지 해결하는 방식은 아닙니다.",
    parameters: {
      slotSpacing: {
        label: "가로 칸 사이 간격",
        description:
          "값을 키우면 나란히 놓인 사건이 가로로 더 멀어집니다. 배치 좌표 단위이며 확대 정도에 따라 화면에서 보이는 간격은 달라집니다."
      },
      collisionWindowYears: {
        label: "같은 칸을 다시 쓰는 시간 간격",
        description:
          "이 시간보다 더 떨어진 사건은 같은 가로 칸을 쓸 수 있습니다. 값을 키우면 다른 칸에 놓이는 사건이 늘어납니다. 연도 기준 자료에서는 1이 약 1년입니다."
      }
    }
  }
};

export const REPRESENTATION_COPY: Record<
  keyof RepresentationConfig,
  ControlCopy
> = {
  hullOpacityScale: {
    label: "영역 진하기",
    description:
      "영역 단계에서 묶음의 면과 테두리를 얼마나 진하게 그릴지 정합니다. 0이면 숨기고, 1이면 최대 진하기입니다. 겹치는 이름은 생략될 수 있습니다."
  },
  hullLabelOpacity: {
    label: "영역 단계의 이름표 진하기",
    description:
      "영역으로 보이는 묶음의 이름표를 조절합니다. 0이면 숨기고, 1이면 최대 진하기입니다. 겹치는 이름은 생략될 수 있습니다."
  },
  ordinaryPointOpacityScale: {
    label: "보통 점 진하기",
    description:
      "보통 점 단계의 사건과 묶음 점을 조절합니다. 0이면 숨기고, 1이면 최대 진하기입니다. 겹치는 이름은 생략될 수 있습니다."
  },
  ordinaryLabelOpacity: {
    label: "보통 점 단계의 이름표 진하기",
    description:
      "보통 점으로 보이는 사건과 묶음의 이름표를 조절합니다. 0이면 숨기고, 1이면 최대 진하기입니다. 겹치는 이름은 생략될 수 있습니다."
  },
  smallPointOpacityScale: {
    label: "작은 점 진하기",
    description:
      "작은 점 단계의 점을 조절합니다. 밀집도에 따른 흐려짐도 함께 적용됩니다. 0이면 숨기고, 1이면 최대 진하기입니다. 겹치는 이름은 생략될 수 있습니다."
  },
  smallLabelOpacity: {
    label: "작은 점 단계의 이름표 진하기",
    description:
      "기본은 0으로 이름을 숨깁니다. 값을 올려 작은 점에도 이름을 붙이는 실험을 할 수 있습니다. 0이면 숨기고, 1이면 최대 진하기입니다. 겹치는 이름은 생략될 수 있습니다."
  },
  showHulls: {
    label: "묶음 영역 표시",
    description:
      "묶음 사건을 둘러싼 영역을 표시합니다. 영역을 꺼도 사건의 구성 관계는 그대로입니다."
  },
  showOrdinaryPoints: {
    label: "보통 크기 점 표시",
    description: "일반 사건과 작게 축소된 묶음 사건의 보통 점을 표시합니다."
  },
  showSmallPoints: {
    label: "작은 점 표시",
    description:
      "사건이 많을 때 줄여 그리는 작은 점을 표시합니다. 이름 표시 여부는 작은 점 단계의 이름표 진하기로 정합니다."
  },
  showLabels: {
    label: "사건 이름 표시",
    description:
      "사건과 묶음 사건의 이름 전체를 화면 경계까지 표시합니다. 서로 겹치는 이름은 생략될 수 있습니다."
  },
  showChildren: {
    label: "구성 사건 표시",
    description:
      "켜면 묶음을 충분히 확대했을 때 그 안의 구성 사건이 나타납니다. 끄면 구성 사건을 숨기지만 실제 구성 관계는 바꾸지 않습니다."
  },
  showRelations: {
    label: "사건 사이 연결선 표시",
    description: "양쪽 사건이 보일 때 그 사이의 관계를 선으로 표시합니다."
  },
  compactThresholdPx: {
    label: "영역을 점으로 바꾸는 크기 · 픽셀",
    description:
      "묶음의 가로·세로 길이가 모두 이 값 이하로 작아지면 점으로 읽기 시작합니다. 값을 키우면 더 큰 묶음도 점으로 표시됩니다."
  },
  hullFadePx: {
    label: "영역과 점이 겹쳐 바뀌는 폭 · 픽셀",
    description:
      "위 기준 크기부터 이 폭에 걸쳐 점과 영역이 서서히 바뀝니다. 값을 키우면 변화 구간이 넓어집니다. 변화에 걸리는 시간은 아래에서 따로 조절합니다."
  },
  hullBorderFadeStartPx: {
    label: "테두리만 숨기는 크기 · 픽셀",
    description:
      "묶음의 가로·세로 길이가 모두 이 값 이하이면 테두리를 숨깁니다. 영역의 색과 이름은 남아 점으로 바뀌기 전까지 보입니다."
  },
  hullBorderFadePx: {
    label: "테두리가 서서히 나타나는 폭 · 픽셀",
    description:
      "위 크기에서 이 폭만큼 확대하면 테두리가 완전히 나타납니다. 0이면 테두리를 따로 숨기는 단계를 사용하지 않습니다."
  },
  hullBorderlessOpacityScale: {
    label: "테두리 없는 영역의 면 진하기",
    description:
      "중간 단계의 면을 조금 흐리게 합니다. 이름표 진하기는 그대로 유지합니다."
  },
  compositePointSizeStages: {
    label: "묶음 크기에 맞춰 점 단계 전환",
    description:
      "묶음 자체의 화면 크기에 따라 보통 점, 작은 점, 숨김을 이어 줍니다. 끄면 이전 설정의 밀집 순위를 사용합니다."
  },
  smallCompositeSpanPx: {
    label: "묶음이 작은 점이 되는 크기 · 픽셀",
    description:
      "이 크기까지 줄어들면 작은 점으로 표시합니다. 보통 점 크기 기준 사이에서 부드럽게 이어집니다."
  },
  ordinaryCompositeSpanPx: {
    label: "묶음이 보통 점이 되는 크기 · 픽셀",
    description:
      "영역에서 점으로 넘어온 묶음은 이 크기 이상일 때 보통 점으로 보입니다."
  },
  hiddenCompositeSpanPx: {
    label: "묶음 점이 숨겨지는 크기 · 픽셀",
    description:
      "작은 점이 이 크기까지 줄어들면 숨겨집니다. 확대하면 같은 순서로 복원됩니다."
  },
  visibleCompositeSpanPx: {
    label: "묶음 점이 완전히 보이는 크기 · 픽셀",
    description: "숨김 크기부터 여기까지 작은 점이 서서히 나타납니다."
  },
  stagedHierarchy: {
    label: "시간축과 상하위 순서에 맞춘 전환",
    description:
      "세로 시간 길이를 우선하고 가로 길이는 20%만 반영합니다. 자식 묶음이 줄어든 뒤 상위 묶음이 같은 단계를 따라갑니다. 끄면 저장된 이전 방식으로 비교합니다."
  },
  sequentialChildPoints: {
    label: "상위 묶음 전환에 자식 점 연결",
    description:
      "상위 묶음이 접히면 자식 사건의 이름이 먼저 사라지고 작은 점으로 줄어든 뒤 숨겨집니다."
  },
  childRevealBySpan: {
    label: "상위 묶음의 가로·세로 크기로 구성 사건 표시",
    description:
      "시간축·상하위 전환을 끈 경우에만 사용합니다. 켜면 가로·세로 중 큰 쪽, 끄면 세로 길이로 구성 사건을 표시합니다."
  },
  compactHysteresisPx: {
    label: "다시 확대할 때 점을 유지하는 여유 · 픽셀",
    description:
      "점이 된 묶음을 다시 확대할 때 이만큼 더 커질 때까지 점 쪽의 이름 표시 판단을 유지합니다. 경계에서 조금 오르내릴 때 표시가 자주 바뀌는 것을 줄입니다."
  },
  childRevealHeightPx: {
    label: "구성 사건이 모두 보이는 크기 · 픽셀",
    description:
      "묶음의 화면 크기가 이 값에 도달하면 구성 사건이 완전히 보입니다. 가로·세로 크기 설정이 표시 기준을 정합니다. 0이면 크기 때문에 숨기지 않습니다."
  },
  childFadeStartRatio: {
    label: "구성 사건이 나타나기 시작하는 비율",
    description:
      "위 크기의 얼마부터 나타날지 정합니다. 예를 들어 100픽셀과 0.58이면 58픽셀에서 나타나기 시작해 100픽셀에서 완전히 보입니다."
  },
  normalPointCount: {
    label: "보통 점으로 남길 순위 기준",
    description:
      "화면 안 사건을 정해진 순서로 나열했을 때 앞쪽 몇 개까지 보통 점으로 둘지 정합니다. 묶음 사건도 함께 셉니다. 다음 ‘보통 점을 유지하는 여유’에 따라 실제 개수는 달라질 수 있습니다."
  },
  normalHysteresisCount: {
    label: "보통 점을 유지하는 여유 · 사건 수",
    description:
      "이미 보통 점인 사건은 기준보다 조금 뒤로 밀려도 유지합니다. 작은 점은 그만큼 더 앞쪽으로 들어와야 보통 점으로 돌아옵니다. 순위가 조금 바뀔 때 깜빡이는 현상을 줄입니다."
  },
  smallPointCount: {
    label: "작은 점이 흐려지기 시작하는 순위 기준",
    description:
      "이 기준 뒤쪽의 작은 점은 점점 흐려집니다. ‘보통 점으로 남길 순위 기준’ 이상이어야 합니다. 이 순서는 역사적 중요도를 뜻하지 않습니다."
  },
  hiddenPointCount: {
    label: "점이 완전히 숨겨지는 순위 기준",
    description:
      "앞의 흐려짐 구간 끝에서 점이 사라집니다. ‘작은 점이 흐려지기 시작하는 순위 기준’보다 커야 합니다."
  },
  smallPointScale: {
    label: "작은 점의 크기 비율",
    description:
      "보통 점에 대한 크기입니다. 0.35이면 보통 점 반지름의 35%로 그립니다."
  },
  hiddenPointScale: {
    label: "사라지기 직전 점의 크기 비율",
    description:
      "작은 점이 흐려지면서 가까워질 크기입니다. 보통 점 크기를 1로 두고 비교합니다."
  },
  hullSuppressCoverageStart: {
    label: "큰 묶음 영역을 흐리기 시작하는 화면 비율",
    description:
      "묶음이 화면에서 차지하는 비율이 이 값을 넘으면 영역이 흐려집니다. 0.35이면 35%부터 흐려지고, 화면 전체를 덮으면 숨겨집니다. 1이면 이 억제를 끕니다."
  },
  fadeDurationMs: {
    label: "점·영역·연결선이 흐려지는 시간 · 밀리초",
    description:
      "표시가 바뀐 뒤 얼마나 천천히 나타나거나 사라질지 정합니다. 1000밀리초는 1초이며, 0이면 즉시 바뀝니다."
  },
  labelFadeDurationMs: {
    label: "사건 이름이 흐려지는 시간 · 밀리초",
    description:
      "이름이 나타나거나 사라지는 시간을 정합니다. 1000밀리초는 1초입니다."
  }
};

const SYNTHETIC_WORLD_ID = "00000000-0000-4000-8000-00000000a013";
const SYNTHETIC_TITLES: Record<string, string> = {
  "long-process": "긴 묶음 사건 · 1400~1950년",
  "outer-process": "바깥 묶음 · 화면 밖 구성 사건 포함",
  "inner-process": "안쪽 묶음 · 이틀 동안의 사건",
  "overlap-process": "겹치는 묶음 · 구성 사건을 함께 사용",
  "dense-process": "밀집 묶음 · 촘촘한 사건 160개와 공유 사건",
  "sparse-process": "성긴 묶음 · 1660~1950년",
  "long-before": "앞쪽 경계 사건 · 1400년",
  "long-after": "뒤쪽 경계 사건 · 1800년",
  shared: "공유 사건 · 두 사건 모음에 포함",
  "short-a": "짧은 묶음의 첫날 사건",
  "short-b": "짧은 묶음의 둘째 날 사건",
  sparse: "드문드문 놓인 사건 · 1660년",
  "far-child": "멀리 떨어진 구성 사건 · 1950년",
  unplaced: "시간을 모르는 사건 · 시간축에 놓지 않음",
  "lab-primary": "중심 사건 모음",
  "lab-overlap": "겹쳐 선택한 사건 모음",
  "lab-sparse": "긴 기간과 드문 사건 모음"
};

/** Translate only this Lab's synthetic display labels; history titles and saved bytes remain intact. */
export function labDisplayTitle(
  worldId: string,
  id: string,
  title: string
): string {
  if (worldId !== SYNTHETIC_WORLD_ID) return title;
  if (id === worldId) return "연습 자료 · 중첩·겹침·밀집·긴 기간";
  if (/^dense-\d{3}$/.test(id)) return `촘촘한 사건 ${Number(id.slice(6)) + 1}`;
  return SYNTHETIC_TITLES[id] ?? title;
}

export function labRelationLabel(type: string): string {
  const labels: Record<string, string> = {
    contains: "구성 사건 관계",
    causes: "원인과 결과",
    precedes: "시간상 앞섬",
    not_after: "더 늦지 않음",
    coincides: "같은 시점",
    starts: "시작을 이루는 사건",
    ends: "끝을 이루는 사건",
    related: "관련 사건"
  };
  return labels[type] ?? "사건 사이의 관계";
}

/** Parser error codes stay stable; the reader gets a Korean recovery action. */
export function labRestoreErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("16 MiB"))
    return "저장 파일이 너무 큽니다. 16메가바이트 이하의 파일을 골라 주세요.";
  if (message.includes("camera") || message.includes("viewport"))
    return "저장된 화면 위치나 확대 크기를 읽을 수 없습니다. 실험실에서 저장한 원본 파일을 다시 열어 주세요.";
  if (message.includes("history"))
    return "화면 전환 기록과 사건 자료가 맞지 않습니다. 실험실에서 저장한 원본 파일을 다시 열어 주세요.";
  if (message.includes("Collection"))
    return "저장된 사건 모음 선택과 자료가 맞지 않습니다. 원본 파일을 다시 열어 주세요.";
  if (message.includes("Density ranks"))
    return "점 표시의 순위 기준이 뒤바뀌어 있습니다. 보통 점 기준 ≤ 흐려짐 시작 기준 < 숨김 기준이어야 합니다.";
  if (message.includes("version") || message.includes("algorithm"))
    return "이 파일의 배치 방식이나 저장 형식은 현재 실험실에서 지원하지 않습니다. 현재 실험실에서 저장한 파일을 사용해 주세요.";
  if (/snapshot|Snapshot|digest|World\/revision/.test(message))
    return "저장된 사건 자료가 서로 맞지 않거나 손상되었습니다. 내용을 수정하지 않은 원본 파일을 다시 열어 주세요.";
  return "저장 내용을 읽을 수 없습니다. 실험실에서 내려받은 파일을 선택하거나, 저장 내용 전체를 빠짐없이 붙여넣어 주세요.";
}
