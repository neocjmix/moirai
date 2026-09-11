"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import { useCallback, useMemo, useState } from "react";

import type { MoiraiGraphSource, MoiraiGraphUrlState } from "@moirai/contracts";

import type { AppLocale } from "../urdr-port/src/locale";
import inheritedStyles from "../urdr-port/src/components/graph-shell.module.css";
import {
  focusGraphEntity,
  getGraphSourceCompatibility,
  isSameGraphTimeSystemIdentity,
  replaceGraphEntityFilter,
  replaceGraphSources,
  searchGraphEntities,
  type GraphSourceCatalog,
  type GraphSourceWorldOption,
  type GraphTemporalFrameOption
} from "../lib/moirai-graph-source-query";
import { useGraphQuery } from "./graph-query-context";
import { GraphRelationPanel } from "./graph-relation-panel";
import styles from "./graph-source-island.module.css";

const COPY = {
  ko: {
    open: "소스 쿼리 열기",
    close: "소스 쿼리 접기",
    tabs: "그래프 쿼리 영역",
    sources: "Sources",
    entities: "Entities",
    search: "Search",
    relations: "Relations",
    diagnostics: "Diagnostics",
    summary: (worlds: number, canons: number) =>
      `World ${worlds} · Canon ${canons}`,
    mock: "PUBLICATION SOURCE",
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
    nativeViewport:
      "이 결과는 선택한 World의 immutable Publication과 같은 served Revision에서 합성되며 native v3 viewport가 직접 렌더링합니다.",
    entityTitle: "Identity-aware 결과",
    entityHint:
      "공유 identity는 한 번만 표시하며 matched Canon과 전체 membership을 구분합니다.",
    searchPlaceholder: "현재 source 안에서 검색",
    persisted: "persisted",
    derived: "derived",
    matched: "matched Canon",
    memberships: "all memberships",
    focus: "선택하고 URL에 고정",
    atomic: "Atomic Event",
    composite: "Composite / Process",
    states: "State 포함",
    narratives: "Narrative 포함",
    empty: "현재 source와 filter에 맞는 결과가 없습니다."
  },
  en: {
    open: "Open source query",
    close: "Collapse source query",
    tabs: "Graph query areas",
    sources: "Sources",
    entities: "Entities",
    search: "Search",
    relations: "Relations",
    diagnostics: "Diagnostics",
    summary: (worlds: number, canons: number) =>
      `${worlds} Worlds · ${canons} Canons`,
    mock: "PUBLICATION SOURCE",
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
    nativeViewport:
      "This result is composed from immutable Publication artifacts at each selected World's served Revision and rendered directly by the native v3 viewport.",
    entityTitle: "Identity-aware results",
    entityHint:
      "Shared identities appear once, with matched Canons separate from all memberships.",
    searchPlaceholder: "Search within current sources",
    persisted: "persisted",
    derived: "derived",
    matched: "matched Canons",
    memberships: "all memberships",
    focus: "Select and pin in URL",
    atomic: "Atomic Event",
    composite: "Composite / Process",
    states: "Include States",
    narratives: "Include Narratives",
    empty: "No result matches the current sources and filters."
  }
} as const;

function findFrame(
  state: MoiraiGraphUrlState,
  catalog: GraphSourceCatalog
): GraphTemporalFrameOption {
  return (
    catalog.frames.find((frame) =>
      isSameGraphTimeSystemIdentity(
        frame.target,
        state.query.temporal_frame.target
      )
    ) ?? catalog.frames[0]!
  );
}

function sourceForWorld(state: MoiraiGraphUrlState, worldId: string) {
  return state.query.sources.find((source) => source.world_id === worldId);
}

function sourceFromWorld(
  world: GraphSourceWorldOption,
  target: GraphTemporalFrameOption["target"]
): MoiraiGraphSource {
  return {
    world_id: world.id,
    served_revision: world.servedRevision,
    canon_ids: world.canons.map((canon) => canon.id),
    time_systems: world.timeSystems.filter(
      (system) => getGraphSourceCompatibility(system, target).compatible
    )
  };
}

export function GraphSourceIsland({ locale }: Readonly<{ locale: AppLocale }>) {
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "sources" | "entities" | "search" | "relations" | "diagnostics"
  >("sources");
  const [searchTerm, setSearchTerm] = useState("");
  const { state, setState, setSourceState, catalog, entities } =
    useGraphQuery();
  const [draftFrameId, setDraftFrameId] = useState<string | null>(null);
  const activeFrame = useMemo(
    () => findFrame(state, catalog),
    [catalog, state]
  );
  const draftFrame = draftFrameId
    ? (catalog.frames.find((frame) => frame.id === draftFrameId) ?? null)
    : null;
  const canonCount = state.query.sources.reduce(
    (total, source) => total + source.canon_ids.length,
    0
  );
  const entityResults = useMemo(
    () =>
      searchGraphEntities(
        state,
        activeTab === "search" ? searchTerm : "",
        entities
      ),
    [activeTab, entities, searchTerm, state]
  );

  const toggleWorld = useCallback(
    (world: GraphSourceWorldOption) => {
      setSourceState((current) => {
        const existing = sourceForWorld(current, world.id);
        if (existing) {
          if (current.query.sources.length === 1) {
            return current;
          }
          return replaceGraphSources(
            current,
            current.query.temporal_frame.target,
            current.query.sources.filter(
              (source) => source.world_id !== world.id
            )
          );
        }
        return replaceGraphSources(
          current,
          current.query.temporal_frame.target,
          [
            ...current.query.sources,
            sourceFromWorld(world, current.query.temporal_frame.target)
          ]
        );
      });
    },
    [setSourceState]
  );

  const toggleCanon = useCallback(
    (world: GraphSourceWorldOption, canonId: string) => {
      setSourceState((current) => {
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
    [setSourceState]
  );

  const applyDraftFrame = useCallback(() => {
    if (!draftFrame) {
      return;
    }
    const compatibleSources = catalog.worlds
      .filter((world) =>
        world.timeSystems.some(
          (system) =>
            getGraphSourceCompatibility(system, draftFrame.target).compatible
        )
      )
      .map((world) => sourceFromWorld(world, draftFrame.target));
    setSourceState((current) =>
      replaceGraphSources(current, draftFrame.target, compatibleSources)
    );
    setDraftFrameId(null);
  }, [catalog, draftFrame, setSourceState]);

  const removedSources = draftFrame
    ? state.query.sources.filter((source) => {
        const world = catalog.worlds.find(
          (candidate) => candidate.id === source.world_id
        );
        return world
          ? !world.timeSystems.some(
              (system) =>
                getGraphSourceCompatibility(system, draftFrame.target)
                  .compatible
            )
          : true;
      })
    : [];
  const addedWorlds = draftFrame
    ? catalog.worlds.filter(
        (world) =>
          world.timeSystems.some(
            (system) =>
              getGraphSourceCompatibility(system, draftFrame.target).compatible
          ) &&
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
            <div
              className={`${inheritedStyles.statusIslandTabGroup} ${styles.queryTabs}`}
            >
              <button
                aria-selected={activeTab === "sources"}
                className={`${inheritedStyles.statusIslandModeButton} ${activeTab === "sources" ? inheritedStyles.statusIslandModeButtonActive : ""}`}
                onClick={() => setActiveTab("sources")}
                role="tab"
                type="button"
              >
                <span className={inheritedStyles.statusIslandModeText}>
                  {copy.sources}
                </span>
              </button>
              <button
                aria-selected={activeTab === "entities"}
                className={`${inheritedStyles.statusIslandModeButton} ${activeTab === "entities" ? inheritedStyles.statusIslandModeButtonActive : ""}`}
                onClick={() => setActiveTab("entities")}
                role="tab"
                type="button"
              >
                <span className={inheritedStyles.statusIslandModeText}>
                  {copy.entities}
                </span>
              </button>
              <button
                aria-selected={activeTab === "search"}
                className={`${inheritedStyles.statusIslandModeButton} ${activeTab === "search" ? inheritedStyles.statusIslandModeButtonActive : ""}`}
                onClick={() => setActiveTab("search")}
                role="tab"
                type="button"
              >
                <span className={inheritedStyles.statusIslandModeText}>
                  {copy.search}
                </span>
              </button>
              <button
                aria-selected={activeTab === "relations"}
                className={`${inheritedStyles.statusIslandModeButton} ${activeTab === "relations" ? inheritedStyles.statusIslandModeButtonActive : ""}`}
                onClick={() => setActiveTab("relations")}
                role="tab"
                type="button"
              >
                <span className={inheritedStyles.statusIslandModeText}>
                  {copy.relations}
                </span>
              </button>
              <button
                aria-selected={activeTab === "diagnostics"}
                className={`${inheritedStyles.statusIslandModeButton} ${activeTab === "diagnostics" ? inheritedStyles.statusIslandModeButtonActive : ""}`}
                onClick={() => setActiveTab("diagnostics")}
                role="tab"
                type="button"
              >
                <span className={inheritedStyles.statusIslandModeText}>
                  {copy.diagnostics}
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
                {activeTab !== "sources" ? (
                  activeTab === "relations" || activeTab === "diagnostics" ? (
                    <GraphRelationPanel locale={locale} mode={activeTab} />
                  ) : (
                    <section
                      className={styles.entityPanel}
                      aria-labelledby="graph-entities-title"
                    >
                      <div className={styles.sectionHeader}>
                        <div>
                          <h2 id="graph-entities-title">{copy.entityTitle}</h2>
                          <p>{copy.entityHint}</p>
                        </div>
                      </div>
                      {activeTab === "search" ? (
                        <input
                          aria-label={copy.searchPlaceholder}
                          autoFocus
                          className={styles.searchInput}
                          onChange={(event) =>
                            setSearchTerm(event.target.value)
                          }
                          placeholder={copy.searchPlaceholder}
                          type="search"
                          value={searchTerm}
                        />
                      ) : null}
                      <div
                        className={styles.filterRow}
                        aria-label={copy.entities}
                      >
                        {(["atomic", "composite"] as const).map((kind) => {
                          const selected =
                            state.query.entity_filter.event_kinds.includes(
                              kind
                            );
                          return (
                            <button
                              aria-pressed={selected}
                              key={kind}
                              onClick={() =>
                                setState((current) =>
                                  replaceGraphEntityFilter(current, {
                                    ...current.query.entity_filter,
                                    event_kinds: selected
                                      ? current.query.entity_filter.event_kinds.filter(
                                          (value) => value !== kind
                                        )
                                      : [
                                          ...current.query.entity_filter
                                            .event_kinds,
                                          kind
                                        ]
                                  })
                                )
                              }
                              type="button"
                            >
                              {kind === "atomic" ? copy.atomic : copy.composite}
                            </button>
                          );
                        })}
                        <button
                          aria-pressed={
                            state.query.entity_filter.include_states
                          }
                          onClick={() =>
                            setState((current) =>
                              replaceGraphEntityFilter(current, {
                                ...current.query.entity_filter,
                                include_states:
                                  !current.query.entity_filter.include_states
                              })
                            )
                          }
                          type="button"
                        >
                          {copy.states}
                        </button>
                        <button
                          aria-pressed={
                            state.query.entity_filter.include_narratives
                          }
                          onClick={() =>
                            setState((current) =>
                              replaceGraphEntityFilter(current, {
                                ...current.query.entity_filter,
                                include_narratives:
                                  !current.query.entity_filter
                                    .include_narratives
                              })
                            )
                          }
                          type="button"
                        >
                          {copy.narratives}
                        </button>
                      </div>
                      <div
                        className={styles.entityResults}
                        data-testid="identity-search-results"
                      >
                        {entityResults.map((entity) => (
                          <article
                            className={styles.entityCard}
                            data-entity-id={entity.identity}
                            key={`${entity.kind}:${entity.worldId}:${entity.identity}`}
                          >
                            <div className={styles.entityHeading}>
                              <div>
                                <span className={styles.entityKind}>
                                  {entity.kind} ·{" "}
                                  {entity.persisted
                                    ? copy.persisted
                                    : copy.derived}
                                </span>
                                <h3>{entity.title[locale]}</h3>
                              </div>
                              <button
                                aria-label={`${copy.focus}: ${entity.title[locale]}`}
                                onClick={() =>
                                  setState((current) =>
                                    focusGraphEntity(current, entity.reference)
                                  )
                                }
                                type="button"
                              >
                                {copy.focus}
                              </button>
                            </div>
                            <p>{entity.description[locale]}</p>
                            <dl>
                              <div>
                                <dt>{copy.matched}</dt>
                                <dd>{entity.matchedCanonIds.join(", ")}</dd>
                              </div>
                              <div>
                                <dt>{copy.memberships}</dt>
                                <dd>{entity.canonMemberships.join(", ")}</dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                        {entityResults.length === 0 ? (
                          <p className={styles.emptyResult} role="status">
                            {copy.empty}
                          </p>
                        ) : null}
                      </div>
                    </section>
                  )
                ) : null}
                <div hidden={activeTab !== "sources"}>
                  <div className={styles.mockNotice}>
                    <span>{copy.mock}</span>
                    <p>{copy.nativeViewport}</p>
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
                      {catalog.frames.map((frame) => {
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
                              {catalog.worlds.find(
                                (world) => world.id === source.world_id
                              )?.label[locale] ?? source.world_id}
                            </span>
                          ))}
                        </div>
                        <div>
                          <span className={styles.impactLabel}>
                            {copy.added}
                          </span>
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
                          {catalog.worlds.map((world) => {
                            const compatibility = world.timeSystems.some(
                              (system) =>
                                getGraphSourceCompatibility(
                                  system,
                                  activeFrame.target
                                ).compatible
                            );
                            const source = sourceForWorld(state, world.id);
                            return (
                              <label
                                className={`${inheritedStyles.canonOptionCard} ${source ? inheritedStyles.canonOptionCardActive : inheritedStyles.canonOptionCardInactive} ${!compatibility ? styles.disabledCard : ""}`}
                                data-testid={`world-option-${world.id}`}
                                key={world.id}
                              >
                                <input
                                  checked={Boolean(source)}
                                  className={inheritedStyles.canonOptionInput}
                                  disabled={!compatibility}
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
                                  {!compatibility ? (
                                    <span className={styles.incompatibleReason}>
                                      {copy.incompatibleReason}
                                    </span>
                                  ) : null}
                                </span>
                                <span
                                  className={inheritedStyles.canonOptionState}
                                >
                                  {!compatibility
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
                            const world = catalog.worlds.find(
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
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
