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
  REPRESENTATION_GROUPS,
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
import {
  LAYOUT_COPY,
  REPRESENTATION_COPY,
  labDisplayTitle,
  labRestoreErrorMessage
} from "./copy";
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
  const [camera, setCamera] = useState<LabCamera>(() =>
    fitCamera(layoutGeometry(snapshot, beforeOutput))
  );
  const [active, setActive] = useState<string[]>(() =>
    snapshot.collections.map((item) => item.id)
  );
  const [includeUncollected, setIncludeUncollected] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState(
    "같은 사건 자료를 고정해 두었습니다. 값을 바꾸면 이 기기에서 새 모습을 계산합니다."
  );
  const [text, setText] = useState("");
  const [width, setWidth] = useState(360);
  const [height, setHeight] = useState(320);
  const [viewportLocked, setViewportLocked] = useState(false);
  const [mobileSide, setMobileSide] = useState<"a" | "b">("b");
  const [historyEpoch, setHistoryEpoch] = useState(0);
  const histories = useRef<{
    before: RepresentationHistory;
    after: RepresentationHistory;
  }>({ before: {}, after: {} });
  const [initialHistories, setInitialHistories] = useState(histories.current);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = panel.current;
    if (!element || viewportLocked) return;
    const viewport = element.querySelector<HTMLElement>(
      `[data-lab-side="${mobileSide}"] .lab-map-viewport`
    );
    if (!viewport) return;
    const measure = () => {
      if (element.clientWidth > 0 && viewport.clientHeight > 0) {
        setWidth(Math.min(2000, Math.max(240, element.clientWidth)));
        setHeight(viewport.clientHeight);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(viewport);
    measure();
    return () => observer.disconnect();
  }, [viewportLocked, mobileSide]);
  const algorithm = getLayoutAlgorithm(after.layout.algorithm);
  const algorithmCopy = LAYOUT_COPY[algorithm.id]!;
  const displayTitle = (id: string, title: string) =>
    labDisplayTitle(snapshot.worldId, id, title);
  const pending = computedSelection !== after.layout;
  const resetHistory = (
    next = { before: {}, after: {} } as typeof histories.current
  ) => {
    histories.current = next;
    setInitialHistories(next);
    setHistoryEpoch((old) => old + 1);
  };
  const preset = (): LabPreset => ({
    formatVersion: "layout-lab-preset/2",
    ...after.layout,
    worldId: snapshot.worldId,
    revision: snapshot.sourceRevision,
    servedRevision: snapshot.servedRevision,
    inputDigest: snapshot.inputDigest,
    representationConfigVersion: REPRESENTATION_CONFIG_VERSION,
    representation: after.representation,
    before,
    camera,
    viewport: { width, height },
    activeCollectionIds: active,
    includeUncollected,
    history: histories.current,
    snapshot
  });
  const serialize = () => JSON.stringify(preset(), null, 2);
  const restore = async (source: string) => {
    try {
      const saved = await parseLabPreset(source);
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
      setHeight(saved.viewport.height);
      setViewportLocked(true);
      setActive(saved.activeCollectionIds);
      setIncludeUncollected(saved.includeUncollected);
      setSelected(null);
      resetHistory(saved.history);
      setMessage(
        `저장한 실험을 다시 열었습니다. 자료 버전 ${saved.revision}의 사건·화면 위치·A/B 설정·전환 기록을 복원했습니다.`
      );
    } catch (error) {
      setMessage(labRestoreErrorMessage(error));
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
    setMessage(
      "실험 설정과 사건 자료를 파일로 내보냈습니다. 같은 파일로 나중에 다시 비교할 수 있습니다."
    );
  };
  return (
    <main className="layout-lab">
      <header>
        <p className="lab-eyebrow">모이라이 · 연구용</p>
        <h1>사건 표현·배치 실험실</h1>
        <p>
          {displayTitle(snapshot.worldId, snapshot.worldTitle)} · 사건{" "}
          {snapshot.events.length}개
        </p>
      </header>
      <section
        className={`lab-comparison lab-side-${mobileSide}`}
        aria-label="같은 위치의 두 화면 비교"
        data-testid="lab-comparison"
        data-camera={JSON.stringify(camera)}
      >
        <div className="lab-mobile-tabs" role="group" aria-label="비교할 화면">
          <button
            data-testid="lab-show-a"
            aria-pressed={mobileSide === "a"}
            onClick={() => setMobileSide("a")}
          >
            기준 A
          </button>
          <button
            data-testid="lab-show-b"
            aria-pressed={mobileSide === "b"}
            onClick={() => setMobileSide("b")}
          >
            바꾼 B
          </button>
        </div>
        <div className="lab-scenes" ref={panel}>
          <div data-lab-side="a">
            <LabScene
              name="A · 기준 화면"
              snapshot={snapshot}
              output={beforeOutput}
              camera={camera}
              width={width}
              height={height}
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
              interactive={mobileSide === "a"}
            />
          </div>
          <div data-lab-side="b">
            <LabScene
              name="B · 바꾼 화면"
              snapshot={snapshot}
              output={afterOutput}
              camera={camera}
              width={width}
              height={height}
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
              interactive={mobileSide === "b"}
            />
          </div>
        </div>
        <p className="lab-gesture-help">
          한 손가락으로 이동 · 두 손가락으로 확대·축소
          <br />
          가로로 벌리면 가로, 세로로 벌리면 시간 방향이 바뀝니다.
        </p>
      </section>
      <p role="status" className="lab-status">
        {message}
      </p>
      <details className="lab-controls" data-testid="lab-section-comparison">
        <summary>비교 기준과 B 설정</summary>
        <p>
          A는 비교 기준, B는 값을 바꿔 보는 화면입니다. 두 화면은 같은 사건
          자료와 같은 위치를 사용합니다. 현재 B를 A로 저장한 뒤 값을 하나씩 바꿔
          보세요.
        </p>
        <div className="lab-toolbar">
          <button
            data-testid="lab-use-b-as-a"
            disabled={pending}
            onClick={() => {
              setBefore(structuredClone(after));
              resetHistory({
                before: structuredClone(histories.current.after),
                after: histories.current.after
              });
            }}
          >
            지금 B를 비교 기준 A로 저장
          </button>
          <button
            data-testid="lab-reset-b-to-a"
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
            B를 기준 A와 같게
          </button>
          <button
            data-testid="lab-reset-b-defaults"
            onClick={() => {
              setAfter(initialCandidate());
              resetHistory({ before: histories.current.before, after: {} });
            }}
          >
            B 설정 처음으로
          </button>
        </div>
      </details>
      <p className="lab-meta">
        비교 그림 크기 {width.toFixed(0)} × {height.toFixed(0)}픽셀{" "}
        {viewportLocked
          ? "· 저장할 때의 크기 유지"
          : "· 현재 휴대폰 화면에 맞춤"}
        {viewportLocked && (
          <button onClick={() => setViewportLocked(false)}>
            현재 화면 크기 사용
          </button>
        )}
      </p>
      <p className="lab-meta" data-testid="lab-computation">
        {pending ? "새 배치를 계산하는 중…" : "비교할 준비가 되었습니다."} ·
        배치가 달라진 사건 {changed}개 · 시간축에 놓이지 않은 사건{" "}
        {afterOutput.unplaced_event_ids.length}개
      </p>
      <details className="lab-controls" data-testid="lab-section-layout">
        <summary>B의 사건 배치 방식</summary>
        <label className="lab-control">
          <span>배치 방식</span>
          <select
            data-testid="lab-algorithm"
            aria-label="사건 배치 방식"
            value={algorithm.id}
            onChange={(e) => chooseAlgorithm(e.target.value)}
          >
            {layoutAlgorithms.map((item) => (
              <option key={item.id} value={item.id}>
                {LAYOUT_COPY[item.id]!.title}
              </option>
            ))}
          </select>
        </label>
        <p>{algorithmCopy.description}</p>
        {algorithm.parameters.map((field) => {
          const copy = algorithmCopy.parameters[field.key]!;
          return (
            <label key={`${algorithm.id}:${field.key}`} className="lab-control">
              <span>
                {copy.label}
                <small>{copy.description}</small>
              </span>
              {field.kind === "select" ? (
                <select
                  data-testid={`lab-layout-parameter-${field.key}`}
                  aria-label={copy.label}
                  value={after.layout.parameters[field.key]}
                  onChange={(e) => updateLayout(field.key, e.target.value)}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {copy.options?.[option.value] ?? option.value}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    data-testid={`lab-layout-range-${field.key}`}
                    aria-label={copy.label}
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
                    data-testid={`lab-layout-parameter-${field.key}`}
                    aria-label={`${copy.label} 직접 입력`}
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
          );
        })}
        <p className="lab-note">
          벌리는 힘·모으는 힘·이동 거리·반복 횟수는 함께 작용합니다. 먼저 한
          값씩 바꾸며 비교해 보세요. 어떤 방식을 골라도 사건의 시간과 구성
          관계는 유지됩니다.
        </p>
      </details>
      <details
        className="lab-controls"
        data-testid="lab-section-representation"
      >
        <summary>B의 컴포짓·사건·이름표 가시성 조절</summary>
        <p>
          영역 → 보통 점 → 작은 점 → 숨김이 언제 바뀌는지 살펴보세요. ‘크기’는
          바뀌는 경계, ‘폭’은 서서히 섞이는 구간, ‘시간’은 변화 속도입니다.
          ‘여유’는 조금 되돌아가도 이전 표시를 유지해 잦은 전환을 줄입니다.
        </p>
        <p>
          사건이 많으면 일정한 식별번호 순서로 점을 줄입니다. 역사적 중요도
          순위가 아닙니다. 큰 묶음의 화면 점유율은 감싸는 사각형으로
          어림잡습니다.
        </p>
        {REPRESENTATION_GROUPS.map((group) => (
          <fieldset className="lab-stage" key={group.title}>
            <legend>{group.title}</legend>
            <p className="lab-note">{group.description}</p>
            {REPRESENTATION_PARAMETERS.filter((field) =>
              group.keys.includes(field.key)
            ).map((field) => {
              const copy = REPRESENTATION_COPY[field.key];
              return (
                <label key={field.key} className="lab-control">
                  <span>
                    {copy.label}
                    <small>{copy.description}</small>
                  </span>
                  {field.type === "boolean" ? (
                    <input
                      data-testid={`lab-representation-${field.key}`}
                      aria-label={copy.label}
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
                        data-testid={`lab-representation-${field.key}`}
                        aria-label={copy.label}
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={Number(after.representation[field.key])}
                        onChange={(e) => {
                          try {
                            const representation = validateRepresentationConfig(
                              {
                                ...after.representation,
                                [field.key]: Number(e.target.value)
                              }
                            );
                            setAfter((old) => ({ ...old, representation }));
                          } catch {
                            setMessage(
                              "순위 기준은 ‘보통 점 기준 ≤ 흐려짐 시작 기준 < 숨김 기준’ 순서여야 합니다. 더 뒤쪽 기준을 먼저 늘려 주세요."
                            );
                          }
                        }}
                      />
                      <output>{String(after.representation[field.key])}</output>
                    </>
                  )}
                </label>
              );
            })}
          </fieldset>
        ))}
      </details>
      <details className="lab-controls" data-testid="lab-section-collections">
        <summary>
          화면에 표시할 사건 모음 · {active.length}/
          {snapshot.collections.length}개 선택
        </summary>
        <p>
          여기서는 볼 사건만 고릅니다. 모음을 켜거나 꺼도 사건의 배치는 다시
          계산하지 않습니다. 같은 사건이 여러 모음에 있어도 한 번만 표시합니다.
        </p>
        <div className="lab-toolbar">
          <button
            data-testid="lab-collections-all"
            onClick={() => {
              setActive(snapshot.collections.map((item) => item.id));
              setIncludeUncollected(true);
            }}
          >
            모두 켜기
          </button>
          <button
            data-testid="lab-collections-none"
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
              data-testid={`lab-collection-${collection.id}`}
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
            {displayTitle(collection.id, collection.title)} (
            {collection.eventIds.length}개)
          </label>
        ))}
        <label className="lab-check">
          <input
            type="checkbox"
            checked={includeUncollected}
            onChange={(e) => setIncludeUncollected(e.target.checked)}
          />
          어떤 사건 모음에도 속하지 않은 사건
        </label>
      </details>
      <details className="lab-controls" data-testid="lab-section-events">
        <summary>자세히 볼 사건 선택</summary>
        <select
          data-testid="lab-focus-event"
          aria-label="자세히 볼 사건"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value || null)}
        >
          <option value="">관찰할 사건을 고르세요…</option>
          {snapshot.events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.childIds.length ? "◇ " : "• "}
              {displayTitle(event.id, event.title)}
            </option>
          ))}
        </select>
        {selectedEvent && (
          <p>
            {displayTitle(selectedEvent.id, selectedEvent.title)}
            <br />
            직접 구성 사건 {selectedEvent.childIds.length}개 · 포함된 사건 모음{" "}
            {selectedEvent.collectionIds.length}개
          </p>
        )}
      </details>
      <details className="lab-controls" data-testid="lab-section-preset">
        <summary>실험 저장·다시 열기</summary>
        <p>
          사건 자료와 A/B 설정, 화면 위치, 확대 정도, 전환 기록을 함께
          저장합니다. 파일을 다시 열면 그때와 같은 조건으로 비교할 수 있습니다.
        </p>
        <div className="lab-toolbar">
          <button
            data-testid="lab-preset-save"
            disabled={pending}
            onClick={() => {
              try {
                localStorage.setItem(STORAGE, serialize());
                setMessage(
                  "이 브라우저에 사건 자료·A/B 설정·화면 위치·전환 기록을 저장했습니다."
                );
              } catch {
                setMessage(
                  "브라우저에 저장할 공간이 부족합니다. ‘파일로 내보내기’를 사용해 주세요."
                );
              }
            }}
          >
            이 기기에 저장
          </button>
          <button
            data-testid="lab-preset-load"
            onClick={() => {
              const value = localStorage.getItem(STORAGE);
              if (value) void restore(value);
              else
                setMessage(
                  "이 브라우저에 저장한 실험이 없습니다. 먼저 저장하거나 파일을 열어 주세요."
                );
            }}
          >
            이 기기의 저장 내용 열기
          </button>
          <button
            data-testid="lab-preset-export"
            disabled={pending}
            onClick={exportPreset}
          >
            파일로 내보내기
          </button>
          <button
            data-testid="lab-preset-show"
            disabled={pending}
            onClick={() => setText(serialize())}
          >
            저장 내용 보기
          </button>
        </div>
        <label>
          저장한 파일 열기
          <input
            data-testid="lab-preset-import"
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void file.text().then(restore);
            }}
          />
        </label>
        <textarea
          data-testid="lab-preset-json"
          aria-label="저장 내용 붙여넣기"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="‘저장 내용 보기’로 복사한 내용을 여기에 붙여넣으세요. 직접 수정할 필요는 없습니다."
        />
        <button
          data-testid="lab-preset-restore"
          onClick={() => void restore(text)}
        >
          붙여넣은 내용으로 다시 열기
        </button>
      </details>
      <details className="lab-controls">
        <summary>실험 정보 자세히 · 재현 확인용</summary>
        <p className="lab-meta">
          사건 세계 식별번호: {snapshot.worldId}
          <br />
          자료 버전: {snapshot.sourceRevision} · 공개 중인 버전:{" "}
          {snapshot.servedRevision}
          <br />
          자료 확인값: {snapshot.inputDigest}
          <br />
          표시 규칙 버전: {REPRESENTATION_CONFIG_VERSION}
          <br />
          배치 방식 식별자: {after.layout.algorithm} · 버전:{" "}
          {after.layout.algorithmVersion}
          <br />
          무작위 시작값: 사용하지 않음
          <br />
          계산 시간:{" "}
          {mounted ? `${measured.elapsed.toFixed(1)}밀리초` : "측정 중"}
          {selectedEvent && (
            <>
              <br />
              선택한 사건 식별번호: {selectedEvent.id}
            </>
          )}
        </p>
      </details>
      <details className="lab-controls">
        <summary>사용법·실제 자료로 바꾸기</summary>
        <p>
          지도 안을 쓸면 지도가 움직이고, 설정 영역을 쓸면 페이지가 움직입니다.
          두 손가락을 오므리면 축소합니다. 같은 위치에서 A와 B를 번갈아
          확인하세요.
        </p>
        <p>
          ‘묶음 사건’은 여러 구성 사건으로 이루어진 사건입니다. ‘사건 모음’은
          함께 보고 싶은 사건의 선택 목록이며 같은 사건이 여러 모음에 들어갈 수
          있습니다.
        </p>
        <nav>
          <a href="/labs/layout?demo=1">연습 자료로 실험하기</a>
          <a href="/labs/layout?world=01a107fb-4018-7fcb-8390-836a40fa91cc">
            실제 역사 읽기
          </a>
          <a href={`/graph/v5?world=${encodeURIComponent(snapshot.worldId)}`}>
            실제 읽기 화면
          </a>
        </nav>
      </details>
      <footer>
        여기서 바꾸는 것은 연구용 화면입니다. 실제 역사 자료나 공개 중인 배치는
        바뀌지 않습니다. 결과를 실제 읽기 화면에 적용하는 일은 후보를 선택한 뒤
        별도로 진행합니다.
      </footer>
    </main>
  );
}
