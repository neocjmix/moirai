"use client";
import { useEffect, useState } from "react";
import {
  MAX_TICK,
  stateDigest,
  type SimulationConfig
} from "@moirai/layout-simulation";
import type { GraphForceLab } from "./use-graph-force-lab";
import styles from "./graph-force-lab.module.css";
const number = (value: number) =>
  Math.abs(value) < 0.001 && value !== 0
    ? value.toExponential(2)
    : value.toFixed(3);
export function GraphForceSettings({ lab }: { lab: GraphForceLab }) {
  return (
    <section className={styles.settings} data-testid="layout-v2-settings">
      <h2>Labs · Layout Lab v2</h2>
      <p>
        현재 World의 실제 사건을 같은 그래프에서 비교합니다. 시간
        Y·카메라·선택을 유지하고 X만 실험합니다. 발행된 기본 배치는 변경하지
        않습니다.
      </p>
      <div className={styles.row}>
        <button aria-pressed={!lab.enabled} onClick={() => lab.choose(false)}>
          현재 운영
        </button>
        <button
          aria-pressed={lab.enabled}
          onClick={() => {
            lab.choose(true);
            const url = new URL(window.location.href);
            url.pathname = "/graph/v5";
            window.history.pushState(window.history.state, "", url);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          Lab v2 · 그래프에서 실험
        </button>
      </div>
    </section>
  );
}
const fields: {
  key: keyof SimulationConfig;
  title: string;
  step: string;
  max: number;
}[] = [
  {
    key: "repulsionStrength",
    title: "전체 노드 척력",
    step: "1",
    max: 1000000
  },
  {
    key: "compositeAttraction",
    title: "Composite 허브 인력 factor",
    step: ".01",
    max: 1
  },
  {
    key: "compositeRepulsion",
    title: "Composite 간 허브 척력 factor",
    step: "1",
    max: 1000000
  },
  { key: "linkStrength", title: "직접 관계 인력", step: ".01", max: 1 },
  { key: "linkDistance", title: "관계 목표 거리", step: "1", max: 1000000 },
  { key: "centerStrength", title: "전역 중심력", step: ".001", max: 1 },
  { key: "collisionStrength", title: "X 충돌 분리", step: ".1", max: 1 },
  { key: "velocityDecay", title: "속도 감쇠", step: ".01", max: 1 },
  { key: "alphaDecay", title: "tick당 냉각률", step: ".001", max: 1 },
  { key: "alphaTarget", title: "목표 alpha", step: ".01", max: 1 }
];
export function GraphForceOverlay({
  lab,
  drawerOpen
}: {
  lab: GraphForceLab;
  drawerOpen: boolean;
}) {
  const [inputTick, setInputTick] = useState("0");
  const [expanded, setExpanded] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => setInputTick(String(lab.requestedTick)), [lab.requestedTick]);
  if (!lab.enabled)
    return (
      <button
        className={styles.launcher}
        data-drawer-open={drawerOpen ? "true" : "false"}
        onClick={() => lab.choose(true)}
      >
        Lab v2
      </button>
    );
  const painted = lab.paintedFrame;
  const config = lab.frame?.config;
  const unavailable = !lab.frame || lab.loading;
  return (
    <section
      className={styles.overlay}
      data-drawer-open={drawerOpen ? "true" : "false"}
      data-testid="layout-v2-overlay"
      data-tick={painted?.state.tick ?? -1}
      data-target-tick={lab.requestedTick}
      data-state-digest={painted ? stateDigest(painted.state) : ""}
      data-node-count={painted?.state.nodes.length ?? 0}
      data-loading={lab.loading ? "true" : "false"}
      data-pending={lab.pending ? "true" : "false"}
      aria-label="Layout Lab v2 그래프 조절"
    >
      <div className={styles.heading}>
        <strong>
          Lab v2{" "}
          <small>
            {lab.snapshot
              ? `r${lab.snapshot.sourceRevision} · ${lab.snapshot.events.length} 사건`
              : "실제 역사 입력"}
          </small>
        </strong>
        <button
          onClick={() => {
            lab.play(false);
            lab.choose(false);
          }}
        >
          현재 운영
        </button>
        <button
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          설정 {expanded ? "▴" : "▾"}
        </button>
      </div>
      {lab.loading ? (
        <p role="status">
          현재 World의 고정 입력을 불러오는 중… 기본 그래프는 그대로 유지합니다.
        </p>
      ) : null}
      {lab.error ? (
        <p role="alert">
          {lab.error} <button onClick={lab.retry}>다시 시도</button>
        </p>
      ) : null}
      <div className={styles.iteration}>
        <label>
          Iteration{" "}
          <input
            aria-label="Iteration"
            type="number"
            min={0}
            max={MAX_TICK}
            step={1}
            inputMode="numeric"
            value={inputTick}
            disabled={unavailable}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setInputTick(value);
              if (value !== "") lab.seek(Number(value));
            }}
          />
        </label>
        <button
          disabled={unavailable || lab.requestedTick < 1}
          onClick={() => lab.seek(Math.max(0, lab.requestedTick - 1))}
        >
          −1
        </button>
        <button
          disabled={unavailable || lab.requestedTick >= MAX_TICK}
          onClick={() => lab.seek(Math.min(MAX_TICK, lab.requestedTick + 1))}
        >
          +1
        </button>
        <button disabled={unavailable} onClick={() => lab.play(!lab.running)}>
          {lab.running ? "정지" : "시작"}
        </button>
        <button disabled={unavailable} onClick={() => lab.seek(0)}>
          재시작
        </button>
      </div>
      <input
        className={styles.slider}
        aria-label="Iteration 슬라이더"
        type="range"
        min={0}
        max={MAX_TICK}
        step={1}
        value={lab.requestedTick}
        disabled={unavailable}
        onChange={(event) => lab.seek(Number(event.currentTarget.value))}
      />
      <div className={styles.status} aria-live="off">
        <span>
          표시{" "}
          <b data-testid="layout-v2-painted-tick">
            {painted?.state.tick ?? "—"}
          </b>{" "}
          / 요청 {lab.requestedTick}
        </span>
        {lab.pending && !lab.loading ? (
          <span role="status">반영 중</span>
        ) : null}
        {painted ? (
          <>
            <span>
              RMS ΔX {number(painted.diagnostics.movement.rmsDisplacement)}
            </span>
            <span>충돌 {painted.diagnostics.quality.collisionCount}</span>
            <span>물리 {number(painted.diagnostics.elapsedMs)} ms</span>
          </>
        ) : (
          <span>첫 장면 준비 중</span>
        )}
      </div>
      {expanded && config ? (
        <div className={styles.details}>
          <p>
            모든 노드·허브는 X=0, Y는 고정입니다. 드래그는 최신 요청으로
            이동하며 표시 tick은 실제 그래프 반영 후 갱신됩니다. Composite별
            가상 허브가 고유한 물리 자손과 1:n으로 연결됩니다. 인력은 자손 수로
            정규화하고, 허브 간 척력은 XY 거리를 사용합니다. 각 factor를 0으로
            끌 수 있습니다.
          </p>
          <form
            key={JSON.stringify(config)}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const next = { ...config };
              for (const field of fields)
                next[field.key] = Number(form.get(field.key));
              lab.configure(next);
            }}
          >
            <div className={styles.fields}>
              {fields.map((field) => (
                <label key={field.key}>
                  {field.title}
                  <input
                    name={field.key}
                    type="number"
                    required
                    min={0}
                    max={field.max}
                    step={field.step}
                    defaultValue={config[field.key]}
                  />
                </label>
              ))}
            </div>
            <button type="submit">설정 적용 · tick 0</button>
          </form>
          {painted ? (
            <p>
              최대 ΔX {number(painted.diagnostics.movement.maxDisplacement)} ·
              속도 RMS {number(painted.diagnostics.movement.rmsVelocity)} · 힘
              잔여 {number(painted.diagnostics.movement.rmsForceImpulse)} · X 폭{" "}
              {number(painted.diagnostics.quality.xSpan)} ·{" "}
              {painted.diagnostics.stability.status}
              <br />
              정지한 배치가 좋은 배치를 뜻하지 않습니다. Composite 면은 기존
              Y-sweep입니다.
            </p>
          ) : null}
          <button
            disabled={!painted}
            onClick={() => {
              lab.exportRun();
              setJsonOpen(true);
            }}
          >
            설정·결과 JSON
          </button>
          {jsonOpen ? (
            <div>
              {lab.exported ? (
                <textarea
                  aria-label="설정과 결과 JSON"
                  readOnly
                  value={JSON.stringify(lab.exported, null, 2)}
                />
              ) : null}
              <textarea
                aria-label="가져올 실험 JSON"
                placeholder="같은 World와 입력으로 내보낸 JSON을 붙여넣으세요"
                value={importText}
                onChange={(event) => setImportText(event.currentTarget.value)}
              />
              <button
                disabled={!importText.trim()}
                onClick={() => {
                  try {
                    lab.importRun(JSON.parse(importText));
                    setImportError(null);
                  } catch {
                    setImportError("JSON 형식을 확인하세요.");
                  }
                }}
              >
                JSON 재현
              </button>
              {importError ? <p role="alert">{importError}</p> : null}
              {lab.imported ? (
                <p role="status">tick {lab.imported.tick} 재현 일치 확인</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
