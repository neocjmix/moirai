"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeLayout,
  defaultLayoutSelection,
  getLayoutAlgorithm,
  layoutAlgorithms,
  type LayoutSelection
} from "@moirai/graph-presentation/layout-engine";
import {
  DEFAULT_REPRESENTATION_CONFIG,
  REPRESENTATION_CONFIG_VERSION,
  REPRESENTATION_PARAMETERS,
  validateRepresentationConfig,
  type RepresentationHistory
} from "./representation";
import {
  freezeSnapshot,
  parseLabPreset,
  type LabCamera,
  type LabCandidate,
  type LabPreset
} from "./preset";
import { fitCamera, layoutGeometry } from "./geometry";
import { LabScene } from "./lab-scene";
import type { LabSnapshot } from "./types";
import "./layout-lab.css";

const STORAGE = "moirai-layout-lab/preset/1";
const initialCandidate = (): LabCandidate => ({
  layout: defaultLayoutSelection(),
  representation: { ...DEFAULT_REPRESENTATION_CONFIG }
});
export function LayoutLab({
  initialSnapshot
}: {
  initialSnapshot: LabSnapshot;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [snapshot, setSnapshot] = useState(() =>
    freezeSnapshot(initialSnapshot)
  );
  const [before, setBefore] = useState<LabCandidate>(initialCandidate);
  const [after, setAfter] = useState<LabCandidate>(initialCandidate);
  const [computedSelection, setComputedSelection] = useState(after.layout);
  const parameterSets = useRef<Record<string, LayoutSelection>>({
    "legacy-force": after.layout
  });
  useEffect(() => {
    const timer = setTimeout(() => setComputedSelection(after.layout), 120);
    return () => clearTimeout(timer);
  }, [after.layout]);
  const beforeOutput = useMemo(
    () => computeLayout(snapshot.input, before.layout),
    [snapshot, before.layout]
  );
  const measured = useMemo(() => {
    const start = performance.now();
    const output = computeLayout(snapshot.input, computedSelection);
    return { output, elapsed: performance.now() - start };
  }, [snapshot, computedSelection]);
  const afterOutput = measured.output;
  const geometry = useMemo(
    () => layoutGeometry(snapshot, afterOutput),
    [snapshot, afterOutput]
  );
  const initialCamera = useMemo(
    () => fitCamera(layoutGeometry(snapshot, beforeOutput)),
    [snapshot, beforeOutput]
  );
  const [camera, setCamera] = useState<LabCamera>(() =>
    fitCamera(layoutGeometry(snapshot, beforeOutput))
  );
  const [active, setActive] = useState<string[]>(() =>
    snapshot.collections.map((item) => item.id)
  );
  const [includeUncollected, setIncludeUncollected] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "공개 snapshot이 메모리에 고정됐습니다. 설정 변경은 로컬 계산입니다."
  );
  const [text, setText] = useState("");
  const [width, setWidth] = useState(360);
  const [viewportLocked, setViewportLocked] = useState(false);
  const [pinPreview, setPinPreview] = useState(false);
  const [mobileSide, setMobileSide] = useState<"a" | "b">("b");
  const [reverseWheel, setReverseWheel] = useState(false);
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const histories = useRef<{
    before: RepresentationHistory;
    after: RepresentationHistory;
  }>({ before: {}, after: {} });
  const [initialHistories, setInitialHistories] = useState(histories.current);
  const panel = useRef<HTMLDivElement>(null);
  const sweep = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => {
    const element = panel.current;
    if (!element || viewportLocked) return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0)
        setWidth(Math.min(2000, Math.max(240, element.clientWidth)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewportLocked]);
  useEffect(
    () => () => {
      if (sweep.current) clearInterval(sweep.current);
    },
    []
  );
  const algorithm = getLayoutAlgorithm(after.layout.algorithm);
  const pending = computedSelection !== after.layout;
  const zoom = (factor: number, axis: "x" | "y" | "both") =>
    setCamera((old) => ({
      ...old,
      spanX: old.spanX * (axis === "y" ? 1 : factor),
      spanY: old.spanY * (axis === "x" ? 1 : factor)
    }));
  const resetHistory = (
    next = { before: {}, after: {} } as typeof histories.current
  ) => {
    histories.current = next;
    setInitialHistories(next);
    setHistoryEpoch((old) => old + 1);
  };
  const stopSweep = () => {
    if (sweep.current) clearInterval(sweep.current);
    sweep.current = null;
    setSweeping(false);
  };
  const runSweep = (axis: "x" | "y" | "both") => {
    stopSweep();
    const start = { ...camera };
    let step = 0;
    setSweeping(true);
    sweep.current = setInterval(() => {
      step++;
      const phase = step <= 24 ? step : 48 - step;
      const factor = 2 ** (-phase / 3);
      setCamera({
        ...start,
        spanX: start.spanX * (axis === "y" ? 1 : factor),
        spanY: start.spanY * (axis === "x" ? 1 : factor)
      });
      if (step >= 48) stopSweep();
    }, 120);
  };
  const preset = (): LabPreset => ({
    formatVersion: "layout-lab-preset/1",
    ...after.layout,
    worldId: snapshot.worldId,
    revision: snapshot.sourceRevision,
    servedRevision: snapshot.servedRevision,
    inputDigest: snapshot.inputDigest,
    representationConfigVersion: REPRESENTATION_CONFIG_VERSION,
    representation: after.representation,
    before,
    camera,
    viewport: { width, height: 430 },
    activeCollectionIds: active,
    includeUncollected,
    history: histories.current,
    snapshot
  });
  const serialize = () => JSON.stringify(preset(), null, 2);
  const restore = async (source: string) => {
    try {
      const saved = await parseLabPreset(source);
      stopSweep();
      setSnapshot(freezeSnapshot(saved.snapshot));
      setBefore(saved.before);
      const layout = {
        algorithm: saved.algorithm,
        algorithmVersion: saved.algorithmVersion,
        parameters: saved.parameters,
        seed: saved.seed
      };
      setAfter({ layout, representation: saved.representation });
      setComputedSelection(layout);
      parameterSets.current = { [layout.algorithm]: layout };
      setCamera(saved.camera);
      setWidth(saved.viewport.width);
      setViewportLocked(true);
      setActive(saved.activeCollectionIds);
      setIncludeUncollected(saved.includeUncollected);
      setSelected(null);
      resetHistory(saved.history);
      setMessage(
        `복원 완료: ${saved.worldId} revision ${saved.revision} · snapshot / camera / A·B / hysteresis`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "설정을 복원할 수 없습니다."
      );
    }
  };
  const chooseAlgorithm = (id: string) => {
    parameterSets.current[after.layout.algorithm] = after.layout;
    const layout = parameterSets.current[id] ?? defaultLayoutSelection(id);
    setAfter((old) => ({ ...old, layout }));
    resetHistory({ before: histories.current.before, after: {} });
  };
  const updateLayout = (key: string, value: string | number) =>
    setAfter((old) => ({
      ...old,
      layout: {
        ...old.layout,
        parameters: { ...old.layout.parameters, [key]: value }
      }
    }));
  const selectedEvent = snapshot.events.find((event) => event.id === selected);
  const focus = (id: string) => {
    setSelected(id);
    const item = geometry.find((entry) => entry.id === id);
    if (item) setCamera(fitCamera([item]));
    else setMessage("이 Event는 선택한 시간축에 미배치 상태입니다.");
  };
  const changed = afterOutput.shapes.filter(
    (shape, i) =>
      JSON.stringify(shape) !== JSON.stringify(beforeOutput.shapes[i])
  ).length;
  const exportPreset = () => {
    const body = serialize();
    setText(body);
    const url = URL.createObjectURL(
      new Blob([body], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `moirai-layout-${snapshot.worldId}-r${snapshot.sourceRevision}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Preset JSON과 immutable snapshot을 내보냈습니다.");
  };
  return (
    <main className="layout-lab">
      <header>
        <p className="lab-eyebrow">MOIRAI · RESEARCH</p>
        <h1>Composite & Layout Lab</h1>
        <p>
          {snapshot.worldTitle} · source {snapshot.sourceRevision} / served{" "}
          {snapshot.servedRevision} · {snapshot.events.length} Events
        </p>
        <p className="lab-meta">
          World {snapshot.worldId}
          <br />
          Input {snapshot.inputDigest.slice(0, 16)} ·{" "}
          {REPRESENTATION_CONFIG_VERSION}
        </p>
        <nav>
          <a href="/labs/layout?demo=1">Synthetic fixture</a>
          <a href="/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc">
            실제 역사 읽기
          </a>
          <a href={`/graph/v5?world=${encodeURIComponent(snapshot.worldId)}`}>
            운영 Graph
          </a>
        </nav>
      </header>
      <p role="status" className="lab-status">
        {message}
      </p>
      <div className="lab-toolbar">
        <button
          disabled={pending}
          onClick={() => {
            setBefore(structuredClone(after));
            resetHistory({
              before: structuredClone(histories.current.after),
              after: histories.current.after
            });
          }}
        >
          B → A 고정
        </button>
        <button
          onClick={() => {
            const value = structuredClone(before);
            setAfter(value);
            setComputedSelection(value.layout);
            resetHistory({
              before: histories.current.before,
              after: structuredClone(histories.current.before)
            });
          }}
        >
          B를 A로 복원
        </button>
        <button
          onClick={() => {
            setAfter(initialCandidate());
            resetHistory({ before: histories.current.before, after: {} });
          }}
        >
          B 기본값
        </button>
        <button
          onClick={() => {
            stopSweep();
            setCamera(initialCamera);
          }}
        >
          전체 보기
        </button>
      </div>
      <details open className="lab-controls">
        <summary>Camera · 같은 입력 / 같은 camera / 같은 Collection</summary>
        <div className="lab-toolbar">
          {(["both", "x", "y"] as const).map((axis) => (
            <span key={axis}>
              <button
                aria-label={`${axis} zoom in`}
                onClick={() => zoom(0.7, axis)}
              >
                {axis === "both" ? "XY" : axis.toUpperCase()} ＋
              </button>
              <button
                aria-label={`${axis} zoom out`}
                onClick={() => zoom(1 / 0.7, axis)}
              >
                －
              </button>
            </span>
          ))}
        </div>
        {(["x", "y"] as const).map((axis) => {
          const key = axis === "x" ? "spanX" : "spanY";
          const level = Math.log2(initialCamera[key] / camera[key]);
          return (
            <label className="lab-control" key={axis}>
              <span>
                {axis.toUpperCase()} zoom {level.toFixed(2)}
              </span>
              <input
                aria-label={`${axis.toUpperCase()} zoom`}
                type="range"
                min={-4}
                max={16}
                step={0.05}
                value={Math.max(-4, Math.min(16, level))}
                onChange={(e) =>
                  setCamera((old) => ({
                    ...old,
                    [key]: initialCamera[key] / 2 ** Number(e.target.value)
                  }))
                }
              />
            </label>
          );
        })}
        <div className="lab-toolbar">
          <button onClick={() => runSweep("both")}>XY 왕복 sweep</button>
          <button onClick={() => runSweep("x")}>X 왕복</button>
          <button onClick={() => runSweep("y")}>Y 왕복</button>
          {sweeping && <button onClick={stopSweep}>중지</button>}
          <label>
            <input
              type="checkbox"
              checked={reverseWheel}
              onChange={(e) => setReverseWheel(e.target.checked)}
            />
            휠 줌 방향 반전
          </label>
        </div>
        <small>
          두 그림에서 drag하면 함께 이동합니다. 휠: XY · Shift: Y · Alt: X.
          왕복은 현재 camera에서 8단계 확대 후 돌아옵니다.
        </small>
      </details>
      <label className="lab-check">
        <input
          type="checkbox"
          checked={pinPreview}
          onChange={(e) => setPinPreview(e.target.checked)}
        />
        조절 중 비교 화면 고정 (모바일 A/B 전환)
      </label>
      <div
        className={`lab-comparison${pinPreview ? ` lab-pinned lab-side-${mobileSide}` : ""}`}
      >
        {pinPreview && (
          <div className="lab-mobile-tabs">
            <button
              aria-pressed={mobileSide === "a"}
              onClick={() => setMobileSide("a")}
            >
              A 보기
            </button>
            <button
              aria-pressed={mobileSide === "b"}
              onClick={() => setMobileSide("b")}
            >
              B 보기
            </button>
            <button onClick={() => setPinPreview(false)}>고정 해제</button>
          </div>
        )}
        <div ref={panel}>
          <LabScene
            name="A · before"
            snapshot={snapshot}
            output={beforeOutput}
            camera={camera}
            width={width}
            active={active}
            includeUncollected={includeUncollected}
            config={before.representation}
            initialHistory={initialHistories.before}
            historyEpoch={historyEpoch}
            onHistory={(value) => {
              histories.current.before = value;
            }}
            onCamera={setCamera}
            onSelect={setSelected}
            reverseWheel={reverseWheel}
          />
        </div>
        <LabScene
          name="B · candidate"
          snapshot={snapshot}
          output={afterOutput}
          camera={camera}
          width={width}
          active={active}
          includeUncollected={includeUncollected}
          config={after.representation}
          initialHistory={initialHistories.after}
          historyEpoch={historyEpoch}
          onHistory={(value) => {
            histories.current.after = value;
          }}
          onCamera={setCamera}
          onSelect={setSelected}
          reverseWheel={reverseWheel}
        />
      </div>
      <p className="lab-meta">
        Representation viewport {width.toFixed(0)} × 430{" "}
        {viewportLocked ? "· saved size" : "· current screen"}{" "}
        {viewportLocked && (
          <button onClick={() => setViewportLocked(false)}>
            현재 화면 크기 사용
          </button>
        )}
      </p>
      <p className="lab-meta" data-testid="lab-computation">
        {pending
          ? "계산 대기…"
          : mounted
            ? `${measured.elapsed.toFixed(1)}ms local compute`
            : "local compute"}{" "}
        · changed geometry {changed} · unplaced{" "}
        {afterOutput.unplaced_event_ids.length} · {after.layout.algorithm}@
        {after.layout.algorithmVersion} · seed null
      </p>
      <details className="lab-controls" open>
        <summary>B layout algorithm · parameters</summary>
        <label className="lab-control">
          <span>Algorithm</span>
          <select
            aria-label="Layout algorithm"
            value={algorithm.id}
            onChange={(e) => chooseAlgorithm(e.target.value)}
          >
            {layoutAlgorithms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <p>{algorithm.description}</p>
        {algorithm.parameters.map((field) => (
          <label key={`${algorithm.id}:${field.key}`} className="lab-control">
            <span>
              {field.label}
              <small>{field.description}</small>
            </span>
            {field.kind === "select" ? (
              <select
                aria-label={field.label}
                value={after.layout.parameters[field.key]}
                onChange={(e) => updateLayout(field.key, e.target.value)}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  aria-label={field.label}
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={after.layout.parameters[field.key]}
                  onChange={(e) =>
                    updateLayout(field.key, Number(e.target.value))
                  }
                />
                <input
                  aria-label={`${field.label} value`}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={after.layout.parameters[field.key]}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    if (
                      Number.isFinite(value) &&
                      value >= field.min &&
                      value <= field.max &&
                      (field.step !== 1 || Number.isInteger(value))
                    )
                      updateLayout(field.key, value);
                  }}
                />
              </>
            )}
          </label>
        ))}
        <p className="lab-note">
          Force의 attraction / repulsion / maxStep / iteration은 서로
          결합됩니다. 같은 input의 Y와 authored contains는 모든 candidate에서
          보존합니다. Canonical 설정 승격과 backfill은 별도 채택 작업입니다.
        </p>
      </details>
      <details className="lab-controls">
        <summary>
          B Composite representation · thresholds / fade / density
        </summary>
        <p>
          Production 값을 출발점으로 한 연구 정책입니다. density는 안정된 ID
          순위, 큰 hull 억제는 bounds coverage 근사값입니다. HUD·production
          label 배치 전체를 복제하지 않습니다.
        </p>
        {REPRESENTATION_PARAMETERS.map((field) => (
          <label key={field.key} className="lab-control">
            <span>
              {field.label}
              <small>{field.description}</small>
            </span>
            {field.type === "boolean" ? (
              <input
                aria-label={field.label}
                type="checkbox"
                checked={Boolean(after.representation[field.key])}
                onChange={(e) =>
                  setAfter((old) => ({
                    ...old,
                    representation: {
                      ...old.representation,
                      [field.key]: e.target.checked
                    }
                  }))
                }
              />
            ) : (
              <>
                <input
                  aria-label={field.label}
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(after.representation[field.key])}
                  onChange={(e) => {
                    try {
                      const representation = validateRepresentationConfig({
                        ...after.representation,
                        [field.key]: Number(e.target.value)
                      });
                      setAfter((old) => ({ ...old, representation }));
                    } catch {
                      setMessage(
                        "Density 순서는 ordinary ≤ small < hidden이어야 합니다. 상위 threshold를 먼저 조절하세요."
                      );
                    }
                  }}
                />
                <output>{String(after.representation[field.key])}</output>
              </>
            )}
          </label>
        ))}
      </details>
      <details className="lab-controls">
        <summary>
          Collection visibility · {active.length}/{snapshot.collections.length}
        </summary>
        <div className="lab-toolbar">
          <button
            onClick={() => {
              setActive(snapshot.collections.map((item) => item.id));
              setIncludeUncollected(true);
            }}
          >
            모두 켜기
          </button>
          <button
            onClick={() => {
              setActive([]);
              setIncludeUncollected(false);
            }}
          >
            모두 끄기
          </button>
        </div>
        {snapshot.collections.map((collection) => (
          <label className="lab-check" key={collection.id}>
            <input
              type="checkbox"
              checked={active.includes(collection.id)}
              onChange={(e) =>
                setActive((old) =>
                  e.target.checked
                    ? [...old, collection.id]
                    : old.filter((id) => id !== collection.id)
                )
              }
            />
            {collection.title} ({collection.eventIds.length})
          </label>
        ))}
        <label className="lab-check">
          <input
            type="checkbox"
            checked={includeUncollected}
            onChange={(e) => setIncludeUncollected(e.target.checked)}
          />
          membership 없는 Event
        </label>
      </details>
      <details className="lab-controls">
        <summary>Event / Composite 관찰</summary>
        <select
          aria-label="Focus Event"
          value={selected ?? ""}
          onChange={(e) => focus(e.target.value)}
        >
          <option value="">관찰할 Event 선택…</option>
          {snapshot.events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.childIds.length ? "◇ " : "• "}
              {event.title}
            </option>
          ))}
        </select>
        {selectedEvent && (
          <p>
            {selectedEvent.title}
            <br />
            <code>{selectedEvent.id}</code>
            <br />
            authored children {selectedEvent.childIds.length} · Collections{" "}
            {selectedEvent.collectionIds.length}
            <br />
            <button onClick={() => focus(selectedEvent.id)}>
              이 Event로 camera 이동
            </button>
          </p>
        )}
      </details>
      <details className="lab-controls">
        <summary>Preset save / load / export · immutable snapshot 포함</summary>
        <div className="lab-toolbar">
          <button
            disabled={pending}
            onClick={() => {
              try {
                localStorage.setItem(STORAGE, serialize());
                setMessage(
                  "이 브라우저에 snapshot·A/B·camera·history를 저장했습니다."
                );
              } catch {
                setMessage(
                  "로컬 저장 용량이 부족합니다. JSON export를 사용하세요."
                );
              }
            }}
          >
            로컬 저장
          </button>
          <button
            onClick={() => {
              const value = localStorage.getItem(STORAGE);
              if (value) void restore(value);
              else setMessage("저장된 preset이 없습니다.");
            }}
          >
            로컬 복원
          </button>
          <button disabled={pending} onClick={exportPreset}>
            JSON export
          </button>
          <button disabled={pending} onClick={() => setText(serialize())}>
            JSON 보기
          </button>
        </div>
        <label>
          JSON 파일 import
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(restore);
            }}
          />
        </label>
        <textarea
          aria-label="Preset JSON"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Preset JSON을 붙여넣어 같은 실험을 복원"
        />
        <button onClick={() => void restore(text)}>JSON 복원</button>
      </details>
      <footer>
        연구 결과만 저장합니다. Snapshot은 read-only이며 algorithm 조절에
        publication 요청·backfill·canonical 쓰기는 발생하지 않습니다.
      </footer>
    </main>
  );
}
