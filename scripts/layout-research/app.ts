import {
  defaults,
  type Candidate,
  type Parameters,
  type ResearchResult
} from "./engine.js";
import { displacement, type metrics } from "./metrics.js";
import {
  fitCamera,
  project,
  type LabGeometry
} from "../../apps/atropos-web/src/labs/layout/geometry.js";
import {
  createLabGesture,
  addLabPointer,
  moveLabPointer,
  removeLabPointer,
  viewToCamera,
  type LabViewportSize
} from "../../apps/atropos-web/src/labs/layout/gestures.js";
import { chronologyYearToWorldY } from "../../packages/graph-presentation/src/urdr-chart-plane.js";
import {
  snapshotDigestPayload,
  type LabSnapshot
} from "../../apps/atropos-web/src/labs/layout/types.js";
import type { LabCamera } from "../../apps/atropos-web/src/labs/layout/preset.js";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const select = (id: string) => $<HTMLSelectElement>(id),
  check = (id: string) => $<HTMLInputElement>(id).checked;
const titles: Record<Candidate, string> = {
  "legacy-force": "제품 X force · 기준선",
  "deterministic-slots": "시간 슬롯 · 충돌 기준선",
  "relation-only": "시간 제약 + Composite / 사건 관계",
  "global-incidence": "전역 incidence · 데이터 기반 중심",
  "local-incidence": "시간 국소 incidence · 데이터 기반 중심"
};
const colors = [
  "#d75b22",
  "#167e75",
  "#6e58bd",
  "#b17b16",
  "#3f7fc4",
  "#ae518e",
  "#65717d"
];
interface Pane {
  result: ResearchResult;
  geometry: LabGeometry[];
  quality: ReturnType<typeof metrics>;
  geometryMs: number;
  renderMs?: number;
}
let snapshot: LabSnapshot;
let primary: string[] = [];
let active = new Set<string>();
let camera: LabCamera = { x: 0, y: 0, spanX: 1000, spanY: 1000 };
const panes: (Pane | null)[] = [null, null];
let generation = 0,
  busy = false,
  selected = "",
  updated = false;
let params = { ...defaults };
let frame = 0;
const workers = [0, 1].map(
  () => new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
);
const size: LabViewportSize = { width: 600, height: 560 };
const candidates = Object.keys(titles) as Candidate[];
for (const id of ["left", "right"])
  for (const c of candidates) {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = titles[c];
    select(id).append(option);
  }
select("left").value = "legacy-force";
select("right").value = "local-incidence";
const definitions: [keyof Parameters, string, number, number, number][] = [
  ["iterations", "반복 수", 0, 256, 1],
  ["windowYears", "시간 창 (년)", 4, 160, 1],
  ["spacing", "점 간격 (world X)", 8, 80, 1],
  ["cohesion", "소속 응집", 0, 2, 0.05],
  ["relation", "계층·관계 강성", 0, 2, 0.05],
  ["smoothing", "중심 시간 연속성", 0, 1, 0.02],
  ["stability", "이전 좌표 강성", 0, 30, 0.5]
];
for (const [key, label, min, max, step] of definitions) {
  const l = document.createElement("label");
  l.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.id = "param-" + key;
  input.value = String(params[key]);
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  l.append(input);
  $("parameters").append(l);
}
const readParams = () => {
  const next = { ...params };
  for (const [key, , min, max] of definitions) {
    const v = Number($<HTMLInputElement>("param-" + key).value);
    if (!Number.isFinite(v) || v < min || v > max)
      throw Error("파라미터 범위를 확인하세요.");
    next[key] = v;
  }
  if (!Number.isInteger(next.iterations))
    throw Error("반복 수는 정수여야 합니다.");
  return next;
};
const setStatus = (text: string) => {
  $("status").textContent = text;
};
const controlsBusy = (value: boolean) => {
  for (const id of ["run", "dataset", "left", "right", "increment", "restore"])
    $<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>(id).disabled =
      value;
};
const fail = (error: unknown) => {
  busy = false;
  controlsBusy(false);
  setStatus(
    "오류: " + (error instanceof Error ? error.message : String(error))
  );
};
async function loadData(name: string) {
  busy = true;
  controlsBusy(true);
  if (
    !["changing", "independent", "dense-shared", "history-r56"].includes(name)
  )
    throw Error("지원하지 않는 데이터입니다.");
  const response = await fetch(
    "data/" +
      name +
      (updated && name === "changing" ? "-updated" : "") +
      ".json"
  );
  if (!response.ok) throw Error("데이터를 가져올 수 없습니다.");
  const next = (await response.json()) as LabSnapshot;
  const hash = [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(snapshotDigestPayload(next))
      )
    )
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hash !== next.inputDigest)
    throw Error("Snapshot digest가 일치하지 않습니다.");
  snapshot = next;
  primary =
    name === "history-r56"
      ? snapshot.collections
          .filter((c) => ["한국사", "일본사", "중국사"].includes(c.title))
          .map((c) => c.id)
      : ["context-0", "context-1", "context-2", "context-3"];
  active = new Set(snapshot.collections.map((c) => c.id));
  $("collections").replaceChildren();
  snapshot.collections.forEach((c, i) => {
    const l = document.createElement("label"),
      input = document.createElement("input"),
      swatch = document.createElement("i");
    input.type = "checkbox";
    input.checked = true;
    input.dataset.collection = c.id;
    swatch.className = "swatch";
    swatch.style.background = colors[i % colors.length]!;
    l.append(
      input,
      swatch,
      document.createTextNode(`${c.title} (${c.eventIds.length})`)
    );
    input.onchange = () => {
      if (input.checked) active.add(c.id);
      else active.delete(c.id);
      scheduleDraw();
    };
    $("collections").append(l);
  });
  selected = "";
  $<HTMLInputElement>("search").value = "";
  $("selection").textContent =
    "검은 테두리는 여러 주 맥락이 공유하는 단일 Event입니다. 점을 누르거나 Event 찾기를 사용하세요.";
  updateSearch();
  busy = false;
  controlsBusy(false);
}
function updateSearch() {
  const query = $<HTMLInputElement>("search").value.toLowerCase();
  const el = select("event");
  el.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Event를 선택하세요";
  el.append(empty);
  for (const e of snapshot?.events ?? []) {
    if (
      query &&
      !e.title.toLowerCase().includes(query) &&
      !e.id.includes(query)
    )
      continue;
    const o = document.createElement("option");
    o.value = e.id;
    o.textContent = e.title;
    el.append(o);
  }
  el.value = selected;
}
function run(prior = false, fit = true) {
  if (busy) return;
  try {
    params = readParams();
    busy = true;
    generation++;
    let remaining = 2;
    controlsBusy(true);
    setStatus("Worker에서 계산 중… 이전 화면을 유지합니다.");
    const old = [...panes];
    workers.forEach((worker, i) => {
      const candidate = select(i === 0 ? "left" : "right").value as Candidate;
      worker.onmessage = (
        e: MessageEvent<
          Pane & { generation: number; candidate: Candidate; error?: string }
        >
      ) => {
        if (e.data.generation !== generation) return;
        if (e.data.error) {
          fail(e.data.error);
          return;
        }
        panes[i] = e.data;
        $("title" + i).textContent = titles[candidate];
        remaining--;
        if (remaining === 0) {
          busy = false;
          controlsBusy(false);
          if (fit) camera = fitCamera(panes.flatMap((p) => p?.geometry ?? []));
          const movement =
            prior && old[1] && panes[1]
              ? displacement(old[1].result.output, panes[1].result.output)
              : null;
          setStatus(
            `${snapshot.worldTitle} · ${snapshot.events.length} Events / ${snapshot.relations.length} 관계 · 동일 카메라${movement ? ` · 추가 후 기존 X 이동 p95 ${movement.p95X.toFixed(2)} / Y ${movement.maxY}` : ""}`
          );
          scheduleDraw();
        }
      };
      worker.onerror = (e) => fail(e.message);
      worker.postMessage({
        generation,
        snapshot,
        candidate,
        parameters: params,
        primary,
        ...(prior && old[i] ? { previous: old[i]!.result.output } : {})
      });
    });
  } catch (e) {
    fail(e);
  }
}
function collectionColor(c: string | undefined) {
  const index = snapshot.collections.findIndex((v) => v.id === c);
  return colors[(index < 0 ? colors.length - 1 : index) % colors.length]!;
}
function color(id: string) {
  const e = snapshot.events.find((e) => e.id === id);
  return collectionColor(
    e?.collectionIds.find((c) => primary.includes(c)) ?? e?.collectionIds[0]
  );
}
function scheduleDraw() {
  if (busy) return;
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}
function draw() {
  if (!snapshot) return;
  const metadata = new Map(snapshot.events.map((e) => [e.id, e]));
  const shapes = panes.map(
    (p) => new Map(p?.geometry.map((g) => [g.id, g]) ?? [])
  );
  const visible = (id: string) => {
    const cs = metadata.get(id)?.collectionIds ?? [];
    return cs.length === 0 || cs.some((c) => active.has(c));
  };
  const shared = (id: string) =>
    (metadata.get(id)?.collectionIds.filter((c) => primary.includes(c))
      .length ?? 0) > 1;
  panes.forEach((pane, k) => {
    if (!pane) return;
    const started = performance.now(),
      canvas = $<HTMLCanvasElement>("canvas" + k),
      ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size.width, size.height);
    const xy = (p: { x: number; y: number }) =>
      project(p, camera, size.width, size.height);
    const path = (points: { x: number; y: number }[], fill: boolean) => {
      if (!points.length) return;
      ctx.beginPath();
      points.forEach((p, i) => {
        const v = xy(p);
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      });
      if (points.length >= 3) ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    };
    const lo = camera.y - camera.spanY / 2,
      hi = camera.y + camera.spanY / 2;
    const origin = chronologyYearToWorldY(snapshot.input.board, 0),
      unit = chronologyYearToWorldY(snapshot.input.board, 1) - origin;
    ctx.font = "11px system-ui";
    for (let i = 1; i < 7; i++) {
      const y = lo + ((hi - lo) * i) / 7;
      const v = xy({ x: camera.x, y });
      ctx.strokeStyle = "#e6ebf2";
      ctx.beginPath();
      ctx.moveTo(0, v.y);
      ctx.lineTo(600, v.y);
      ctx.stroke();
      ctx.fillStyle = "#75849a";
      ctx.fillText(String(Math.round((y - origin) / unit)), 6, v.y - 4);
    }
    if (check("bands")) {
      for (const c of primary) {
        if (!active.has(c)) continue;
        const bins = new Map<number, { x: number; y: number }[]>();
        for (const g of pane.geometry) {
          if (
            g.kind === "region" ||
            !visible(g.id) ||
            shared(g.id) ||
            !metadata.get(g.id)?.collectionIds.includes(c)
          )
            continue;
          const year = (g.center.y - origin) / unit;
          const b = Math.floor(year / defaults.windowYears);
          const ps = bins.get(b) ?? [];
          ps.push(g.center);
          bins.set(b, ps);
        }
        for (const ps of bins.values()) {
          if (ps.length < 3) continue;
          const xs = ps.map((p) => p.x).sort((a, b) => a - b),
            ys = ps.map((p) => p.y);
          const l = xs[Math.floor(xs.length * 0.1)]! - defaults.spacing / 2,
            r =
              xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))]! +
              defaults.spacing / 2;
          ctx.fillStyle = collectionColor(c) + "12";
          ctx.strokeStyle = collectionColor(c) + "28";
          path(
            [
              { x: l, y: Math.min(...ys) },
              { x: r, y: Math.min(...ys) },
              { x: r, y: Math.max(...ys) },
              { x: l, y: Math.max(...ys) }
            ],
            true
          );
        }
      }
    }
    if (check("edges")) {
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = "#617b9b50";
      for (const r of snapshot.relations) {
        if (
          r.type === "contains" ||
          !visible(r.sourceId) ||
          !visible(r.targetId)
        )
          continue;
        const a = shapes[k]!.get(r.sourceId),
          b = shapes[k]!.get(r.targetId);
        if (a && b) path([a.center, b.center], false);
      }
    }
    if (check("hulls")) {
      for (const g of pane.geometry) {
        if (g.kind !== "region" || !visible(g.id)) continue;
        ctx.globalAlpha = check("shared") && !shared(g.id) ? 0.22 : 1;
        ctx.lineWidth = selected === g.id ? 2.5 : 1;
        ctx.fillStyle = color(g.id) + "08";
        ctx.strokeStyle = color(g.id) + "55";
        path(
          g.polygon.length
            ? g.polygon
            : [
                { x: g.bounds.minX, y: g.bounds.minY },
                { x: g.bounds.maxX, y: g.bounds.minY },
                { x: g.bounds.maxX, y: g.bounds.maxY },
                { x: g.bounds.minX, y: g.bounds.maxY }
              ],
          true
        );
      }
    }
    ctx.globalAlpha = 1;
    for (const g of [...pane.geometry].sort(
      (a, b) => Number(shared(a.id)) - Number(shared(b.id))
    )) {
      if (g.kind === "region" || !visible(g.id)) continue;
      const p = xy(g.center);
      if (p.x < -20 || p.x > 620 || p.y < -20 || p.y > 580) continue;
      ctx.globalAlpha = check("shared") && !shared(g.id) ? 0.12 : 1;
      ctx.fillStyle = color(g.id);
      ctx.strokeStyle = shared(g.id) ? "#132333" : "white";
      ctx.lineWidth = shared(g.id) ? 1.7 : 0.5;
      if (g.kind === "segment") {
        ctx.strokeStyle = color(g.id);
        ctx.lineWidth = 2;
        path(g.ends, false);
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, shared(g.id) ? 4 : 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (selected === g.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#101d2e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    pane.renderMs = performance.now() - started;
    const m = pane.quality;
    const percent = (v: number | null) =>
      v === null ? "—" : (v * 100).toFixed(1) + "%";
    const dec = (v: number | null) => (v === null ? "—" : v.toFixed(2));
    const values = [
      [
        "core 혼합률 / 맥락 균등",
        percent(m.coreMixing) + " / " + percent(m.macroCoreMixing)
      ],
      ["core 범위 중첩", percent(m.localCoreOverlap)],
      ["공유 접근 거리", dec(m.sharedLocalGap)],
      ["인과 X 간격", dec(m.causalHorizontalGap)],
      ["인과 교차율", percent(m.causalCrossingRate)],
      ["core 가로 조각 수", dec(m.coreComponents)],
      ["hull 비자손 포함", percent(m.compositeIntruderRate)],
      [
        "계산 / hull 준비",
        pane.result.computeMs.toFixed(1) +
          " / " +
          pane.geometryMs.toFixed(1) +
          " ms"
      ],
      ["이 프레임 그리기", pane.renderMs.toFixed(1) + " ms"]
    ];
    const target = $("metrics" + k);
    target.replaceChildren();
    for (const [label, v] of values) {
      const cell = document.createElement("div"),
        name = document.createElement("span"),
        value = document.createElement("strong");
      name.className = "metric-label";
      name.textContent = label!;
      value.textContent = v!;
      cell.append(name, value);
      target.append(cell);
    }
  });
  if (selected) {
    const e = metadata.get(selected);
    $("selection").textContent =
      `${e?.title ?? selected} · ID ${selected} · 소속: ${(e?.collectionIds ?? []).map((id) => snapshot.collections.find((c) => c.id === id)?.title ?? id).join(" / ")} · 자식 ${e?.childIds.length ?? 0}개`;
  }
}
for (const k of [0, 1]) {
  const canvas = $<HTMLCanvasElement>("canvas" + k);
  let gesture = createLabGesture(camera, size),
    start: { x: number; y: number } | null = null;
  const point = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * size.width) / r.width,
      y: ((e.clientY - r.top) * size.height) / r.height
    };
  };
  canvas.onpointerdown = (e) => {
    if (Object.keys(gesture.activePointers).length === 0)
      gesture = createLabGesture(camera, size);
    gesture = addLabPointer(gesture, e.pointerId, point(e));
    start = Object.keys(gesture.activePointers).length === 1 ? point(e) : null;
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!gesture.activePointers[e.pointerId]) return;
    gesture = moveLabPointer(gesture, e.pointerId, point(e));
    camera = viewToCamera(gesture.view, size);
    scheduleDraw();
  };
  canvas.onpointerup = (e) => {
    const end = point(e);
    if (start && Math.hypot(start.x - end.x, start.y - end.y) < 6 && !busy) {
      const g = panes[k]?.geometry
        .filter(
          (g) =>
            g.kind !== "region" &&
            (snapshot.events
              .find((e) => e.id === g.id)
              ?.collectionIds.some((c) => active.has(c)) ??
              true)
        )
        .map((g) => ({
          id: g.id,
          p: project(g.center, camera, size.width, size.height)
        }))
        .sort(
          (a, b) =>
            Math.hypot(a.p.x - end.x, a.p.y - end.y) -
            Math.hypot(b.p.x - end.x, b.p.y - end.y)
        )[0];
      if (g && Math.hypot(g.p.x - end.x, g.p.y - end.y) < 18) {
        selected = g.id;
        select("event").value = selected;
        scheduleDraw();
      }
    }
    gesture = removeLabPointer(gesture, e.pointerId);
    start = null;
  };
  canvas.onpointercancel = (e) => {
    gesture = removeLabPointer(gesture, e.pointerId);
    start = null;
  };
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
      camera = {
        ...camera,
        spanX: camera.spanX * factor,
        spanY: camera.spanY * factor
      };
      scheduleDraw();
    },
    { passive: false }
  );
}
$("run").onclick = () => run(false, false);
select("dataset").onchange = () => {
  if (busy) return;
  updated = false;
  void loadData(select("dataset").value)
    .then(() => run())
    .catch(fail);
};
for (const id of ["hulls", "bands", "edges", "shared"])
  $(id).onchange = scheduleDraw;
$("fit").onclick = () => {
  camera = fitCamera(panes.flatMap((p) => p?.geometry ?? []));
  scheduleDraw();
};
for (const [id, factor] of [
  ["zoomIn", 0.7],
  ["zoomOut", 1 / 0.7]
] as const)
  $(id).onclick = () => {
    camera = {
      ...camera,
      spanX: camera.spanX * factor,
      spanY: camera.spanY * factor
    };
    scheduleDraw();
  };
for (const el of document.querySelectorAll<HTMLButtonElement>("[data-period]"))
  el.onclick = () => {
    const [a, b] = el.dataset.period!.split(",").map(Number);
    const lo = chronologyYearToWorldY(snapshot.input.board, a!),
      hi = chronologyYearToWorldY(snapshot.input.board, b!);
    camera = { ...camera, y: (lo + hi) / 2, spanY: (hi - lo) * 1.2 };
    scheduleDraw();
  };
$("search").oninput = updateSearch;
select("event").onchange = () => {
  selected = select("event").value;
  scheduleDraw();
};
$("increment").onclick = () => {
  if (busy) return;
  if (select("dataset").value !== "changing" || updated) {
    setStatus("추가 실험은 ‘시간별 관계 변화’의 초기 데이터에서 실행하세요.");
    return;
  }
  updated = true;
  const keep = new Set(active);
  const keepSelected = selected;
  void loadData("changing")
    .then(() => {
      active = keep;
      selected = keepSelected;
      updateSearch();
      run(true, false);
    })
    .catch(fail);
};
$("save").onclick = () => {
  if (busy) return;
  const config = {
    formatVersion: "moirai-research-preset/2",
    dataset: select("dataset").value,
    inputDigest: snapshot.inputDigest,
    updated,
    parameters: params,
    left: select("left").value,
    right: select("right").value,
    camera,
    active: [...active],
    display: Object.fromEntries(
      ["hulls", "bands", "edges", "shared"].map((id) => [id, check(id)])
    ),
    selected,
    outputs: panes.map((p) => p?.result.output)
  };
  const a = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(config, null, 2)], { type: "application/json" })
    );
  a.href = url;
  a.download = "moirai-layout-preset.json";
  a.click();
  URL.revokeObjectURL(url);
};
$<HTMLInputElement>("restore").onchange = () => {
  void (async () => {
    try {
      const f = $<HTMLInputElement>("restore").files?.[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024)
        throw Error("설정 파일은 8 MiB 이하여야 합니다.");
      const v = JSON.parse(await f.text()) as {
        formatVersion: string;
        dataset: string;
        inputDigest: string;
        updated: boolean;
        parameters: Parameters;
        left: Candidate;
        right: Candidate;
        camera: LabCamera;
        active: string[];
        display: Record<string, boolean>;
        selected: string;
        outputs: ResearchResult["output"][];
      };
      if (
        v.formatVersion !== "moirai-research-preset/2" ||
        !candidates.includes(v.left) ||
        !candidates.includes(v.right) ||
        typeof v.updated !== "boolean" ||
        (v.updated && v.dataset !== "changing") ||
        !v.parameters ||
        Object.keys(v.parameters).length !== definitions.length ||
        Object.values(v.parameters).some((n) => typeof n !== "number") ||
        !v.camera ||
        Object.keys(v.camera).sort().join(",") !==
          ["spanX", "spanY", "x", "y"].join(",") ||
        Object.values(v.camera).some((n) => !Number.isFinite(n)) ||
        v.camera.spanX <= 0 ||
        v.camera.spanY <= 0 ||
        !Array.isArray(v.active) ||
        !v.active.every((id) => typeof id === "string") ||
        !v.display ||
        typeof v.selected !== "string"
      )
        throw Error("지원하지 않는 설정입니다.");
      updated = v.updated;
      await loadData(v.dataset);
      if (snapshot.inputDigest !== v.inputDigest)
        throw Error("다른 snapshot의 설정입니다.");
      select("dataset").value = v.dataset;
      select("left").value = v.left;
      select("right").value = v.right;
      for (const [key] of definitions)
        $<HTMLInputElement>("param-" + key).value = String(v.parameters[key]);
      params = readParams();
      camera = v.camera;
      active = new Set(
        v.active.filter((id) => snapshot.collections.some((c) => c.id === id))
      );
      document
        .querySelectorAll<HTMLInputElement>("[data-collection]")
        .forEach((el) => (el.checked = active.has(el.dataset.collection!)));
      for (const id of ["hulls", "bands", "edges", "shared"])
        $<HTMLInputElement>(id).checked = v.display[id] === true;
      selected = snapshot.events.some((e) => e.id === v.selected)
        ? v.selected
        : "";
      updateSearch();
      // Never trust imported coordinates. Recompute cold; an updated preset requires its validated initial predecessor.
      if (updated) {
        const r = await fetch("data/changing.json");
        const initial = (await r.json()) as LabSnapshot;
        const digest = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(snapshotDigestPayload(initial))
            )
          )
        ]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (digest !== initial.inputDigest)
          throw Error("초기 snapshot digest 불일치");
        for (const [i, candidate] of [v.left, v.right].entries()) {
          const w = new Worker(new URL("./worker.js", import.meta.url), {
            type: "module"
          });
          const response = await new Promise<Pane>((resolve, reject) => {
            w.onmessage = (e) =>
              e.data.error ? reject(Error(e.data.error)) : resolve(e.data);
            w.onerror = (e) => reject(Error(e.message));
            w.postMessage({
              generation: 0,
              snapshot: initial,
              candidate,
              parameters: params,
              primary
            });
          }).finally(() => w.terminate());
          panes[i] = response;
        }
        run(true, false);
      } else run(false, false);
    } catch (e) {
      fail(e);
    }
  })();
};
void fetch("build.json")
  .then((r) => r.json())
  .then(
    (v: { sourceCommit: string; builtAt: string }) =>
      ($("build").textContent =
        `실험 소스 ${v.sourceCommit.slice(0, 7)} · build ${v.builtAt}`)
  )
  .catch(() => {});
void fetch("measurements.json")
  .then((r) => r.json())
  .then(
    (v: {
      scales: { candidate: Candidate; events: number; medianMs: number }[];
    }) => {
      const table = document.createElement("table"),
        head = document.createElement("tr");
      for (const text of ["알고리즘", "1k", "10k", "100k"]) {
        const th = document.createElement("th");
        th.textContent = text;
        head.append(th);
      }
      table.append(head);
      for (const candidate of [
        "legacy-force",
        "deterministic-slots",
        "global-incidence",
        "local-incidence"
      ] as Candidate[]) {
        const row = document.createElement("tr"),
          name = document.createElement("td");
        name.textContent = titles[candidate];
        row.append(name);
        for (const count of [1000, 10000, 100000]) {
          const cell = document.createElement("td");
          const result = v.scales.find(
            (x) => x.candidate === candidate && x.events === count
          );
          cell.textContent = result
            ? result.medianMs < 1000
              ? result.medianMs.toFixed(0) + " ms"
              : (result.medianMs / 1000).toFixed(2) + " s"
            : "—";
          row.append(cell);
        }
        table.append(row);
      }
      $("benchmark").append(table);
    }
  )
  .catch(() => {
    $("benchmark").textContent = "벤치마크는 측정 보고서에서 확인하세요.";
  });
void loadData("changing")
  .then(() => run())
  .catch(fail);
// Small read-only browser inspection surface for reproducible public smoke tests.
Object.defineProperty(window, "moiraiResearch", {
  get: () => ({
    generation,
    busy,
    camera,
    parameters: params,
    digest: snapshot?.inputDigest,
    selected,
    outputs: panes.map((p) => p?.result.output),
    quality: panes.map((p) => p?.quality)
  })
});
