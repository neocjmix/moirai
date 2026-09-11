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
    relations: "R1 Relation 결과",
    relationHint:
      "공유 assertion은 한 번만 표시하고 Canon별 assertion은 별도 identity로 유지합니다.",
    families: "Relation families",
    types: "개별 Relation type",
    matched: "matched Canon",
    memberships: "all memberships",
    endpoints: "endpoint membership evidence",
    time: "Canon–Time System evidence",
    diagnostics: "Diagnostics",
    diagnosticHint:
      "지식 상태와 completeness를 표시하며 contradiction을 invalid로 만들지 않습니다.",
    valid: "valid knowledge state"
  },
  en: {
    relations: "R1 Relation results",
    relationHint:
      "Shared assertions appear once; Canon-specific assertions retain distinct identities.",
    families: "Relation families",
    types: "Individual Relation types",
    matched: "matched Canons",
    memberships: "all memberships",
    endpoints: "endpoint membership evidence",
    time: "Canon–Time System evidence",
    diagnostics: "Diagnostics",
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
    relations: sourceRelations,
    diagnostics: sourceDiagnostics
  } = useGraphQuery();
  const copy = COPY[locale];
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
          </article>
        ))}
      </div>
    </section>
  );
}
