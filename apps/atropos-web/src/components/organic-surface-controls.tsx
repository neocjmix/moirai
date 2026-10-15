"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  DEFAULT_ORGANIC_SURFACE_PARAMETERS,
  ORGANIC_SURFACE_PARAMETER_DEFINITIONS,
  ORGANIC_SURFACE_REFERENCE_METRIC,
  type OrganicSurfaceParameters,
  type OrganicSurfaceResult
} from "../lib/organic-surface";
import type { TstlExperimentPoint } from "../lib/tstl-experiment-types";
import type { AppLocale } from "../urdr-port/src/locale";
import type { useTstlLayout } from "./use-tstl-layout";
import styles from "./organic-surface-controls.module.css";

type Props = { locale: AppLocale; layout: ReturnType<typeof useTstlLayout> };
type ParameterKey = keyof OrganicSurfaceParameters;
type Draft = Record<ParameterKey, string>;
const parameterLabels: Record<ParameterKey, { ko: string; en: string }> = {
  radiusX: { ko: "가로 반경 X", en: "Node radius X" },
  radiusY: { ko: "세로 반경 Y", en: "Node radius Y" },
  levelScale: {
    ko: "Composite 단계별 반경 증가",
    en: "Footprint per Composite level"
  },
  relationStrength: { ko: "관계 점착 강도", en: "Relation adhesion" },
  relationWidth: { ko: "관계 영향 폭", en: "Relation width" },
  threshold: { ko: "면의 필드 임계값", en: "Field threshold" },
  paddingScale: { ko: "중첩 패딩 배수", en: "Nesting padding multiplier" },
  sampleStep: {
    ko: "경계 샘플 간격 · 작을수록 정밀",
    en: "Contour step · smaller is finer"
  },
  smoothing: { ko: "경계 다듬기 횟수", en: "Boundary smoothing passes" }
};
const draftFrom = (parameters: OrganicSurfaceParameters): Draft =>
  Object.fromEntries(
    ORGANIC_SURFACE_PARAMETER_DEFINITIONS.map(({ key }) => [
      key,
      String(parameters[key])
    ])
  ) as Draft;

export function OrganicSurfaceControls({ locale, layout }: Props) {
  const ko = locale === "ko";
  const language = ko ? "ko" : "en";
  const id = useId();
  const { organic } = layout;
  const [draft, setDraft] = useState(() => draftFrom(organic.parameters));
  const [json, setJson] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  useEffect(
    () => setDraft(draftFrom(organic.parameters)),
    [organic.parameters]
  );
  const parameters = { ...organic.parameters };
  for (const { key } of ORGANIC_SURFACE_PARAMETER_DEFINITIONS) {
    parameters[key] = Number(draft[key]);
  }
  const valid = ORGANIC_SURFACE_PARAMETER_DEFINITIONS.every(
    ({ key, min, max }) =>
      draft[key].trim() !== "" &&
      Number.isFinite(parameters[key]) &&
      parameters[key] >= min &&
      parameters[key] <= max &&
      (key !== "smoothing" || Number.isInteger(parameters[key]))
  );
  const changed = ORGANIC_SURFACE_PARAMETER_DEFINITIONS.some(
    ({ key }) => parameters[key] !== organic.parameters[key]
  );
  const busy = organic.busy || importing;
  const exportJson = () => {
    const exported = layout.exportOrganic();
    setJson(exported);
    return exported;
  };
  const copy = async () => {
    try {
      const exported = exportJson();
      await navigator.clipboard.writeText(exported);
      setNotice(
        ko
          ? "적용된 설정과 현재 화면을 복사했습니다."
          : "Copied applied settings and the current view."
      );
    } catch {
      setNotice(
        ko
          ? "아래 JSON을 선택해 복사하세요."
          : "Select and copy the JSON below."
      );
    }
  };
  const download = () => {
    try {
      const blob = new Blob([exportJson()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "moirai-organic-surface.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(
        ko
          ? "적용된 설정과 현재 화면을 내보냈습니다."
          : "Exported applied settings and the current view."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };
  const importJson = async () => {
    setImporting(true);
    setNotice("");
    try {
      await layout.importOrganic(json);
      setNotice(
        ko
          ? "JSON의 설정과 화면을 복원했습니다."
          : "Restored settings and view from JSON."
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };
  return (
    <details
      className={styles.controls}
      data-testid="organic-controls"
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <summary data-testid="organic-controls-summary">
        {ko ? "Organic · 모양 조절과 검수" : "Organic · shape and inspection"}
      </summary>
      <div className={styles.content}>
        <p>
          {ko ? "고정 기준 좌표" : "Frozen coordinate baseline"}:{" "}
          <strong>{organic.baseline}</strong>
          {ko
            ? ". 사건 위치는 다시 계산하지 않습니다."
            : ". Event positions are not recomputed."}
        </p>
        <button
          type="button"
          data-testid="organic-compare-baseline"
          disabled={busy}
          onClick={() => void layout.choose(organic.baseline)}
        >
          {ko ? "같은 화면에서 기준 면 보기" : "Compare baseline in this view"}
        </button>
        <div
          className={styles.display}
          role="group"
          aria-label={ko ? "표시할 경계" : "Boundary display"}
        >
          {(["base", "padded", "overlay"] as const).map((display) => (
            <button
              key={display}
              type="button"
              data-testid={`organic-display-${display}`}
              aria-pressed={organic.display === display}
              disabled={busy}
              onClick={() => layout.setOrganicDisplay(display)}
            >
              {display === "base"
                ? ko
                  ? "기본 면"
                  : "Base"
                : display === "padded"
                  ? ko
                    ? "패딩 면"
                    : "Padded"
                  : ko
                    ? "경계 겹쳐 보기"
                    : "Overlay"}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !busy) void layout.recomputeOrganic(parameters);
          }}
        >
          <fieldset disabled={busy}>
            <legend>{ko ? "면 파라미터" : "Surface parameters"}</legend>
            <div className={styles.parameters}>
              {ORGANIC_SURFACE_PARAMETER_DEFINITIONS.map(
                ({ key, min, max, step }) => (
                  <label key={key} htmlFor={`${id}-${key}`}>
                    <span>{parameterLabels[key][language]}</span>
                    <input
                      id={`${id}-${key}`}
                      data-testid={`organic-parameter-${key}`}
                      type="number"
                      inputMode="decimal"
                      min={min}
                      max={max}
                      step={step}
                      required
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [key]: event.target.value
                        }))
                      }
                    />
                  </label>
                )
              )}
            </div>
            <p className={styles.hint}>
              {ko
                ? "패딩은 기본 면을 만든 뒤 중첩 깊이에 따라 경계를 확장합니다. 반경과 독립적이며, 섬을 합치거나 작은 구멍을 닫을 수 있습니다. 작은 샘플 간격은 계산이 오래 걸릴 수 있습니다."
                : "Padding expands the completed base boundary according to nesting depth, independently of node radii. It can join islands or close small holes. Finer contour steps can take longer to compute."}
            </p>
            <div className={styles.actions}>
              <button
                type="submit"
                data-testid="organic-recompute"
                disabled={!valid || busy}
              >
                {busy
                  ? ko
                    ? "계산 중…"
                    : "Computing…"
                  : ko
                    ? "적용 · 다시 계산"
                    : "Apply · recompute"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setDraft(draftFrom(DEFAULT_ORGANIC_SURFACE_PARAMETERS))
                }
              >
                {ko ? "초기 값 채우기" : "Fill initial values"}
              </button>
            </div>
          </fieldset>
          <p role="status" aria-live="polite">
            {busy
              ? ko
                ? "새 경계를 계산하고 있습니다."
                : "Computing new boundaries."
              : !valid
                ? ko
                  ? "각 항목의 범위 안에서 숫자를 입력하세요."
                  : "Enter numbers within each field’s range."
                : changed
                  ? ko
                    ? "아직 적용하지 않은 변경이 있습니다."
                    : "Some changes have not been applied."
                  : ko
                    ? "현재 적용된 파라미터입니다."
                    : "These parameters are currently applied."}
          </p>
        </form>
        {organic.error ? (
          <p role="alert" className={styles.error}>
            {organic.error}
          </p>
        ) : null}
        {organic.result ? (
          <OrganicInspector
            locale={locale}
            layout={layout}
            result={organic.result}
          />
        ) : null}
        <details className={styles.reproduction}>
          <summary>
            {ko ? "설정·화면 재현 JSON" : "Reproduce settings and view"}
          </summary>
          <p>
            {ko
              ? "내보내기는 적용된 값과 기준선, 현재 화면을 저장합니다. 값을 편집했다면 먼저 적용하세요. JSON을 붙여 넣어 같은 조건을 복원할 수 있습니다."
              : "Export saves applied values, the baseline and the current view. Apply edited values first. Paste a saved JSON to restore the same conditions."}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              data-testid="organic-copy"
              disabled={busy}
              onClick={() => void copy()}
            >
              {ko ? "JSON 복사" : "Copy JSON"}
            </button>
            <button
              type="button"
              data-testid="organic-download"
              disabled={busy}
              onClick={download}
            >
              {ko ? "JSON 저장" : "Save JSON"}
            </button>
          </div>
          <label className={styles.jsonLabel} htmlFor={`${id}-json`}>
            {ko ? "재현 JSON" : "Reproduction JSON"}
            <textarea
              id={`${id}-json`}
              data-testid="organic-reproduction-json"
              rows={5}
              spellCheck={false}
              value={json}
              onChange={(event) => setJson(event.target.value)}
            />
          </label>
          <button
            type="button"
            data-testid="organic-import"
            disabled={busy || !json.trim()}
            onClick={() => void importJson()}
          >
            {ko ? "JSON으로 복원 · 다시 계산" : "Restore JSON · recompute"}
          </button>
          <p role="status" aria-live="polite">
            {notice}
          </p>
        </details>
        <p className={styles.hint}>
          {ko
            ? "이 후보의 시각적 완성도는 아직 승인되지 않았습니다."
            : "This candidate has not received visual acceptance."}
        </p>
      </div>
    </details>
  );
}

function OrganicInspector({
  locale,
  layout,
  result
}: Props & { result: OrganicSurfaceResult }) {
  const ko = locale === "ko";
  const [requestedId, setRequestedId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("organicComposite") ??
        "")
  );
  const composite =
    result.composites.find((entry) => entry.compositeId === requestedId) ??
    result.composites[0];
  const names = useMemo(
    () =>
      new Map(
        layout.artifact?.b0Primitives.map((primitive) => [
          primitive.entity.id,
          primitive.label
        ]) ?? []
      ),
    [layout.artifact]
  );
  if (!composite) return null;
  const owner = composite.compositeId;
  const base = result.baseContoursByCompositeId[owner] ?? [];
  const padded = result.paddedContoursByCompositeId[owner] ?? [];
  const points = [...base.flat(), ...padded.flat()];
  const scaleY = ORGANIC_SURFACE_REFERENCE_METRIC.scaleY;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, (maxY - minY) * scaleY);
  const margin = Math.max(width, height) * 0.04;
  const path = (rings: readonly (readonly TstlExperimentPoint[])[]) =>
    rings
      .map(
        (ring) =>
          ring
            .map(
              (point, index) =>
                `${index === 0 ? "M" : "L"}${point.x - minX},${(point.y - minY) * scaleY}`
            )
            .join(" ") + " Z"
      )
      .join(" ");
  const display = layout.organic.display;
  const warningTranslations: Record<string, string> = {
    "Nominal member glyph support conflicts remain; exact membership and Event identity are retained.":
      "사건 표시 영역의 충돌로 면에 완전히 포함하지 못한 소속이 있습니다. 원본 소속과 사건 ID는 유지됩니다.",
    "Nonmember avoidance cuts requested padding; constant clearance is not met at those glyphs.":
      "비소속 사건을 피하기 위해 패딩 면을 잘라냈습니다. 해당 표시 영역에서는 요청한 일정 간격을 확보하지 못했습니다.",
    "Some semantic relations have no resolved path and contribute no adhesion field.":
      "경로가 없는 관계는 점착 필드에 반영하지 못했습니다.",
    "No local padding profile: using the supplied Composite depth over its semantic Y bounds.":
      "구간별 패딩 정보가 없어 Composite의 시간 범위에 제공된 중첩 깊이를 적용했습니다."
  };
  const missing =
    display === "base"
      ? composite.baseMissingMemberIds
      : composite.paddedMissingMemberIds;
  const eventHref = (eventId: string) => {
    const url = new URL(
      typeof window === "undefined"
        ? "http://localhost/graph/v5"
        : window.location.href
    );
    url.searchParams.set("gsEvent", eventId);
    return `${url.pathname}${url.search}`;
  };
  return (
    <details className={styles.inspector} data-testid="organic-inspector">
      <summary data-testid="organic-inspector-summary">
        {ko
          ? "Composite 경계·구멍·섬 검수"
          : "Inspect Composite boundaries, holes and islands"}
      </summary>
      <label className={styles.owner}>
        {ko ? "검수할 Composite" : "Composite to inspect"}
        <select
          data-testid="organic-inspector-composite"
          value={owner}
          onChange={(event) => {
            const selected = event.target.value;
            setRequestedId(selected);
            const url = new URL(window.location.href);
            url.searchParams.set("organicComposite", selected);
            window.history.replaceState(window.history.state, "", url);
          }}
        >
          {result.composites.map((entry) => (
            <option key={entry.compositeId} value={entry.compositeId}>
              {names.get(entry.compositeId) || entry.compositeId}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.hint}>
        {ko
          ? "동일한 최종 경계를 고정 기준 비율로 맞춰 봅니다. 그래프의 현재 확대율과는 다릅니다. 초록은 패딩 면, 분홍은 기본 경계입니다."
          : "The same final boundaries fit to a fixed reference ratio, independently of graph zoom. Green is padded; pink is the base boundary."}
      </p>
      {points.length ? (
        <svg
          className={styles.preview}
          data-testid="organic-inspector-svg"
          role="img"
          aria-label={`${names.get(owner) || owner}: ${display}`}
          viewBox={`${-margin} ${-margin} ${width + margin * 2} ${height + margin * 2}`}
        >
          {display !== "base" ? (
            <path
              d={path(padded)}
              className={styles.paddedPath}
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {display !== "padded" ? (
            <path
              d={path(base)}
              className={
                display === "overlay" ? styles.baseOutline : styles.basePath
              }
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {composite.memberEventIds.map((eventId) => {
            const point = result.memberPointsByEventId[eventId];
            return point ? (
              <circle
                key={eventId}
                cx={point.x - minX}
                cy={(point.y - minY) * scaleY}
                r={ORGANIC_SURFACE_REFERENCE_METRIC.glyphHalfSize}
                className={styles.memberPoint}
              >
                <title>{names.get(eventId) || eventId}</title>
              </circle>
            ) : null;
          })}
        </svg>
      ) : (
        <p>
          {ko
            ? "이 Composite의 면을 생성하지 못했습니다."
            : "No area was generated for this Composite."}
        </p>
      )}
      <dl className={styles.metrics} data-testid="organic-diagnostics">
        <div>
          <dt>
            {ko ? "연결된 영역 · 기본 → 패딩" : "Components · base → padded"}
          </dt>
          <dd>
            {composite.baseComponents} → {composite.paddedComponents}
          </dd>
        </div>
        <div>
          <dt>{ko ? "구멍 · 기본 → 패딩" : "Holes · base → padded"}</dt>
          <dd>
            {composite.baseHoles} → {composite.paddedHoles}
          </dd>
        </div>
        <div>
          <dt>
            {ko
              ? "소속 사건 미포함 · 기본 → 패딩"
              : "Missing members · base → padded"}
          </dt>
          <dd>
            {composite.baseMissingMemberIds.length} →{" "}
            {composite.paddedMissingMemberIds.length}
          </dd>
        </div>
        <div>
          <dt>
            {ko
              ? "비소속 표시 영역 교차 · 기본 → 패딩"
              : "Nonmember intersections · base → padded"}
          </dt>
          <dd>
            {composite.baseNonmemberIntersections} →{" "}
            {composite.paddedNonmemberIntersections}
          </dd>
        </div>
        <div>
          <dt>
            {ko ? "패딩 여유 부족 면적" : "Padding clearance deficit area"}
          </dt>
          <dd>{composite.paddingClearanceDeficitArea.toFixed(3)}</dd>
        </div>
        <div>
          <dt>{ko ? "구간별 중첩 깊이" : "Nesting depths across bands"}</dt>
          <dd>{composite.paddingDepths.join(", ")}</dd>
        </div>
        <div>
          <dt>
            {ko
              ? "경로를 반영하지 못한 관계"
              : "Relations without resolved support"}
          </dt>
          <dd>{composite.unsupportedRelationIds.length}</dd>
        </div>
      </dl>
      {composite.warnings.length ? (
        <ul className={styles.warnings}>
          {composite.warnings.map((warning) => (
            <li key={warning}>
              {ko ? (warningTranslations[warning] ?? warning) : warning}
            </li>
          ))}
        </ul>
      ) : null}
      {missing.length ? (
        <details>
          <summary>
            {ko
              ? `면에 포함하지 못한 실제 소속 ${missing.length}개`
              : `${missing.length} memberships without full area coverage`}
          </summary>
          <ul className={styles.missing}>
            {missing.map((eventId) => (
              <li key={eventId}>
                <a href={eventHref(eventId)}>{names.get(eventId) || eventId}</a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <details>
        <summary>
          {ko ? "전체 계산 진단" : "Full computation diagnostics"}
        </summary>
        <pre className={styles.diagnosticJson}>
          {JSON.stringify(
            { aggregate: result.diagnostics, composite },
            null,
            2
          )}
        </pre>
      </details>
    </details>
  );
}
