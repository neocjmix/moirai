"use client";

import { useState } from "react";
import { useRendererDiagnostics } from "./diagnostics";
import {
  setRendererPreferences,
  useRendererPreferences,
  type RendererId
} from "./preferences";
import styles from "./settings.module.css";

const labels = {
  "custom-webgl2": "Current WebGL2",
  pixi: "PixiJS 8",
  three: "Three.js"
};

export function RendererSettings({ locale = "ko" }: { locale?: string }) {
  const ko = locale === "ko";
  const preferences = useRendererPreferences();
  const diagnostics = useRendererDiagnostics();
  const baseline = preferences.renderer === "custom-webgl2";
  return (
    <section
      className={styles.settings}
      aria-label={ko ? "렌더러 비교" : "Renderer comparison"}
    >
      <label>
        <span>{ko ? "렌더링 엔진" : "Rendering engine"}</span>
        <select
          data-testid="renderer-select"
          value={preferences.renderer}
          onChange={(event) =>
            setRendererPreferences({
              renderer: event.target.value as RendererId
            })
          }
        >
          {Object.entries(labels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p>
        {ko
          ? "같은 World·카메라·선택을 유지합니다. 이 기기에 선택이 저장됩니다."
          : "Keeps the same World, camera and selection. Saved on this device."}
      </p>
      <label>
        <span>{ko ? "영역 가장자리" : "Hull edges"}</span>
        <select
          data-testid="edge-select"
          disabled={baseline}
          value={baseline ? "native" : preferences.edge}
          onChange={(event) =>
            setRendererPreferences({
              edge: event.target.value === "hard" ? "hard" : "native"
            })
          }
        >
          <option value="native">
            {baseline
              ? ko
                ? "기존 inset feather"
                : "Baseline inset feather"
              : ko
                ? "GPU 부드러운 경계"
                : "GPU soft edge"}
          </option>
          {!baseline ? (
            <option value="hard">
              {ko ? "선명한 경계와 비교" : "Compare hard edge"}
            </option>
          ) : null}
        </select>
      </label>
      <p>
        {baseline
          ? ko
            ? "안료: Spectral 6-band 근사 · 점: instancing"
            : "Pigment: spectral 6-band approximation · points: instanced"
          : ko
            ? "안료: 광학 밀도 RGB 근사 · 점: instancing · 경계: GPU Gaussian"
            : "Pigment: RGB optical-density approximation · points: instanced · edges: GPU Gaussian"}
      </p>
      {!baseline ? (
        <p>
          {ko
            ? "색이 겹쳐도 같은 안료가 바로 검어지지 않도록 농도를 정규화합니다. 일부 혼색은 기존 Spectral과 다릅니다."
            : "Normalized pigment concentration avoids immediate blackening. Some mixtures differ from the spectral baseline."}
        </p>
      ) : null}
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          data-testid="renderer-diagnostics-toggle"
          checked={preferences.diagnostics}
          onChange={(event) =>
            setRendererPreferences({ diagnostics: event.target.checked })
          }
        />
        <span>{ko ? "가벼운 실행 진단 표시" : "Show runtime diagnostics"}</span>
      </label>
      {diagnostics?.fallback ? (
        <p role="status">
          {ko
            ? "지원 실패로 안전한 렌더러로 복귀했습니다: "
            : "Using a fallback renderer: "}
          {diagnostics.renderer === "svg"
            ? "SVG"
            : labels[diagnostics.renderer]}
        </p>
      ) : null}
      {preferences.diagnostics && diagnostics ? (
        <output
          data-testid="renderer-diagnostics"
          className={styles.diagnostics}
        >
          {diagnostics.renderer} · {diagnostics.state}
          <br />
          CPU {diagnostics.cpuMs?.toFixed(1) ?? "—"} ms ·{" "}
          {ko ? "연속 draw 간격" : "active draw interval"}{" "}
          {diagnostics.frameIntervalMs?.toFixed(1) ?? "—"} ms
          <br />
          Hull {diagnostics.hullCount ?? "—"} · Point{" "}
          {diagnostics.pointCount ?? "—"} · Draw {diagnostics.drawCalls ?? "—"}
          <br />
          {ko ? "누적 mesh / upload" : "Cumulative mesh / upload"}:{" "}
          {diagnostics.meshBuilds ?? "—"} / {diagnostics.bufferUploads ?? "—"}
          <br />
          {ko ? "추정 관리 GPU 자원" : "Estimated owned GPU resources"}:{" "}
          {diagnostics.resourceCount ?? "—"} ·{" "}
          {diagnostics.resourceBytes === undefined
            ? "—"
            : `${(diagnostics.resourceBytes / 1048576).toFixed(1)} MiB`}
          <br />
          {ko
            ? "GPU 실행 시간·전체 프레임 비용·VRAM 측정이 아닙니다."
            : "Not GPU timing, whole-frame cost or measured VRAM."}
        </output>
      ) : null}
    </section>
  );
}

export function RendererControls({ locale = "ko" }: { locale?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={styles.controls}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        data-testid="renderer-controls-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {locale === "ko"
          ? open
            ? "렌더러 비교 닫기"
            : "렌더러 비교"
          : open
            ? "Close renderer comparison"
            : "Compare renderers"}
      </button>
      {open ? (
        <div className={styles.panel}>
          <RendererSettings locale={locale} />
        </div>
      ) : null}
    </div>
  );
}
