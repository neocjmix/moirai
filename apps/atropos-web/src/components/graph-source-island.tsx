"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { MoiraiGraphSource, MoiraiGraphUrlState } from "@moirai/contracts";

import type { AppLocale } from "../urdr-port/src/locale";
import inheritedStyles from "../urdr-port/src/components/graph-shell.module.css";
import {
  MOCK_GRAPH_SOURCE_CATALOG,
  buildGraphUrlSearch,
  createDefaultGraphUrlState,
  getGraphSourceCompatibility,
  isSameGraphTimeSystemIdentity,
  parseGraphUrlState,
  replaceGraphSources,
  type GraphSourceWorldOption,
  type GraphTemporalFrameOption
} from "../lib/moirai-graph-source-query";
import styles from "./graph-source-island.module.css";

const COPY = {
  ko: {
    open: "소스 쿼리 열기",
    close: "소스 쿼리 접기",
    tabs: "그래프 쿼리 영역",
    sources: "Sources",
    summary: (worlds: number, canons: number) =>
      `World ${worlds} · Canon ${canons}`,
    mock: "MOCK SOURCE",
    frameTitle: "시간 체계",
    frameHint: "World를 함께 비교할 운영 시간 프레임을 먼저 선택합니다.",
    worldsTitle: "World",
    worldsHint:
      "현재 프레임과 네이티브 호환되는 World만 함께 선택할 수 있습니다.",
    canonsTitle: "Canon",
    canonsHint:
      "World마다 함께 읽을 Canon을 고릅니다. Canon 사이에 우위는 없습니다.",
    revision: (revision: number) => `served Revision ${revision}`,
    selected: "선택됨",
    notSelected: "선택 안 됨",
    incompatible: "호환 불가",
    incompatibleReason:
      "adapter identity 또는 comparison domain이 현재 시간 프레임과 다릅니다.",
    previewTitle: "시간 체계 변경 영향",
    previewBody: (count: number) =>
      `현재 source ${count}개가 호환되지 않아 제거됩니다. 적용하기 전까지 그래프 쿼리는 바뀌지 않습니다.`,
    removed: "제거 예정",
    added: "새 프레임에서 선택",
    apply: "변경 적용",
    cancel: "취소",
    revisionVector: "Revision vector",
    legacyViewport:
      "현재 viewport는 M4.5-H 전까지 기존 데모 데이터를 유지합니다. 이 소스 쿼리는 Moirai 계약과 URL 상태를 먼저 확정합니다."
  },
  en: {
    open: "Open source query",
    close: "Collapse source query",
    tabs: "Graph query areas",
    sources: "Sources",
    summary: (worlds: number, canons: number) =>
      `${worlds} Worlds · ${canons} Canons`,
    mock: "MOCK SOURCE",
    frameTitle: "Time System",
    frameHint:
      "Choose the operational time frame used to compare Worlds first.",
    worldsTitle: "Worlds",
    worldsHint:
      "Only Worlds natively compatible with the current frame can be selected together.",
    canonsTitle: "Canons",
    canonsHint:
      "Choose Canons per World. No Canon is treated as superior to another.",
    revision: (revision: number) => `served Revision ${revision}`,
    selected: "Selected",
    notSelected: "Not selected",
    incompatible: "Incompatible",
    incompatibleReason:
      "Its adapter identity or comparison domain differs from the current temporal frame.",
    previewTitle: "Time System change impact",
    previewBody: (count: number) =>
      `${count} current sources are incompatible and will be removed. The graph query remains unchanged until you apply.`,
    removed: "Will be removed",
    added: "Selected in new frame",
    apply: "Apply change",
    cancel: "Cancel",
    revisionVector: "Revision vector",
    legacyViewport:
      "The viewport keeps its existing demo data until M4.5-H. This slice first establishes the Moirai query and URL state."
  }
} as const;

function findFrame(state: MoiraiGraphUrlState): GraphTemporalFrameOption {
  return (
    MOCK_GRAPH_SOURCE_CATALOG.frames.find((frame) =>
      isSameGraphTimeSystemIdentity(
        frame.target,
        state.query.temporal_frame.target
      )
    ) ?? MOCK_GRAPH_SOURCE_CATALOG.frames[0]!
  );
}

function sourceForWorld(state: MoiraiGraphUrlState, worldId: string) {
  return state.query.sources.find((source) => source.world_id === worldId);
}

function sourceFromWorld(world: GraphSourceWorldOption): MoiraiGraphSource {
  return {
    world_id: world.id,
    served_revision: world.servedRevision,
    canon_ids: world.canons.map((canon) => canon.id),
    time_systems: [world.timeSystem]
  };
}

export function GraphSourceIsland({ locale }: Readonly<{ locale: AppLocale }>) {
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MoiraiGraphUrlState>(() =>
    createDefaultGraphUrlState()
  );
  const [hydrated, setHydrated] = useState(false);
  const [draftFrameId, setDraftFrameId] = useState<string | null>(null);
  const activeFrame = useMemo(() => findFrame(state), [state]);
  const draftFrame = draftFrameId
    ? (MOCK_GRAPH_SOURCE_CATALOG.frames.find(
        (frame) => frame.id === draftFrameId
      ) ?? null)
    : null;
  const canonCount = state.query.sources.reduce(
    (total, source) => total + source.canon_ids.length,
    0
  );

  const restoreFromLocation = useCallback(() => {
    const restored = parseGraphUrlState(window.location.search);
    setState(restored ?? createDefaultGraphUrlState());
    setDraftFrameId(null);
  }, []);

  useEffect(() => {
    restoreFromLocation();
    setHydrated(true);
  }, [restoreFromLocation]);

  useEffect(() => {
    window.addEventListener("popstate", restoreFromLocation);
    return () => window.removeEventListener("popstate", restoreFromLocation);
  }, [restoreFromLocation]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const nextSearch = buildGraphUrlSearch(window.location.search, state);
    if (nextSearch !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${nextSearch}${window.location.hash}`
      );
    }
  }, [hydrated, state]);

  const toggleWorld = useCallback((world: GraphSourceWorldOption) => {
    setState((current) => {
      const existing = sourceForWorld(current, world.id);
      if (existing) {
        if (current.query.sources.length === 1) {
          return current;
        }
        return replaceGraphSources(
          current,
          current.query.temporal_frame.target,
          current.query.sources.filter((source) => source.world_id !== world.id)
        );
      }
      return replaceGraphSources(current, current.query.temporal_frame.target, [
        ...current.query.sources,
        sourceFromWorld(world)
      ]);
    });
  }, []);

  const toggleCanon = useCallback(
    (world: GraphSourceWorldOption, canonId: string) => {
      setState((current) => {
        const selectedSource = sourceForWorld(current, world.id);
        if (!selectedSource) {
          return current;
        }
        const selected = selectedSource.canon_ids.includes(canonId);
        if (selected && selectedSource.canon_ids.length === 1) {
          return current;
        }
        const nextSource: MoiraiGraphSource = {
          ...selectedSource,
          canon_ids: selected
            ? selectedSource.canon_ids.filter((id) => id !== canonId)
            : [...selectedSource.canon_ids, canonId]
        };
        return replaceGraphSources(
          current,
          current.query.temporal_frame.target,
          current.query.sources.map((source) =>
            source.world_id === world.id ? nextSource : source
          )
        );
      });
    },
    []
  );

  const applyDraftFrame = useCallback(() => {
    if (!draftFrame) {
      return;
    }
    const compatibleSources = MOCK_GRAPH_SOURCE_CATALOG.worlds
      .filter(
        (world) =>
          getGraphSourceCompatibility(world.timeSystem, draftFrame.target)
            .compatible
      )
      .map(sourceFromWorld);
    setState((current) =>
      replaceGraphSources(current, draftFrame.target, compatibleSources)
    );
    setDraftFrameId(null);
  }, [draftFrame]);

  const removedSources = draftFrame
    ? state.query.sources.filter((source) => {
        const world = MOCK_GRAPH_SOURCE_CATALOG.worlds.find(
          (candidate) => candidate.id === source.world_id
        );
        return world
          ? !getGraphSourceCompatibility(world.timeSystem, draftFrame.target)
              .compatible
          : true;
      })
    : [];
  const addedWorlds = draftFrame
    ? MOCK_GRAPH_SOURCE_CATALOG.worlds.filter(
        (world) =>
          getGraphSourceCompatibility(world.timeSystem, draftFrame.target)
            .compatible &&
          !state.query.sources.some((source) => source.world_id === world.id)
      )
    : [];

  return (
    <div className={inheritedStyles.shellChrome}>
      <div
        className={inheritedStyles.statusIslandStack}
        data-open={open ? "true" : "false"}
        data-testid="moirai-source-island"
      >
        {open ? (
          <div
            className={inheritedStyles.statusIslandHeaderExpanded}
            role="tablist"
            aria-label={copy.tabs}
          >
            <div className={inheritedStyles.statusIslandTabGroup}>
              <button
                aria-selected="true"
                className={`${inheritedStyles.statusIslandModeButton} ${inheritedStyles.statusIslandModeButtonActive}`}
                role="tab"
                type="button"
              >
                <span className={inheritedStyles.statusIslandModeText}>
                  {copy.sources}
                </span>
              </button>
              <span className={styles.headerSummary}>
                {copy.summary(state.query.sources.length, canonCount)}
              </span>
            </div>
            <button
              aria-label={copy.close}
              className={inheritedStyles.statusIslandCloseButton}
              onClick={() => setOpen(false)}
              type="button"
            >
              <Cross2Icon />
            </button>
          </div>
        ) : (
          <div className={inheritedStyles.statusIslandHeaderCollapsed}>
            <button
              aria-label={copy.open}
              className={inheritedStyles.statusIslandCollapsedButton}
              onClick={() => setOpen(true)}
              type="button"
            >
              <span className={inheritedStyles.statusIslandModeText}>
                {activeFrame.label[locale]}
              </span>
            </button>
            <span
              aria-hidden="true"
              className={inheritedStyles.statusIslandDivider}
            />
            <button
              aria-label={copy.open}
              className={inheritedStyles.statusIslandCollapsedButton}
              onClick={() => setOpen(true)}
              type="button"
            >
              <span className={inheritedStyles.statusIslandCanon}>
                {copy.summary(state.query.sources.length, canonCount)}
              </span>
            </button>
          </div>
        )}

        <div
          aria-hidden={!open}
          className={inheritedStyles.statusIslandViewport}
          data-open={open ? "true" : "false"}
        >
          {open ? (
            <div className={inheritedStyles.statusIslandPanel} data-open="true">
              <div
                className={`${inheritedStyles.timelineDialogSurface} ${styles.surface}`}
              >
                <div className={styles.mockNotice}>
                  <span>{copy.mock}</span>
                  <p>{copy.legacyViewport}</p>
                </div>

                <section
                  className={styles.section}
                  aria-labelledby="source-time-system-title"
                >
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 id="source-time-system-title">{copy.frameTitle}</h2>
                      <p>{copy.frameHint}</p>
                    </div>
                    <span className={styles.step}>01</span>
                  </div>
                  <div className={styles.optionList}>
                    {MOCK_GRAPH_SOURCE_CATALOG.frames.map((frame) => {
                      const selected =
                        (draftFrame ?? activeFrame).id === frame.id;
                      return (
                        <button
                          aria-pressed={selected}
                          className={`${inheritedStyles.timelineOptionButton} ${selected ? inheritedStyles.timelineOptionButtonActive : ""} ${styles.frameOption}`}
                          key={frame.id}
                          onClick={() =>
                            frame.id === activeFrame.id
                              ? setDraftFrameId(null)
                              : setDraftFrameId(frame.id)
                          }
                          type="button"
                        >
                          <span className={styles.optionMain}>
                            {frame.label[locale]}
                          </span>
                          <span className={styles.optionDescription}>
                            {frame.description[locale]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {draftFrame ? (
                  <section className={styles.impactPanel} aria-live="polite">
                    <div className={styles.impactTitle}>
                      {copy.previewTitle}
                    </div>
                    <p>{copy.previewBody(removedSources.length)}</p>
                    <div className={styles.impactColumns}>
                      <div>
                        <span className={styles.impactLabel}>
                          {copy.removed}
                        </span>
                        {removedSources.map((source) => (
                          <span
                            className={styles.impactItem}
                            key={source.world_id}
                          >
                            {MOCK_GRAPH_SOURCE_CATALOG.worlds.find(
                              (world) => world.id === source.world_id
                            )?.label[locale] ?? source.world_id}
                          </span>
                        ))}
                      </div>
                      <div>
                        <span className={styles.impactLabel}>{copy.added}</span>
                        {addedWorlds.map((world) => (
                          <span className={styles.impactItem} key={world.id}>
                            {world.label[locale]}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className={styles.impactActions}>
                      <button
                        className={styles.secondaryAction}
                        onClick={() => setDraftFrameId(null)}
                        type="button"
                      >
                        {copy.cancel}
                      </button>
                      <button
                        className={styles.primaryAction}
                        onClick={applyDraftFrame}
                        type="button"
                      >
                        {copy.apply}
                      </button>
                    </div>
                  </section>
                ) : (
                  <>
                    <section
                      className={styles.section}
                      aria-labelledby="source-worlds-title"
                    >
                      <div className={styles.sectionHeader}>
                        <div>
                          <h2 id="source-worlds-title">{copy.worldsTitle}</h2>
                          <p>{copy.worldsHint}</p>
                        </div>
                        <span className={styles.step}>02</span>
                      </div>
                      <div className={styles.optionList}>
                        {MOCK_GRAPH_SOURCE_CATALOG.worlds.map((world) => {
                          const compatibility = getGraphSourceCompatibility(
                            world.timeSystem,
                            activeFrame.target
                          );
                          const source = sourceForWorld(state, world.id);
                          return (
                            <label
                              className={`${inheritedStyles.canonOptionCard} ${source ? inheritedStyles.canonOptionCardActive : inheritedStyles.canonOptionCardInactive} ${!compatibility.compatible ? styles.disabledCard : ""}`}
                              data-testid={`world-option-${world.id}`}
                              key={world.id}
                            >
                              <input
                                checked={Boolean(source)}
                                className={inheritedStyles.canonOptionInput}
                                disabled={!compatibility.compatible}
                                onChange={() => toggleWorld(world)}
                                type="checkbox"
                              />
                              <span
                                aria-hidden="true"
                                className={inheritedStyles.canonOptionCheck}
                              >
                                {source ? "✓" : ""}
                              </span>
                              <span
                                className={inheritedStyles.canonOptionContent}
                              >
                                <span
                                  className={
                                    inheritedStyles.canonOptionTitleRow
                                  }
                                >
                                  <span
                                    className={
                                      inheritedStyles.timelineOptionLabel
                                    }
                                  >
                                    {world.label[locale]}
                                  </span>
                                  <span className={styles.revisionBadge}>
                                    {copy.revision(world.servedRevision)}
                                  </span>
                                </span>
                                <span
                                  className={inheritedStyles.canonOptionMeta}
                                >
                                  {world.description[locale]}
                                </span>
                                {!compatibility.compatible ? (
                                  <span className={styles.incompatibleReason}>
                                    {copy.incompatibleReason}
                                  </span>
                                ) : null}
                              </span>
                              <span
                                className={inheritedStyles.canonOptionState}
                              >
                                {!compatibility.compatible
                                  ? copy.incompatible
                                  : source
                                    ? copy.selected
                                    : copy.notSelected}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>

                    <section
                      className={styles.section}
                      aria-labelledby="source-canons-title"
                    >
                      <div className={styles.sectionHeader}>
                        <div>
                          <h2 id="source-canons-title">{copy.canonsTitle}</h2>
                          <p>{copy.canonsHint}</p>
                        </div>
                        <span className={styles.step}>03</span>
                      </div>
                      <div className={styles.canonGroups}>
                        {state.query.sources.map((source) => {
                          const world = MOCK_GRAPH_SOURCE_CATALOG.worlds.find(
                            (candidate) => candidate.id === source.world_id
                          )!;
                          return (
                            <fieldset
                              className={styles.canonGroup}
                              key={world.id}
                            >
                              <legend>
                                <span>{world.label[locale]}</span>
                                <span>
                                  {copy.revision(world.servedRevision)}
                                </span>
                              </legend>
                              {world.canons.map((canon) => {
                                const selected = source.canon_ids.includes(
                                  canon.id
                                );
                                return (
                                  <label
                                    className={styles.canonRow}
                                    key={canon.id}
                                  >
                                    <input
                                      checked={selected}
                                      onChange={() =>
                                        toggleCanon(world, canon.id)
                                      }
                                      type="checkbox"
                                    />
                                    <span
                                      aria-hidden="true"
                                      className={styles.compactCheck}
                                    >
                                      {selected ? "✓" : ""}
                                    </span>
                                    <span>{canon.label[locale]}</span>
                                  </label>
                                );
                              })}
                            </fieldset>
                          );
                        })}
                      </div>
                    </section>

                    <section
                      className={styles.revisionVector}
                      aria-label={copy.revisionVector}
                    >
                      <span>{copy.revisionVector}</span>
                      <div>
                        {state.query.sources.map((source) => (
                          <code key={source.world_id}>
                            {source.world_id} @ {source.served_revision}
                          </code>
                        ))}
                      </div>
                    </section>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
