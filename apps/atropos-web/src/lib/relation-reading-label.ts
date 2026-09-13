import type { RelationType } from "@moirai/contracts";

const LABELS: Partial<Record<RelationType, readonly [string, string]>> = {
  contains: ["구성 사건", "이 사건을 포함하는 과정"],
  precedes: ["이후 사건", "이전 사건"],
  not_after: [
    "같은 시점이거나 뒤에 있는 사건",
    "같은 시점이거나 앞에 있는 사건"
  ],
  coincides: ["같은 시점의 사건", "같은 시점의 사건"],
  causes: ["이 사건이 원인이 된 사건", "원인이 된 사건"],
  enables: ["이 사건이 가능하게 한 사건", "가능하게 만든 사건"],
  prevents: ["이 사건이 막는 사건", "이 사건을 막는 사건"],
  influences: ["영향을 받는 사건", "영향을 주는 사건"],
  starts: ["이 사건으로 시작되는 과정", "이 과정의 시작"],
  ends: ["이 사건으로 끝나는 과정", "이 과정의 끝"]
};

export function relationReadingLabel(
  type: RelationType,
  outgoing: boolean
): string {
  return (
    LABELS[type]?.[outgoing ? 0 : 1] ??
    `${type}${outgoing ? "" : " · incoming"}`
  );
}
