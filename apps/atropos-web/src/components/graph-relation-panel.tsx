"use client";

import { useMemo } from "react";

import { MOIRAI_GRAPH_RELATION_TYPES } from "@moirai/contracts";

import {
  GRAPH_RELATION_FAMILIES,
  graphDiagnostics,
  replaceGraphRelationFilter,
  searchGraphRelations,
  type GraphRelationFamily
} from "../lib/moirai-graph-source-query";
import type { AppLocale } from "../urdr-port/src/locale";
import { useGraphQuery } from "./graph-query-context";
import styles from "./graph-source-island.module.css";

const COPY = {
  ko: {
    relations: "사건 사이의 연결",
    relationHint:
      "사건의 순서, 원인, 포함 관계를 읽습니다. 같은 연결을 여러 Canon이 함께 채택할 수 있습니다.",
    recordDetails: "관계의 기록과 근거",
    families: "Relation families",
    types: "개별 Relation type",
    matched: "matched Canon",
    memberships: "all memberships",
    endpoints: "endpoint membership evidence",
    time: "Canon–Time System evidence",
    diagnostics: "관측 정보",
    diagnosticHint:
      "지식 상태와 completeness를 표시하며 contradiction을 invalid로 만들지 않습니다.",
    valid: "valid knowledge state"
  },
  en: {
    relations: "Connections between events",
    relationHint:
      "Read order, causes and containment. Several Canons can share the same assertion.",
    recordDetails: "Relation record and evidence",
    families: "Relation families",
    types: "Individual Relation types",
    matched: "matched Canons",
    memberships: "all memberships",
    endpoints: "endpoint membership evidence",
    time: "Canon–Time System evidence",
    diagnostics: "Observation",
    diagnosticHint:
      "Knowledge state and completeness remain visible; contradiction is not invalidity.",
    valid: "valid knowledge state"
  }
} as const;

export function GraphRelationPanel({
  locale,
  mode
}: Readonly<{ locale: AppLocale; mode: "relations" | "diagnostics" }>) {
  const {
    state,
    setState,
    entities,
    catalog,
    relations: sourceRelations,
    diagnostics: sourceDiagnostics
  } = useGraphQuery();
  const copy = COPY[locale];
  const entityTitles = useMemo(
    () =>
      new Map(
        entities.map((entity) => [
          `${entity.worldId}:${entity.identity}`,
          entity.title[locale]
        ])
      ),
    [entities, locale]
  );
  const relations = useMemo(
    () => searchGraphRelations(state, sourceRelations),
    [sourceRelations, state]
  );
  const diagnostics = useMemo(
    () => graphDiagnostics(state, sourceDiagnostics),
    [sourceDiagnostics, state]
  );

  if (mode === "diagnostics") {
    return (
      <section
        className={styles.entityPanel}
        aria-labelledby="graph-diagnostics-title"
      >
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="graph-diagnostics-title">{copy.diagnostics}</h2>
            <p>{copy.diagnosticHint}</p>
          </div>
        </div>
        <div className={styles.entityResults} data-testid="graph-diagnostics">
          {diagnostics.map((diagnostic) => (
            <article
              className={styles.entityCard}
              data-diagnostic-code={diagnostic.code}
              key={diagnostic.code}
            >
              <div className={styles.entityHeading}>
                <div>
                  <span className={styles.entityKind}>
                    {diagnostic.severity}
                  </span>
                  <h3>{diagnostic.code}</h3>
                </div>
                <span className={styles.validBadge}>{copy.valid}</span>
              </div>
              <p>{diagnostic.message[locale]}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className={styles.entityPanel}
      aria-labelledby="graph-relations-title"
    >
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="graph-relations-title">{copy.relations}</h2>
          <p>{copy.relationHint}</p>
        </div>
      </div>
      <div>
        <span className={styles.controlLabel}>{copy.families}</span>
        <div className={styles.filterRow}>
          {(Object.keys(GRAPH_RELATION_FAMILIES) as GraphRelationFamily[]).map(
            (family) => {
              const familyTypes = GRAPH_RELATION_FAMILIES[family];
              const selected = familyTypes.every((type) =>
                state.query.relation_filter.types.includes(type)
              );
              return (
                <button
                  aria-pressed={selected}
                  key={family}
                  onClick={() =>
                    setState((current) =>
                      replaceGraphRelationFilter(current, {
                        ...current.query.relation_filter,
                        types: selected
                          ? current.query.relation_filter.types.filter(
                              (type) => !familyTypes.includes(type)
                            )
                          : [
                              ...new Set([
                                ...current.query.relation_filter.types,
                                ...familyTypes
                              ])
                            ]
                      })
                    )
                  }
                  type="button"
                >
                  {family}
                </button>
              );
            }
          )}
        </div>
      </div>
      <div>
        <span className={styles.controlLabel}>{copy.types}</span>
        <div className={styles.filterRow} data-testid="relation-type-filters">
          {MOIRAI_GRAPH_RELATION_TYPES.map((type) => {
            const selected = state.query.relation_filter.types.includes(type);
            return (
              <button
                aria-pressed={selected}
                key={type}
                onClick={() =>
                  setState((current) =>
                    replaceGraphRelationFilter(current, {
                      ...current.query.relation_filter,
                      types: selected
                        ? current.query.relation_filter.types.filter(
                            (value) => value !== type
                          )
                        : [...current.query.relation_filter.types, type]
                    })
                  )
                }
                type="button"
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.entityResults} data-testid="relation-results">
        {relations.map((relation) => (
          <article
            className={styles.entityCard}
            data-relation-id={relation.id}
            key={relation.id}
          >
            <div className={styles.entityHeading}>
              <div>
                <span className={styles.entityKind}>
                  Relation · World assertion
                </span>
                <h3>{relation.type}</h3>
              </div>
            </div>
            <p>
              {entityTitles.get(
                `${relation.worldId}:${relation.sourceIdentity}`
              ) ?? relation.sourceIdentity}{" "}
              →{" "}
              {entityTitles.get(
                `${relation.worldId}:${relation.targetIdentity}`
              ) ?? relation.targetIdentity}
            </p>
            <p>
              {relation.matchedCanonIds
                .map(
                  (id) =>
                    catalog.worlds
                      .find((world) => world.id === relation.worldId)
                      ?.canons.find((canon) => canon.id === id)?.label[
                      locale
                    ] ?? id
                )
                .join(" · ")}
            </p>
            <details className={styles.recordDetails}>
              <summary>{copy.recordDetails}</summary>
              <p>
                {relation.sourceIdentity} → {relation.targetIdentity}
              </p>
              <dl>
                <div>
                  <dt>{copy.matched}</dt>
                  <dd>{relation.matchedCanonIds.join(", ")}</dd>
                </div>
                <div>
                  <dt>{copy.memberships}</dt>
                  <dd>{relation.canonMemberships.join(", ")}</dd>
                </div>
                <div>
                  <dt>{copy.endpoints}</dt>
                  <dd>{relation.endpointEvidence.join(" · ")}</dd>
                </div>
                <div>
                  <dt>{copy.time}</dt>
                  <dd>{relation.timeSystemEvidence.join(" · ")}</dd>
                </div>
              </dl>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
