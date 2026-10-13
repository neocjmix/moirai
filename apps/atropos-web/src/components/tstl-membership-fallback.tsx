"use client";

import { useMemo, useState } from "react";
import type {
  TstlExperimentArtifact,
  TstlExperimentCandidate
} from "../lib/tstl-experiment-types";
import type { AppLocale } from "../urdr-port/src/locale";
import styles from "./tstl-membership-fallback.module.css";

type Membership = NonNullable<TstlExperimentCandidate["memberships"]>[number];
type Props = {
  artifact: TstlExperimentArtifact;
  mode: "B" | "C";
  locale: AppLocale;
};
const PAGE_SIZE = 30;
const reasons: Record<string, { ko: string; en: string }> = {
  LOCAL_CELL_ONLY: {
    ko: "사건 주변 면만 표시하고 다른 사건까지 연결하지 못함",
    en: "Only the local event area is drawn; no link to another event"
  },
  UNKNOWN_BUDGET: {
    ko: "경로 탐색 한도에 도달함",
    en: "Routing limit reached"
  },
  ROUTING_BUDGET_EXHAUSTED: {
    ko: "경로 탐색 한도에 도달함",
    en: "Routing limit reached"
  },
  "mesh-disconnected-or-nonmember-clearance": {
    ko: "다른 사건을 피하는 경로를 찾지 못함",
    en: "No route found with clearance from other events"
  },
  "no-terminal-route": {
    ko: "사건까지 연결할 경로를 찾지 못함",
    en: "No route found to the event"
  },
  DENSE_MEMBERSHIP_PORTS: {
    ko: "소속이 많아 연결할 공간이 부족함",
    en: "Too many memberships for the available port space"
  },
  SPINE_OCCLUDED: {
    ko: "다른 사건이 중심선을 가림",
    en: "Other events obstruct the spine"
  },
  NO_TWO_BEND_PATH: {
    ko: "두 번 이내로 꺾이는 우회 경로를 찾지 못함",
    en: "No detour found within two bends"
  }
};

export function TstlMembershipFallback({ artifact, mode, locale }: Props) {
  const [expanded, setExpanded] = useState(false);
  const memberships =
    mode === "B" ? artifact.b.memberships : artifact.c.memberships;
  const omitted = useMemo(
    () => memberships?.filter((entry) => entry.status === "list") ?? [],
    [memberships]
  );
  const ko = locale === "ko";
  return (
    <details
      className={styles.fallback}
      data-testid="tstl-membership-fallback"
      data-mode={mode}
      data-count={omitted.length}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary data-testid="tstl-membership-summary">
        {ko
          ? "선·면 연결을 생략한 소속"
          : "Memberships without a drawn connection"}
        {` · ${omitted.length}`}
      </summary>
      {expanded ? (
        <TstlMembershipList
          artifact={artifact}
          mode={mode}
          locale={locale}
          memberships={omitted}
        />
      ) : null}
    </details>
  );
}

function TstlMembershipList({
  artifact,
  mode,
  locale,
  memberships
}: Props & { memberships: Membership[] }) {
  const ko = locale === "ko";
  const names = useMemo(
    () => new Map(artifact.b0Primitives.map((p) => [p.entity.id, p.label])),
    [artifact.b0Primitives]
  );
  const groups = useMemo(() => {
    const byOwner = new Map<string, Membership[]>();
    for (const entry of memberships) {
      const group = byOwner.get(entry.compositeId) ?? [];
      group.push(entry);
      byOwner.set(entry.compositeId, group);
    }
    return byOwner;
  }, [memberships]);
  const [owner, setOwner] = useState(() => groups.keys().next().value ?? "");
  const [page, setPage] = useState(0);
  const entries = groups.get(owner) ?? [];
  const first = page * PAGE_SIZE;
  const visible = entries.slice(first, first + PAGE_SIZE);
  const currentParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search
  );
  const viewport = currentParams.get("gsViewport");
  return (
    <div className={styles.content}>
      <p>
        {ko
          ? "이 목록은 원본 사건의 실제 소속입니다. 선이나 면을 그리지 못해도 소속은 사라지지 않습니다. 사건을 누르면 같은 사건을 그래프에서 엽니다. 선의 교차는 새로운 관계를 뜻하지 않습니다."
          : "These are exact memberships of the original events. Missing lines or areas do not remove a membership. Open an event to reveal the same event in the graph. Crossing lines do not imply new relationships."}
      </p>
      {groups.size > 0 ? (
        <>
          <label className={styles.owner}>
            <span>{ko ? "묶음 선택" : "Choose a group"}</span>
            <select
              data-testid="tstl-membership-owner"
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value);
                setPage(0);
              }}
            >
              {[...groups].map(([id, items]) => (
                <option key={id} value={id}>
                  {names.get(id) ?? id} · {items.length}
                </option>
              ))}
            </select>
          </label>
          <ul className={styles.events}>
            {visible.map((entry) => {
              const params = new URLSearchParams({
                world: artifact.source.worldId,
                layoutLab: mode,
                gsEvent: entry.eventId
              });
              if (viewport) params.set("gsViewport", viewport);
              const reason = entry.reason ? reasons[entry.reason] : undefined;
              return (
                <li
                  key={entry.eventId}
                  data-testid="tstl-membership-row"
                  data-event-id={entry.eventId}
                  data-composite-id={entry.compositeId}
                >
                  <a
                    data-testid="tstl-membership-event"
                    href={`/graph/v5?${params}`}
                  >
                    {names.get(entry.eventId) ?? entry.eventId}
                  </a>
                  <span>
                    {reason
                      ? reason[ko ? "ko" : "en"]
                      : ko
                        ? "연결 경로를 확인하지 못함"
                        : "A connection route was not established"}
                  </span>
                </li>
              );
            })}
          </ul>
          {entries.length > PAGE_SIZE ? (
            <nav
              className={styles.pages}
              aria-label={ko ? "소속 목록 페이지" : "Membership list pages"}
            >
              <button
                type="button"
                data-testid="tstl-membership-previous"
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                {ko ? "이전" : "Previous"}
              </button>
              <span aria-live="polite">
                {`${first + 1}–${Math.min(first + PAGE_SIZE, entries.length)} / ${entries.length}`}
              </span>
              <button
                type="button"
                data-testid="tstl-membership-next"
                disabled={first + PAGE_SIZE >= entries.length}
                onClick={() => setPage((value) => value + 1)}
              >
                {ko ? "다음" : "Next"}
              </button>
            </nav>
          ) : null}
        </>
      ) : (
        <p>
          {ko
            ? "목록으로 대신한 소속이 없습니다."
            : "No memberships use a list fallback."}
        </p>
      )}
    </div>
  );
}
