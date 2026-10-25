"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALGORITHM,
  DEFAULT_CONFIG,
  MAX_TICK,
  SYNTHETIC_INPUT,
  createXSimulation,
  importRun,
  stateDigest,
  type SimulationConfig,
  type XSimulation
} from "@moirai/layout-simulation";
import styles from "./force-lab.module.css";

const numeric = (n: number) =>
  Number.isInteger(n)
    ? String(n)
    : Math.abs(n) < 0.001 && n !== 0
      ? n.toExponential(2)
      : n.toFixed(3);
const STATUS = {
  "warming-up": "관찰 구간 수집 중",
  moving: "이동 중",
  balanced: "힘 균형 · 품질 별도 검토",
  "damping-stalled": "감쇠 정지 · 힘 잔여",
  cooled: "냉각 정지 · 균형 보장 없음"
};
const GROUPS: {
  title: string;
  fields: {
    key: keyof SimulationConfig;
    label: string;
    min: number;
    max: number;
    step: number;
  }[];
}[] = [
  {
    title: "힘 · 강도 0이면 비활성",
    fields: [
      {
        key: "repulsionStrength",
        label: "전체 노드 척력",
        min: 0,
        max: 1000000,
        step: 1
      },
      {
        key: "linkStrength",
        label: "직접 링크 인력",
        min: 0,
        max: 1,
        step: 0.01
      },
      {
        key: "linkDistance",
        label: "링크 목표 거리",
        min: 0,
        max: 1000000,
        step: 1
      },
      {
        key: "centerStrength",
        label: "전역 중심력",
        min: 0,
        max: 1,
        step: 0.001
      },
      { key: "centerX", label: "중심 X", min: -1000000, max: 1000000, step: 1 },
      {
        key: "collisionStrength",
        label: "X 충돌 분리",
        min: 0,
        max: 1,
        step: 0.1
      },
      {
        key: "collisionIterations",
        label: "tick당 충돌 반복",
        min: 1,
        max: 8,
        step: 1
      }
    ]
  },
  {
    title: "냉각 · 속도 감쇠",
    fields: [
      { key: "alphaInitial", label: "초기 alpha", min: 0, max: 1, step: 0.01 },
      { key: "alphaTarget", label: "목표 alpha", min: 0, max: 1, step: 0.01 },
      {
        key: "alphaDecay",
        label: "tick당 냉각률",
        min: 0,
        max: 1,
        step: 0.001
      },
      { key: "velocityDecay", label: "속도 감쇠율", min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    title: "초기 상태",
    fields: [
      { key: "seed", label: "난수 seed", min: 0, max: 4294967295, step: 1 },
      {
        key: "initialSpread",
        label: "초기 X 폭",
        min: 0,
        max: 1000000,
        step: 1
      }
    ]
  },
  {
    title: "안정성 관찰",
    fields: [
      {
        key: "stabilityWindow",
        label: "최근 관찰 tick",
        min: 2,
        max: 1000,
        step: 1
      },
      {
        key: "displacementTolerance",
        label: "최대 이동 허용치",
        min: 0,
        max: 1000000,
        step: 0.001
      },
      {
        key: "forceTolerance",
        label: "최대 힘 허용치",
        min: 0,
        max: 1000000,
        step: 0.001
      }
    ]
  }
];
const draftFor = (config: SimulationConfig) =>
  Object.fromEntries(
    Object.entries(config).map(([key, value]) => [key, String(value)])
  ) as Record<keyof SimulationConfig, string>;

export function ForceLab() {
  const [engine, setEngine] = useState<XSimulation>(() =>
    createXSimulation(SYNTHETIC_INPUT)
  );
  const [frame, setFrame] = useState(() => ({
    state: engine.state(),
    diagnostics: { ...engine.diagnostics(), elapsedMs: 0 }
  }));
  const [draft, setDraft] = useState(() => draftFor({ ...DEFAULT_CONFIG }));
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reproduction, setReproduction] = useState("아직 검증하지 않음");
  const operation = useRef(0);
  const mounted = useRef(true);
  const { input, config: appliedConfig } = useMemo(
    () => engine.exportRun(),
    [engine]
  );
  const dirty = Object.keys(draft).some(
    (key) =>
      draft[key as keyof SimulationConfig] !==
      String(appliedConfig[key as keyof SimulationConfig])
  );
  const { state, diagnostics: d } = frame;
  const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
  const radii = new Map(input.nodes.map((node) => [node.id, node.radius ?? 5]));
  const offscreen = state.nodes.filter(
    (node) => Math.abs(node.x) > 250 || node.y < -25 || node.y > 180
  ).length;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current++;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    let handle = 0;
    const advance = () => {
      try {
        engine.tick(Math.min(4, MAX_TICK - engine.state().tick));
        setFrame({ state: engine.state(), diagnostics: engine.diagnostics() });
        if (engine.state().tick >= MAX_TICK) {
          setRunning(false);
          return;
        }
        handle = requestAnimationFrame(advance);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "시뮬레이션 실패");
        setRunning(false);
      }
    };
    handle = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(handle);
  }, [engine, running]);

  const replace = (next: XSimulation, note: string) => {
    operation.current++;
    setRunning(false);
    setEngine(next);
    setFrame({ state: next.state(), diagnostics: next.diagnostics() });
    setDraft(draftFor(next.exportRun().config));
    setMessage(note);
    setError("");
    setReproduction("아직 검증하지 않음");
  };

  // Seeking uses short batches so Safari can paint controls between computations.
  const seek = async (target: number) => {
    if (!Number.isInteger(target) || target < 0 || target > MAX_TICK) return;
    setRunning(false);
    setBusy(true);
    setError("");
    const request = ++operation.current;
    try {
      if (target < engine.state().tick) engine.seek(0);
      while (engine.state().tick < target) {
        engine.tick(Math.min(40, target - engine.state().tick));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
        if (!mounted.current || request !== operation.current) return;
      }
      setFrame({ state: engine.state(), diagnostics: engine.diagnostics() });
      setReproduction("아직 검증하지 않음");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "tick 재생 실패");
    } finally {
      if (mounted.current && request === operation.current) setBusy(false);
    }
  };

  const verify = async () => {
    setRunning(false);
    setBusy(true);
    setError("");
    const target = engine.state().tick;
    const expected = JSON.stringify(engine.state());
    const request = ++operation.current;
    try {
      const replay = createXSimulation(input, appliedConfig);
      while (replay.state().tick < target) {
        replay.tick(Math.min(40, target - replay.state().tick));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
        if (!mounted.current || request !== operation.current) return;
      }
      const prefixMatches = JSON.stringify(replay.state()) === expected;
      replay.tick(Math.min(100, MAX_TICK - target));
      replay.seek(0);
      while (replay.state().tick < target) {
        replay.tick(Math.min(40, target - replay.state().tick));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve())
        );
        if (!mounted.current || request !== operation.current) return;
      }
      setReproduction(
        prefixMatches && JSON.stringify(replay.state()) === expected
          ? `PASS · tick ${target} 상태 바이트 일치 · 독립 실행 + 되감기`
          : "FAIL · 상태 불일치"
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "재현 검증 실패");
    } finally {
      if (mounted.current && request === operation.current) setBusy(false);
    }
  };

  const exportJson = () => {
    setJson(JSON.stringify(engine.exportRun(), null, 2));
    setMessage("현재 입력·설정·tick·상태 checksum을 JSON에 기록했습니다.");
  };
  const download = () => {
    const content = JSON.stringify(engine.exportRun(), null, 2);
    setJson(content);
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `moirai-force-tick-${state.tick}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className={styles.lab}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>MOIRAI / X PLACEMENT RESEARCH</p>
            <h1>Layout Lab v2</h1>
          </div>
          <a href="/graph/v5">역사 그래프로</a>
        </header>
        <p className={styles.intro}>
          P1 물리 모델 검증 · {input.nodes.length}개 노드. 기본 데이터는 합성
          입력입니다. Y는 고정하고 X만 움직입니다. Iteration은 관찰 위치이며
          냉각 길이가 아닙니다. 수렴 후에도 요청한 tick까지 계산합니다.
        </p>
        <div className={styles.columns}>
          <div>
            <section className={styles.panel} aria-label="시뮬레이션">
              <div className={styles.panelHeading}>
                <h2>고정 카메라 · 고정 Y 축</h2>
                <span data-testid="state-tick">
                  tick {state.tick.toLocaleString("en-US")}
                </span>
              </div>
              <svg
                className={styles.graph}
                viewBox="-280 -55 560 270"
                role="img"
                aria-label="고정 Y의 합성 노드 X 배치"
                data-testid="force-scene"
                data-state-digest={stateDigest(state)}
              >
                <defs>
                  <clipPath id="force-lab-clip">
                    <rect x="-250" y="-25" width="500" height="205" />
                  </clipPath>
                </defs>
                {[-200, -100, 0, 100, 200].map((x) => (
                  <g key={x}>
                    <line
                      x1={x}
                      y1={-25}
                      x2={x}
                      y2={180}
                      stroke={x === 0 ? "#bdcbbf" : "#edf0e8"}
                      strokeDasharray={x === 0 ? "4 4" : undefined}
                    />
                    <text x={x} y={201} textAnchor="middle">
                      {x}
                    </text>
                  </g>
                ))}
                {[0, 35, 70, 105, 140, 175].map((y) => (
                  <g key={y}>
                    <line x1={-250} x2={250} y1={y} y2={y} stroke="#edf0e8" />
                    <text x={-257} y={y + 3} textAnchor="end">
                      {y}
                    </text>
                  </g>
                ))}
                <text x={-257} y={-37}>
                  Y
                </text>
                <text x={250} y={201}>
                  X
                </text>
                <g clipPath="url(#force-lab-clip)">
                  {input.links.map((link) => {
                    const a = nodesById.get(link.source),
                      b = nodesById.get(link.target);
                    return a && b ? (
                      <line
                        key={link.id}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="#b7c9b9"
                        strokeWidth={1}
                      />
                    ) : null;
                  })}
                  {state.nodes.map((node, index) => (
                    <g key={node.id}>
                      <circle
                        data-node-id={node.id}
                        cx={node.x}
                        cy={node.y}
                        r={radii.get(node.id)}
                        fill="#397459"
                        fillOpacity={0.8}
                        stroke="#fffef9"
                        strokeWidth={1}
                      >
                        <title>{`${node.id} · X ${numeric(node.x)} · Y ${node.y}`}</title>
                      </circle>
                      <text
                        className={styles.nodeLabel}
                        x={node.x}
                        y={node.y - (radii.get(node.id) ?? 5) - 4}
                        textAnchor="middle"
                      >
                        {index + 1}
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
              <div className={styles.toolbar}>
                <div className={styles.tickRow}>
                  <label htmlFor="exact-tick">
                    정확한 tick{" "}
                    <input
                      id="exact-tick"
                      type="number"
                      min={0}
                      max={MAX_TICK}
                      step={1}
                      key={state.tick}
                      defaultValue={state.tick}
                      disabled={busy || running}
                      onBlur={(event) => {
                        if (event.currentTarget.value !== "")
                          void seek(Number(event.currentTarget.value));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                    />
                  </label>
                  <span className={styles.small}>
                    0–{MAX_TICK.toLocaleString("en-US")}
                  </span>
                </div>
                <input
                  className={styles.slider}
                  aria-label="Iteration 슬라이더"
                  type="range"
                  min={0}
                  max={MAX_TICK}
                  step={1}
                  value={state.tick}
                  disabled={busy || running}
                  onChange={(event) =>
                    void seek(Number(event.currentTarget.value))
                  }
                />
                <div className={styles.buttons}>
                  <button
                    className={styles.primary}
                    disabled={busy || (!running && state.tick === MAX_TICK)}
                    onClick={() => {
                      setError("");
                      setReproduction("아직 검증하지 않음");
                      setRunning((value) => !value);
                    }}
                  >
                    {running ? "정지" : "시작"}
                  </button>
                  <button
                    disabled={busy || running || state.tick === MAX_TICK}
                    onClick={() => void seek(state.tick + 1)}
                  >
                    +1 tick
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      replace(
                        createXSimulation(input, appliedConfig),
                        "동일 입력·초기 상태로 tick 0에서 재시작합니다."
                      )
                    }
                  >
                    재시작
                  </button>
                </div>
                <p className={styles.small}>
                  {busy
                    ? "계산 중…"
                    : running
                      ? "4 tick씩 재생 중 · 정지하면 현재 상태를 유지합니다."
                      : "숫자를 입력하고 Enter 또는 다른 곳을 누르면 해당 tick으로 이동합니다."}{" "}
                  되감기는 같은 seed로 재계산합니다. 화면 밖 노드 {offscreen}개
                  · 카메라는 자동 이동하지 않습니다.
                </p>
              </div>
            </section>
            <section
              className={`${styles.panel} ${styles.metrics}`}
              aria-label="수렴과 배치 품질"
            >
              <div className={styles.panelHeading}>
                <h2>이동량과 배치 품질</h2>
                <span>alpha {numeric(state.alpha)}</span>
              </div>
              <dl className={styles.metricGrid}>
                {[
                  ["RMS X 이동량", d.movement.rmsDisplacement],
                  ["최대 X 이동량", d.movement.maxDisplacement],
                  ["RMS X 속도", d.movement.rmsVelocity],
                  ["감쇠 전 힘 잔여 RMS", d.movement.rmsForceImpulse],
                  ["노드 충돌 수", d.quality.collisionCount],
                  ["최대 겹침 깊이", d.quality.maxPenetration],
                  ["X 분산", d.quality.xVariance],
                  ["X 사용 폭", d.quality.xSpan],
                  ["계산 시간 (ms)", d.elapsedMs]
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>{numeric(Number(value))}</dd>
                  </div>
                ))}
              </dl>
              <div className={styles.metricNotes}>
                <span className={styles.status}>
                  {STATUS[d.stability.status]}
                </span>
                <p className={styles.small}>
                  최근 {d.stability.windowTicks}/{appliedConfig.stabilityWindow}{" "}
                  tick · 구간 RMS 변화 {numeric(d.stability.rmsTrend)}. 균형
                  판정도 좋은 배치를 보장하지 않습니다. 충돌·거리 strain을 따로
                  비교하세요. 시간은 시뮬레이션과 이번 진단 계산이며 화면 그리기
                  시간은 제외합니다.
                </p>
                <div className={styles.strain}>
                  {d.quality.relationStrain.map((strain) => (
                    <span key={strain.kind}>
                      {strain.kind}: RMS strain {numeric(strain.rms)} ·{" "}
                      {strain.count}개 링크 · 고정 Y로 목표 거리 불가{" "}
                      {strain.impossibleYCount}개
                    </span>
                  ))}
                </div>
                <p className={styles.small}>
                  상태 checksum{" "}
                  <code data-testid="state-checksum">{stateDigest(state)}</code>{" "}
                  · {ALGORITHM}
                </p>
                <p className={styles.notice} data-testid="reproduction-result">
                  {reproduction}
                </p>
                <button
                  disabled={busy || running}
                  onClick={() => void verify()}
                >
                  현재 tick 재현 검증
                </button>
              </div>
            </section>
          </div>
          <section className={styles.panel} aria-label="Force 설정">
            <div className={styles.panelHeading}>
              <h2>독립 파라미터</h2>
              <span>{dirty ? "미적용 변경" : "적용됨"}</span>
            </div>
            <form
              className={styles.controls}
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const config = Object.fromEntries(
                    Object.entries(draft).map(([key, value]) => {
                      if (!value.trim())
                        throw new Error("빈 설정값을 입력해 주세요.");
                      return [key, Number(value)];
                    })
                  ) as unknown as SimulationConfig;
                  replace(
                    createXSimulation(input, config),
                    "설정을 적용하고 동일 입력의 tick 0으로 돌아왔습니다."
                  );
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "설정 오류"
                  );
                }
              }}
            >
              {GROUPS.map((group) => (
                <fieldset key={group.title} disabled={busy || running}>
                  <legend>{group.title}</legend>
                  {group.fields.map((field) => (
                    <label
                      className={styles.control}
                      key={field.key}
                      htmlFor={`param-${field.key}`}
                    >
                      {field.label}
                      <input
                        id={`param-${field.key}`}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={draft[field.key]}
                        required
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value
                          }))
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
              <div className={styles.buttons}>
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={busy || running}
                >
                  설정 적용 · tick 0
                </button>
                <button
                  type="button"
                  disabled={busy || running}
                  onClick={() =>
                    replace(
                      createXSimulation(SYNTHETIC_INPUT),
                      "기본 합성 입력과 설정으로 돌아왔습니다."
                    )
                  }
                >
                  기본값
                </button>
              </div>
              <p className={styles.small}>
                기본 alpha는 1로 일정합니다. 냉각률은 tick마다 적용되며 관찰
                tick 수와 무관합니다. 속도 감쇠율 1은 이동을 완전히 차단합니다.
                충돌은 고정 Y에서 필요한 X 분리를 계산하며 alpha와 독립적입니다.
              </p>
            </form>
          </section>
        </div>
        <section
          className={`${styles.panel} ${styles.exchange}`}
          aria-label="JSON 재현"
        >
          <div className={styles.panelHeading}>
            <h2>설정과 결과 재현</h2>
            <span>브라우저 안에서만 계산</span>
          </div>
          <div className={styles.exchangeBody}>
            <div className={styles.buttons}>
              <button disabled={busy || running} onClick={exportJson}>
                JSON 내보내기
              </button>
              <button disabled={busy || running} onClick={download}>
                파일 저장
              </button>
              <button
                disabled={busy || running || !json.trim()}
                onClick={() => {
                  try {
                    if (json.length > 1000000)
                      throw new Error("JSON 크기 제한은 1 MB입니다.");
                    const next = importRun(JSON.parse(json));
                    replace(
                      next,
                      "JSON 버전·입력·설정·상태 checksum 재현 검증 통과."
                    );
                    setReproduction(
                      `PASS · JSON tick ${next.state().tick} 재현`
                    );
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "JSON 불러오기 실패"
                    );
                  }
                }}
              >
                JSON 불러오기
              </button>
            </div>
            <label className={styles.small} htmlFor="run-json">
              입력·설정·tick·checksum JSON
            </label>
            <textarea
              id="run-json"
              value={json}
              spellCheck={false}
              onChange={(event) => setJson(event.target.value)}
              placeholder="내보낸 JSON을 붙여 넣으면 같은 상태로 재계산합니다."
            />
            <p className={styles.small}>
              형식과 알고리즘 버전을 엄격히 확인하고 상태 checksum을
              재계산합니다. checksum은 재현 검사이며 파일의 진위를 인증하지
              않습니다. 파일에는 사용자 입력이 그대로 포함됩니다.
            </p>
            <p className={styles.notice} role="status">
              {message}
            </p>
            {error && (
              <p className={`${styles.notice} ${styles.error}`} role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
        <p className={styles.footer}>
          P1 실행 가능한 물리 프로토타입입니다. Composite·Collection 의미 모델,
          Y-sweep 면 표시, 동일 카메라 A/B 비교, 실제 역사 데이터 연결은 후속
          단계입니다. 이 실험은 역사·Publication·운영 기본 배치를 변경하지
          않습니다. 실제 iPhone 17 Safari/PWA 검수는 별도로 필요합니다.
        </p>
      </div>
    </main>
  );
}
