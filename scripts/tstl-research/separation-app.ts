import {
  addLabPointer,
  createLabGesture,
  moveLabPointer,
  removeLabPointer,
  resetLabGesture,
  viewToCamera
} from "../../apps/atropos-web/src/labs/layout/gestures.js";
import type { TstlProjection } from "../../packages/graph-presentation/src/tstl-validator.js";
import type { TstlExperimentCandidate } from "../../apps/atropos-web/src/lib/tstl-experiment-types.js";
interface Artifact {
  sourceCommit: string;
  sourceDirty: boolean;
  events: {
    id: string;
    title: string;
    y: number;
    role: string;
    collections: readonly string[];
  }[];
  projection: TstlProjection;
  cases: Record<string, string>;
  modes: Record<string, TstlExperimentCandidate>;
}
const get = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const graph = document.getElementById("graph") as unknown as SVGSVGElement;
const mode = get<HTMLSelectElement>("mode"),
  view = get<HTMLSelectElement>("view"),
  scope = get<HTMLSelectElement>("scope");
const points = get<HTMLInputElement>("points"),
  labels = get<HTMLInputElement>("labels");
const build = (await (await fetch("build.json")).json()) as { sha256: string };
const bytes = await (await fetch("comparison.json")).arrayBuffer();
const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
  .map((v) => v.toString(16).padStart(2, "0"))
  .join("");
if (digest !== build.sha256) throw Error("separation_preview_digest_mismatch");
const artifact = JSON.parse(new TextDecoder().decode(bytes)) as Artifact;
const byId = new Map(artifact.events.map((e) => [e.id, e]));
const eventPicker = get<HTMLSelectElement>("event");
for (const event of [...artifact.events].sort((a, b) =>
  a.title.localeCompare(b.title)
)) {
  const option = document.createElement("option");
  option.value = event.id;
  option.textContent = event.title;
  eventPicker.append(option);
}
for (const name of Object.keys(artifact.modes)) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  mode.append(option);
}
const params = new URLSearchParams(location.search);
mode.value = artifact.modes[params.get("mode") ?? ""]
  ? params.get("mode")!
  : "Lanes";
const cameras: Record<
  string,
  { x: number; y: number; spanX: number; spanY: number }
> = {
  overview: { x: 0, y: 220900, spanX: 1050, spanY: 21000 },
  imjin: { x: 260, y: 223420, spanX: 650, spanY: 1800 },
  detail: { x: 280, y: 222950, spanX: 430, spanY: 500 }
};
view.value =
  (params.get("view") ?? "") in cameras ? params.get("view")! : "overview";
scope.value = ["roots", "middle", "all"].includes(params.get("scope") ?? "")
  ? params.get("scope")!
  : "roots";
points.checked = params.get("points") === "1";
let size = { width: graph.clientWidth, height: graph.clientHeight };
let gesture = createLabGesture({ ...cameras[view.value]! }, size);
let selected: string | null = null;
const colors: Record<string, string> = {
  [artifact.cases.korea!]: "#648756",
  [artifact.cases.japan!]: "#b07951",
  [artifact.cases.china!]: "#5887ab",
  [artifact.cases.imjin!]: "#8c65a2",
  [artifact.cases.yi!]: "#b49a36"
};
const roots = [
  artifact.cases.korea!,
  artifact.cases.japan!,
  artifact.cases.china!
];
const color = (id: string) =>
  colors[id] ??
  `hsl(${[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 360} 28% 43%)`;
const svg = (
  tag: string,
  attrs: Record<string, string | number>,
  text?: string
) => {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
};
const measure = document.createElement("canvas").getContext("2d")!;
function draw() {
  const c = viewToCamera(gesture.view, size),
    m = artifact.modes[mode.value]!;
  const sx = size.width / c.spanX,
    sy = size.height / c.spanY;
  const x = (v: number) => (v - c.x) * sx + size.width / 2,
    y = (v: number) => (v - c.y) * sy + size.height / 2;
  graph.replaceChildren();
  graph.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  const step = 10 ** Math.floor(Math.log10(c.spanY / 6));
  for (
    let tick = Math.ceil((c.y - c.spanY / 2) / step) * step;
    tick < c.y + c.spanY / 2;
    tick += step
  ) {
    graph.append(
      svg("line", {
        x1: 0,
        x2: size.width,
        y1: y(tick),
        y2: y(tick),
        stroke: "#e1e7df",
        "stroke-width": 0.5
      })
    );
    graph.append(
      svg(
        "text",
        { x: 3, y: y(tick) - 3, "font-size": 9, fill: "#778275" },
        String(tick)
      )
    );
  }
  const regionIds =
    scope.value === "roots"
      ? roots
      : scope.value === "middle"
        ? [artifact.cases.imjin!, artifact.cases.yi!]
        : artifact.projection.compositeIds;
  if (!points.checked)
    for (const id of regionIds) {
      const rings = m.contoursByCompositeId[id] ?? [];
      const d = rings
        .map(
          (r) =>
            r.map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.y)}`).join(" ") +
            "Z"
        )
        .join(" ");
      graph.append(
        svg("path", {
          d,
          fill: color(id),
          "fill-opacity": 0.16,
          stroke: color(id),
          "stroke-width": 0.7,
          "fill-rule": "evenodd",
          "data-region-id": id
        })
      );
      for (const trace of m.tracesByCompositeId?.[id] ?? [])
        graph.append(
          svg("path", {
            d: trace.points
              .map((p, i) => `${i ? "L" : "M"}${x(p.x)},${y(p.y)}`)
              .join(" "),
            fill: "none",
            stroke: color(id),
            "stroke-width": 1,
            "stroke-opacity": 0.6
          })
        );
    }
  const visible = artifact.events.filter(
    (e) =>
      e.role === "memberEventMark" &&
      x(m.xByEventId[e.id]!) >= 0 &&
      x(m.xByEventId[e.id]!) <= size.width &&
      y(e.y) >= 0 &&
      y(e.y) <= size.height
  );
  for (const e of visible) {
    const signature = roots.filter((id) =>
      artifact.projection.ancestors[e.id]!.includes(id)
    );
    const node = svg("circle", {
      cx: x(m.xByEventId[e.id]!),
      cy: y(e.y),
      r: selected === e.id ? 5 : 3,
      fill: signature.length === 1 ? color(signature[0]!) : "#212921",
      stroke: "#fff",
      "stroke-width": 1,
      "data-event-id": e.id,
      tabindex: 0,
      role: "button",
      "aria-label": e.title
    });
    node.addEventListener("click", () => select(e.id));
    node.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") select(e.id);
    });
    graph.append(node);
  }
  const occupied: { x: number; y: number; w: number; h: number }[] = [];
  measure.font = "650 12px system-ui";
  // Owner headers are annotations, not duplicate leaf witnesses. Distinct
  // equal-membership owners remain separate labels and original identities.
  if (!points.checked && labels.checked)
    for (const id of regionIds) {
      const members = visible.filter((e) =>
        artifact.projection.ancestors[e.id]!.includes(id)
      );
      if (!members.length) continue;
      const px =
        members.reduce((sum, e) => sum + x(m.xByEventId[e.id]!), 0) /
        members.length;
      let py = Math.max(14, Math.min(...members.map((e) => y(e.y))) - 14);
      const title = byId.get(id)!.title.slice(0, 24);
      const w = Math.min(size.width - 12, measure.measureText(title).width + 6);
      const left = Math.max(6, Math.min(size.width - w - 6, px - w / 2));
      while (
        occupied.some(
          (b) =>
            b.x < left + w &&
            b.x + b.w > left &&
            b.y < py + 3 &&
            b.y + b.h > py - 12
        )
      )
        py += 17;
      if (py > size.height - 4) continue;
      occupied.push({ x: left, y: py - 12, w, h: 15 });
      const label = svg(
        "text",
        {
          x: left,
          y: py,
          "font-size": 12,
          "font-weight": 650,
          fill: color(id),
          stroke: "#fafbf7",
          "stroke-width": 3,
          "paint-order": "stroke",
          "data-header-id": id
        },
        title
      );
      label.addEventListener("click", () => select(id));
      graph.append(label);
    }
  let omittedLabels = 0;
  measure.font = "11px system-ui";
  if (labels.checked)
    for (const e of [...visible].sort(
      (a, b) =>
        Number(b.id === selected) - Number(a.id === selected) ||
        a.y - b.y ||
        a.id.localeCompare(b.id)
    )) {
      let title = e.title;
      while (measure.measureText(title).width > 150 && title.length > 2)
        title = title.replace(/…$/, "").slice(0, -1) + "…";
      const box = {
        x: x(m.xByEventId[e.id]!) + 6,
        y: y(e.y) - 6,
        w: measure.measureText(title).width + 3,
        h: 13
      };
      if (
        box.x + box.w > size.width ||
        occupied.some(
          (b) =>
            b.x < box.x + box.w &&
            b.x + b.w > box.x &&
            b.y < box.y + box.h &&
            b.y + b.h > box.y
        )
      ) {
        omittedLabels++;
        continue;
      }
      occupied.push(box);
      graph.append(
        svg(
          "text",
          {
            x: box.x,
            y: box.y + 10,
            "font-size": 11,
            fill: "#26312c",
            stroke: "#fafbf7",
            "stroke-width": 2,
            "paint-order": "stroke"
          },
          title
        )
      );
    }
  get("status").textContent =
    `${mode.value} · ${visible.length}/430 leaves in camera · ${omittedLabels} colliding/off-edge labels omitted · span X ${c.spanX.toFixed(0)} · ${artifact.sourceCommit.slice(0, 8)}${artifact.sourceDirty ? " + working experiment" : ""}`;
  graph.dataset.ready = "true";
  graph.dataset.camera = JSON.stringify(c);
  graph.dataset.mode = mode.value;
}
function select(id: string) {
  selected = id;
  eventPicker.value = id;
  const panel = get("detail");
  panel.hidden = false;
  panel.replaceChildren();
  const close = document.createElement("button");
  close.textContent = "Close";
  close.onclick = () => {
    panel.hidden = true;
    selected = null;
    draw();
  };
  panel.append(close);
  const title = document.createElement("h2");
  title.textContent = byId.get(id)!.title;
  panel.append(title);
  for (const [heading, ids] of [
    ["Direct contains parents", artifact.projection.parents[id]!],
    ["All ancestor memberships", artifact.projection.ancestors[id]!]
  ] as const) {
    const h = document.createElement("h3");
    h.textContent = heading;
    panel.append(h);
    const list = document.createElement("ul");
    for (const parent of ids) {
      const li = document.createElement("li");
      li.textContent = byId.get(parent)!.title;
      list.append(li);
    }
    panel.append(list);
  }
  draw();
}
function fixed() {
  gesture = resetLabGesture(gesture, { ...cameras[view.value]! }, size);
  draw();
}
function fit() {
  const c = viewToCamera(gesture.view, size),
    m = artifact.modes[mode.value]!;
  const xs = artifact.events
    .filter(
      (e) => e.role === "memberEventMark" && Math.abs(e.y - c.y) <= c.spanY / 2
    )
    .map((e) => m.xByEventId[e.id]!);
  if (xs.length) {
    const min = Math.min(...xs),
      max = Math.max(...xs);
    gesture = resetLabGesture(
      gesture,
      { ...c, x: (min + max) / 2, spanX: Math.max(80, (max - min) * 1.12) },
      size
    );
  }
  draw();
}
mode.onchange = draw;
eventPicker.onchange = () => {
  if (!byId.has(eventPicker.value)) return;
  const event = byId.get(eventPicker.value)!;
  const camera = viewToCamera(gesture.view, size);
  gesture = resetLabGesture(
    gesture,
    {
      ...camera,
      x: artifact.modes[mode.value]!.xByEventId[event.id]!,
      y: event.y
    },
    size
  );
  select(event.id);
};
scope.onchange = draw;
points.onchange = draw;
labels.onchange = draw;
view.onchange = fixed;
get("fixed").onclick = fixed;
get("fit").onclick = fit;
graph.addEventListener("pointerdown", (e) => {
  gesture = addLabPointer(gesture, e.pointerId, { x: e.offsetX, y: e.offsetY });
});
graph.addEventListener("pointermove", (e) => {
  if (!gesture.activePointers[e.pointerId]) return;
  const start = gesture.activePointers[e.pointerId]!;
  if (
    !graph.hasPointerCapture(e.pointerId) &&
    Math.hypot(e.offsetX - start.x, e.offsetY - start.y) < 3
  )
    return;
  graph.setPointerCapture(e.pointerId);
  gesture = moveLabPointer(gesture, e.pointerId, {
    x: e.offsetX,
    y: e.offsetY
  });
  draw();
});
graph.addEventListener("pointerup", (e) => {
  gesture = removeLabPointer(gesture, e.pointerId);
});
graph.addEventListener("pointercancel", (e) => {
  gesture = removeLabPointer(gesture, e.pointerId);
});
graph.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    const c = viewToCamera(gesture.view, size);
    gesture = resetLabGesture(
      gesture,
      { ...c, spanX: c.spanX * factor, spanY: c.spanY * factor },
      size
    );
    draw();
  },
  { passive: false }
);
addEventListener("resize", () => {
  const camera = viewToCamera(gesture.view, size);
  size = { width: graph.clientWidth, height: graph.clientHeight };
  gesture = resetLabGesture(gesture, camera, size);
  draw();
});
if (params.get("fit") === "1") fit();
else draw();
