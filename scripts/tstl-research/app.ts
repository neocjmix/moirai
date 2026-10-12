import {
  addLabPointer,
  cameraToView,
  createLabGesture,
  moveLabPointer,
  removeLabPointer,
  resetLabGesture,
  viewToCamera
} from "../../apps/atropos-web/src/labs/layout/gestures.js";
import {
  contextViewportMetrics,
  selectGraphContext
} from "../../apps/atropos-web/src/lib/graph-context-policy.js";
import { validateTstlRenderCommands } from "../../packages/graph-presentation/src/tstl-validator.js";
import type {
  TstlComparisonArtifact,
  TstlComparisonEvent,
  TstlComparisonLayout
} from "./candidate.js";
import {
  exactSignatureRows,
  inspectView,
  pathKey,
  revealEvent,
  switchComparison,
  type OmissionReason,
  type TstlViewState
} from "./view-state.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw Error(`Missing preview element: ${id}`);
  return element as T;
};
const graph = document.getElementById("graph") as unknown as SVGSVGElement;
const ns = "http://www.w3.org/2000/svg";
// Text measurement is annotation-only; it cannot alter canonical glyphs,
// contours, hit identity, time or the camera.
const textMeasure = document.createElement("canvas").getContext("2d")!;
const textMetrics = new Map<string, { text: string; width: number }>();
function measuredLabel(title: string, selected: boolean) {
  const maxWidth = Math.min(size.width - 24, selected ? 240 : 180);
  const key = `${maxWidth}:${selected}:${title}`;
  const cached = textMetrics.get(key);
  if (cached) return cached;
  textMeasure.font = `${selected ? 650 : 450} ${selected ? 12 : 10}px ${getComputedStyle(graph).fontFamily}`;
  let text = title;
  let width = textMeasure.measureText(text).width;
  while (width > maxWidth && text.length > 2) {
    text = `${text.replace(/…$/, "").slice(0, -1)}…`;
    width = textMeasure.measureText(text).width;
  }
  const result = { text, width };
  textMetrics.set(key, result);
  return result;
}
function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  text?: string
) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string
) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text: string, action: () => void, testId?: string) {
  const node = element("button", text);
  node.type = "button";
  node.onclick = action;
  if (testId) node.dataset.testid = testId;
  return node;
}
const omissionText: Record<OmissionReason, string> = {
  "scope-filtered": "Collection 선택 밖",
  "path-collapsed": "모든 contains 경로 접힘",
  "user-hidden": "직접 숨김",
  unplaced: "위치 미확인 · 목록에서 읽기",
  "outside-viewport": "화면 밖"
};
let artifact: TstlComparisonArtifact;
let sourceCommit = "";
let ready = false;
let state: TstlViewState;
let size = { width: innerWidth, height: innerHeight };
let gesture = createLabGesture({ x: 0, y: 0, spanX: 1000, spanY: 4500 }, size);
let framePending = false;
let selectedTopicId: string | null = null;
let drawerKind: "event" | "search" | "signatures" | "list" | "details" =
  "event";
let search = "";
let listedIds: string[] = [];
let listTitle = "";
let lastFocused: HTMLElement | null = null;
let renderedEventIds: string[] = [];
let renderedRegionIds: string[] = [];
let labeledEventIds: string[] = [];
let drawDurations: number[] = [];
const eventMaps = new Map<string, Map<string, TstlComparisonEvent>>();
const contextBounds = new Map<
  string,
  Map<string, { minX: number; maxX: number; minY: number; maxY: number }>
>();
const active = (): TstlComparisonLayout =>
  state.mode === "A" ? artifact.a : artifact.b0;
const eventsById = () => eventMaps.get(state.mode)!;
const eventName = (id: string) => eventsById().get(id)?.title ?? id;
const shortName = (id: string) => {
  const { cases } = artifact;
  return id === cases.korea
    ? "한국사"
    : id === cases.japan
      ? "일본사"
      : id === cases.china
        ? "중국사"
        : id === cases.imjin
          ? "임진왜란"
          : id === cases.yi
            ? "이순신의 생애"
            : eventName(id);
};
function colorFor(id: string) {
  const { cases } = artifact;
  if (id === cases.korea) return "#65885d";
  if (id === cases.japan) return "#ad765b";
  if (id === cases.china) return "#708ba0";
  if (id === cases.imjin) return "#947aab";
  if (id === cases.yi) return "#aa963f";
  return "#647461";
}
function eventColor(eventId: string) {
  const ancestors = artifact.projection.ancestors[eventId] ?? [];
  const countries = state.scopeCompositeIds.filter((id) =>
    ancestors.includes(id)
  );
  return countries.length > 1 ? "#48564b" : colorFor(countries[0] ?? eventId);
}
function screen(event: { x: number; referenceY: number }) {
  const view = cameraToView(state.camera, size);
  return {
    x: event.x * view.scaleX + view.x,
    y: event.referenceY * view.scaleY + view.y
  };
}
function resetGesture() {
  gesture = resetLabGesture(gesture, state.camera, size);
}
function requestDraw() {
  if (!ready || framePending) return;
  framePending = true;
  requestAnimationFrame(() => {
    framePending = false;
    draw();
  });
}
function commitView(drawer = true) {
  resetGesture();
  updateControls();
  if (drawer && !$("drawer").hidden) renderDrawer();
  requestDraw();
}
function fit(ids?: readonly string[]) {
  const wanted = ids ? new Set(ids) : null;
  const events = active().events.filter(
    (event) =>
      (!wanted || wanted.has(event.eventId)) &&
      event.collectionIds.some((id) => state.activeCollectionIds.includes(id))
  );
  if (!events.length) return;
  const minX = Math.min(...events.map((event) => event.x));
  const maxX = Math.max(...events.map((event) => event.x));
  const minY = Math.min(...events.map((event) => event.referenceY));
  const maxY = Math.max(...events.map((event) => event.referenceY));
  state = {
    ...state,
    camera: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      spanX: Math.max(130, (maxX - minX) * 1.24),
      spanY: Math.max(180, (maxY - minY) * 1.44)
    }
  };
  commitView();
}
function focusEvent(id: string, moveCamera: boolean, open = true) {
  const event = eventsById().get(id);
  if (!event) return;
  state = revealEvent(state, event, moveCamera);
  if (moveCamera) {
    // A selected point sits above the peek drawer. Only the camera changes.
    state = {
      ...state,
      camera: {
        ...state.camera,
        y: event.referenceY + state.camera.spanY * 0.16
      }
    };
  }
  if (open) openDrawer("event");
  commitView();
}
function openCase(id: string) {
  focusEvent(id, false, false);
  const members = artifact.projection.descendants[id] ?? [];
  fit([id, ...members]);
  openDrawer("event");
  commitView();
}
function updateControls() {
  for (const mode of ["A", "B0"] as const)
    $(mode === "A" ? "mode-a" : "mode-b0").setAttribute(
      "aria-pressed",
      String(state.mode === mode)
    );
  $("collection-count").textContent = String(state.activeCollectionIds.length);
  $("collections-open").setAttribute(
    "aria-label",
    `Collection 선택 ${state.activeCollectionIds.length}개`
  );
  $("empty").hidden = state.activeCollectionIds.length > 0;
  for (const input of document.querySelectorAll<HTMLInputElement>(
    "#collections-list input"
  ))
    input.checked = state.activeCollectionIds.includes(input.value);
}
function draw() {
  const started = performance.now();
  const layout = active();
  const inspected = inspectView(layout.events, artifact.projection, state);
  const visible = new Set(
    inspected.filter((item) => item.visible).map((item) => item.eventId)
  );
  const visibleEvents = layout.events.filter((event) =>
    visible.has(event.eventId)
  );
  const view = cameraToView(state.camera, size);
  const world = document.getElementById("world")!;
  const annotations = document.getElementById("annotations")!;
  const grid = document.getElementById("grid")!;
  world.replaceChildren();
  annotations.replaceChildren();
  grid.replaceChildren();
  world.setAttribute(
    "transform",
    `translate(${view.x} ${view.y}) scale(${view.scaleX} ${view.scaleY})`
  );
  // Tick values are explicitly source scalar values. No Gregorian/date recovery.
  const sourceSpan = state.camera.spanY / artifact.referenceFrame.scale;
  const rawStep = sourceSpan / 8;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= rawStep) ??
    magnitude * 10;
  const sourceTop =
    (state.camera.y - state.camera.spanY / 2) / artifact.referenceFrame.scale +
    artifact.referenceFrame.sourceYOrigin;
  for (
    let value = Math.ceil(sourceTop / step) * step, i = 0;
    i < 12;
    i++, value += step
  ) {
    const y =
      (value - artifact.referenceFrame.sourceYOrigin) *
        artifact.referenceFrame.scale *
        view.scaleY +
      view.y;
    if (y > size.height) break;
    if (y < 0) continue;
    grid.append(
      svg("line", {
        x1: 0,
        x2: size.width,
        y1: y,
        y2: y,
        stroke: "#e6eade",
        "stroke-width": 1
      })
    );
    grid.append(
      svg(
        "text",
        {
          x: size.width - 8,
          y: y - 4,
          fill: "#879181",
          "font-size": 9,
          "text-anchor": "end"
        },
        `scalar ${value.toLocaleString("en-US", { maximumFractionDigits: 3 })}`
      )
    );
  }
  const regionsById = new Map(
    layout.regions.map((region) => [region.id, region])
  );
  const shownComposites = new Set(state.scopeCompositeIds);
  if (
    state.selectedEventId &&
    artifact.projection.compositeIds.includes(state.selectedEventId)
  )
    shownComposites.add(state.selectedEventId);
  renderedRegionIds = [];
  if (state.activeCollectionIds.length > 0) {
    // Diagnostic contours remain byte-for-byte coordinates from the artifact.
    // No hull construction, smoothing, geometry clipping or rounding occurs here.
    for (const command of layout.diagnosticRenderCommands.regions) {
      const owner = regionsById.get(command.regionId)?.compositeId;
      if (!owner || !shownComposites.has(owner)) continue;
      const polygon = svg("polygon", {
        points: command.points
          .map((point) => `${point.x},${point.y}`)
          .join(" "),
        fill: "none",
        stroke: colorFor(owner),
        "stroke-width": command.strokeWidth,
        "stroke-linejoin": "miter",
        opacity: 0.62,
        "pointer-events": "none",
        "data-region-id": command.regionId,
        "data-composite-id": owner,
        "data-representation": "diagnostic-outline"
      });
      world.append(polygon);
      renderedRegionIds.push(command.regionId);
    }
  }
  // Only authored direct contains edges are drawn as structure lines. Other
  // ancestor memberships are typed port references and exact lists below.
  if (state.selectedEventId && visible.has(state.selectedEventId)) {
    const selected = eventsById().get(state.selectedEventId)!;
    for (const parentId of artifact.projection.parents[selected.eventId] ??
      []) {
      const parent = eventsById().get(parentId)!;
      if (!visible.has(parentId)) continue;
      world.append(
        svg("line", {
          x1: parent.x,
          y1: parent.referenceY,
          x2: selected.x,
          y2: selected.referenceY,
          stroke: "#7f8a79",
          "stroke-width": 1,
          "stroke-dasharray": "5 5",
          "pointer-events": "none",
          "data-relation-type": "contains",
          "data-parent-id": parentId,
          "data-child-id": selected.eventId
        })
      );
    }
  }
  renderedEventIds = [];
  for (const command of layout.renderCommands.glyphs) {
    if (!visible.has(command.eventId)) continue;
    const event = eventsById().get(command.eventId)!;
    const selected = event.eventId === state.selectedEventId;
    const body = svg("rect", {
      x: command.body.minX,
      y: command.body.minY,
      width: command.body.maxX - command.body.minX,
      height: command.body.maxY - command.body.minY,
      fill:
        event.role === "compositeHeader"
          ? "#fafbf7"
          : eventColor(event.eventId),
      stroke: selected ? "#1e3424" : eventColor(event.eventId),
      "stroke-width": command.strokeWidth,
      "data-event-id": event.eventId,
      "data-hit-target-id": command.hitTargetId,
      "data-testid": `event-${event.eventId}`,
      "data-role": event.role,
      role: "button",
      tabindex: 0,
      "aria-label": `${event.title}${event.role === "compositeHeader" ? " · Composite 표제 위치" : ""}`
    });
    body.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusEvent(command.eventId, false);
      }
    });
    world.append(body);
    renderedEventIds.push(event.eventId);
  }
  const occupied: { minX: number; maxX: number; minY: number; maxY: number }[] =
    [];
  const special = new Set(Object.values(artifact.cases));
  const priorities = [...visibleEvents].sort(
    (a, b) =>
      Number(b.eventId === state.selectedEventId) -
        Number(a.eventId === state.selectedEventId) ||
      Number(special.has(b.eventId as typeof artifact.cases.korea)) -
        Number(special.has(a.eventId as typeof artifact.cases.korea)) ||
      Number(a.role === "compositeHeader") -
        Number(b.role === "compositeHeader") ||
      a.eventId.localeCompare(b.eventId)
  );
  labeledEventIds = [];
  for (const event of priorities) {
    const point = screen(event);
    const selected = event.eventId === state.selectedEventId;
    const label = measuredLabel(event.title, selected);
    const x = Math.min(size.width - label.width - 8, Math.max(8, point.x + 8));
    const y = point.y - 8;
    const box = {
      minX: x - 3,
      maxX: x + label.width + 3,
      minY: y - (selected ? 14 : 12),
      maxY: y + 5
    };
    if (
      !selected &&
      (labeledEventIds.length >= 28 ||
        point.y < 138 ||
        point.y > size.height - 133 ||
        occupied.some(
          (other) =>
            box.minX < other.maxX &&
            box.maxX > other.minX &&
            box.minY < other.maxY &&
            box.maxY > other.minY
        ))
    )
      continue;
    occupied.push(box);
    const text = svg(
      "text",
      {
        x,
        y,
        fill: selected ? "#1c3022" : "#58674f",
        "font-size": selected ? 12 : 10,
        "font-weight": selected ? 650 : 450,
        stroke: "#fafbf7",
        "stroke-width": 3.5,
        "paint-order": "stroke",
        "data-label-event-id": event.eventId
      },
      label.text
    );
    annotations.append(text);
    labeledEventIds.push(event.eventId);
    if (selected) {
      annotations.append(
        svg("circle", {
          cx: point.x,
          cy: point.y,
          r: 9,
          fill: "none",
          stroke: "#425f47",
          "stroke-width": 1.5,
          "data-annotation": "selection"
        })
      );
      const ports = layout.ports.filter(
        (port) =>
          port.eventId === event.eventId &&
          state.scopeCompositeIds.includes(port.compositeId)
      );
      for (const [index, port] of ports.entries()) {
        const x1 = point.x + 12 + index * 6;
        annotations.append(
          svg("line", {
            x1,
            x2: x1,
            y1: point.y - 4,
            y2: point.y + 4,
            stroke: colorFor(port.compositeId),
            "stroke-width": 3,
            "data-port-event-id": port.eventId,
            "data-port-composite-id": port.compositeId,
            "data-representation": "membership-port-reference"
          })
        );
      }
    }
  }
  updateContext();
  $("status").textContent =
    `${state.mode === "A" ? "후보 A" : "현행 B0 · global-incidence/1"} · 화면 ${visible.size} / 전체 539 사건 · 진단 윤곽 ${renderedRegionIds.length}`;
  drawDurations.push(performance.now() - started);
  if (drawDurations.length > 600) drawDurations = drawDurations.slice(-600);
}

function updateContext() {
  const view = cameraToView(state.camera, size);
  const bounds = contextBounds.get(state.mode)!;
  const context = selectGraphContext(
    artifact.projection.compositeIds.map((id) => {
      const box = bounds.get(id)!;
      const points = [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: box.minX, y: box.maxY }
      ].map((point) => ({
        x: point.x * view.scaleX + view.x,
        y: point.y * view.scaleY + view.y
      }));
      const min = points[0]!;
      const max = points[2]!;
      return {
        id,
        label: eventName(id),
        contains: artifact.projection.children[id] ?? [],
        coverage: 0,
        centerInside:
          min.x <= size.width / 2 &&
          max.x >= size.width / 2 &&
          min.y <= size.height / 2 &&
          max.y >= size.height / 2,
        visible:
          state.activeCollectionIds.length > 0 &&
          eventsById()
            .get(id)!
            .collectionIds.some((collectionId) =>
              state.activeCollectionIds.includes(collectionId)
            ) &&
          max.x >= 0 &&
          min.x <= size.width &&
          max.y >= 0 &&
          min.y <= size.height,
        supportComplete: true,
        ...contextViewportMetrics(points, size)
      };
    }),
    selectedTopicId
  );
  selectedTopicId = context?.id ?? null;
  $("topic").textContent = context?.label ?? "";
  $("topic").dataset.eventId = context?.id ?? "";
}

function openDrawer(kind: typeof drawerKind) {
  if ($("drawer").hidden)
    lastFocused = document.activeElement as HTMLElement | null;
  drawerKind = kind;
  $("drawer").hidden = false;
  renderDrawer();
}
function closeDrawer() {
  $("drawer").hidden = true;
  lastFocused?.focus();
}
function section(title: string, parent = $("drawer-body")) {
  parent.append(element("h2", title));
}
function eventRow(id: string, note?: string, parent?: string) {
  const row = element("div", undefined, "event-row");
  const reveal = button(
    eventName(id),
    () => focusEvent(id, true),
    `reveal-${id}`
  );
  if (note) reveal.append(element("small", note));
  row.append(reveal);
  if (parent) {
    const key = pathKey(parent, id);
    const collapsed = state.collapsedPathKeys.includes(key);
    const toggle = button(
      collapsed ? "이 경로 펼치기" : "이 경로 접기",
      () => {
        state = {
          ...state,
          collapsedPathKeys: collapsed
            ? state.collapsedPathKeys.filter((value) => value !== key)
            : [...state.collapsedPathKeys, key]
        };
        commitView();
      },
      `path-${parent}-${id}`
    );
    toggle.className = "path-toggle";
    toggle.setAttribute("aria-pressed", String(collapsed));
    row.append(toggle);
  }
  return row;
}
function showList(ids: readonly string[], title: string) {
  listedIds = [...new Set(ids)];
  listTitle = title;
  openDrawer("list");
}
function renderEventDrawer() {
  const body = $("drawer-body");
  const selected = state.selectedEventId
    ? eventsById().get(state.selectedEventId)
    : null;
  if (!selected) {
    body.append(element("p", "사건 점을 누르거나 검색에서 선택하세요."));
    return;
  }
  const { eventId } = selected;
  const projection = artifact.projection;
  const parents = projection.parents[eventId] ?? [];
  const children = projection.children[eventId] ?? [];
  const ancestors = projection.ancestors[eventId] ?? [];
  const isComposite = children.length > 0;
  $("drawer-eyebrow").textContent =
    `${isComposite ? "COMPOSITE · 실제 contains" : "EVENT · 하나의 사건"} · ${state.mode}`;
  $("drawer-title").textContent = selected.title;
  body.append(element("div", eventId, "event-id"));
  const omission = inspectView(active().events, projection, state).find(
    (item) => item.eventId === eventId
  )!;
  if (!omission.visible)
    body.append(
      element(
        "p",
        `현재 ${omission.reasons.map((reason) => omissionText[reason]).join(" · ")}입니다. 선택 identity는 유지됩니다.`,
        "warning"
      )
    );
  const buttons = element("div", undefined, "chips");
  buttons.append(
    button("화면에서 찾기", () => focusEvent(eventId, true), `focus-${eventId}`)
  );
  buttons.append(
    button(
      "이 사건 숨기기",
      () => {
        state = {
          ...state,
          hiddenEventIds: [...new Set([...state.hiddenEventIds, eventId])]
        };
        commitView();
      },
      `hide-${eventId}`
    )
  );
  if (isComposite)
    buttons.append(
      button(
        `구성 사건 ${projection.leafMembers[eventId]?.length ?? 0}개`,
        () =>
          showList(
            projection.leafMembers[eventId] ?? [],
            `${shortName(eventId)} · 재귀 leaf`
          ),
        `members-${eventId}`
      )
    );
  body.append(buttons);
  section(`직접 부모 · contains ${parents.length}`);
  const directParents = element("div");
  directParents.dataset.testid = "direct-parents";
  body.append(directParents);
  if (!parents.length)
    directParents.append(
      element("p", "이 snapshot에 직접 부모가 없습니다.", "muted")
    );
  for (const parentId of parents) {
    const row = eventRow(
      parentId,
      `${shortName(parentId)} → ${shortName(eventId)}`
    );
    const key = pathKey(parentId, eventId);
    const collapsed = state.collapsedPathKeys.includes(key);
    const toggle = button(
      collapsed ? "이 경로 펼치기" : "이 경로 접기",
      () => {
        state = {
          ...state,
          collapsedPathKeys: collapsed
            ? state.collapsedPathKeys.filter((value) => value !== key)
            : [...state.collapsedPathKeys, key]
        };
        commitView();
      },
      `path-${parentId}-${eventId}`
    );
    toggle.className = "path-toggle";
    toggle.setAttribute("aria-pressed", String(collapsed));
    row.append(toggle);
    row.dataset.parentId = parentId;
    directParents.append(row);
  }
  if (isComposite) {
    section("공유 자손 · 부모 관계와 별개");
    const sharing = element("div");
    sharing.dataset.testid = "descendant-sharing";
    body.append(sharing);
    const members = new Set(projection.leafMembers[eventId] ?? []);
    for (const id of [
      artifact.cases.korea,
      artifact.cases.japan,
      artifact.cases.china,
      artifact.cases.yi,
      artifact.cases.imjin
    ].filter((id) => id !== eventId)) {
      const shared = (projection.leafMembers[id] ?? []).filter((leaf) =>
        members.has(leaf)
      );
      if (shared.length)
        sharing.append(
          button(
            `${shortName(id)}와 공유 leaf ${shared.length}`,
            () =>
              showList(
                shared,
                `${shortName(eventId)} ∩ ${shortName(id)} · 공유 자손`
              ),
            `shared-${eventId}-${id}`
          )
        );
    }
    if (eventId === artifact.cases.imjin)
      body.append(
        element(
          "p",
          "직접 부모는 한국사와 일본사입니다. 중국사와 공유하는 29개 자손은 중국사 → 임진왜란 관계를 만들지 않습니다.",
          "warning"
        )
      );
  }
  section(`이 Event 자체의 전체 ancestor 소속 · 포트/목록 ${ancestors.length}`);
  body.append(
    element(
      "p",
      "색 포트는 이 Event를 참조합니다. 선의 교차나 윤곽 안에 있는지는 소속 근거가 아닙니다.",
      "muted"
    )
  );
  for (const id of ancestors)
    body.append(
      eventRow(
        id,
        parents.includes(id) ? "직접 부모" : "contains 경로로 도달하는 조상"
      )
    );
  if (!ancestors.length)
    body.append(element("p", "조상 Composite 없음", "muted"));
  section(`Collection 선택 소속 ${selected.collectionIds.length}`);
  body.append(
    element(
      "p",
      selected.collectionIds
        .map(
          (id) =>
            artifact.snapshot.collections.find((item) => item.id === id)
              ?.title ?? id
        )
        .join(" · ") || "Collection 없음",
      "muted"
    )
  );
  body.append(
    element(
      "p",
      "Collection membership은 탐색 선택이며 contains가 아닙니다.",
      "muted"
    )
  );
  if (children.length) {
    section(`직접 구성 사건 ${children.length} · 경로별 접기`);
    body.append(
      element(
        "p",
        "한 경로를 접어도 다른 열린 부모 경로의 공유 사건은 남습니다. 검색에서 직접 드러낸 사건은 별도의 표시 의도를 유지합니다.",
        "muted"
      )
    );
    for (const id of children) body.append(eventRow(id, undefined, eventId));
  }
  section("시간과 위치 근거");
  body.append(
    element(
      "p",
      `legacy-scalar-only · 원래 scalar Y ${selected.sourceY}. ${isComposite ? "표제의 Y는 기존 bounds 중앙 주석 위치이며 사건 발생일이 아닙니다." : "현행 B0의 표시 anchor를 보존합니다."} 정확한 날짜·불확실성·실제 지속기간은 이 snapshot에서 복원하지 않습니다.`,
      "warning"
    )
  );
  const bounds = selected.baselineShape;
  body.append(element("pre", JSON.stringify(bounds, null, 2)));
}
function renderSearch() {
  $("drawer-eyebrow").textContent = "WORLD r56 · 전체 539 ID · 숨은 사건 복원";
  $("drawer-title").textContent = "사건 찾기";
  const body = $("drawer-body");
  const input = element("input", undefined, "search-input");
  input.type = "search";
  input.placeholder = "제목 또는 Event ID";
  input.value = search;
  input.dataset.testid = "search-input";
  input.setAttribute("aria-label", "모든 사건 제목 또는 ID 검색");
  const results = element("div", undefined, "event-list");
  const count = element("p", undefined, "muted");
  const update = () => {
    search = input.value.slice(0, 512);
    const query = search.toLocaleLowerCase().trim();
    const inspected = new Map(
      inspectView(active().events, artifact.projection, state).map((item) => [
        item.eventId,
        item
      ])
    );
    const matches = active().events.filter((event) =>
      `${event.title} ${event.eventId}`.toLocaleLowerCase().includes(query)
    );
    count.textContent = `${matches.length}개 · 모든 결과는 같은 Event ID로 복원됩니다.`;
    results.replaceChildren(
      ...matches.map((event) => {
        const reasons = inspected.get(event.eventId)!.reasons;
        const label = reasons.length
          ? reasons.map((reason) => omissionText[reason]).join(" · ")
          : labeledEventIds.includes(event.eventId)
            ? "현재 화면에 표시"
            : "점 표시 · 레이블 생략";
        return eventRow(event.eventId, label);
      })
    );
  };
  input.oninput = update;
  body.append(input, count, results);
  update();
}
function renderSignatures() {
  $("drawer-eyebrow").textContent =
    "WORLD r56 · carrier = leaf 430 · 배타 교집합";
  $("drawer-title").textContent = "선택한 Composite 기준";
  const body = $("drawer-body");
  body.append(
    element(
      "p",
      "아래 수는 전체 World의 leaf를 선택한 Composite에 투영한 값입니다. Collection 선택·화면 밖 여부와 별개입니다.",
      "muted"
    )
  );
  const scopes = element("div", undefined, "scope-buttons");
  for (const id of [
    artifact.cases.korea,
    artifact.cases.japan,
    artifact.cases.china
  ]) {
    const checked = state.scopeCompositeIds.includes(id);
    const toggle = button(
      shortName(id),
      () => {
        state = {
          ...state,
          scopeCompositeIds: checked
            ? state.scopeCompositeIds.filter((value) => value !== id)
            : [...state.scopeCompositeIds, id]
        };
        commitView();
      },
      `composite-${id}`
    );
    toggle.setAttribute("aria-pressed", String(checked));
    scopes.append(toggle);
  }
  body.append(scopes);
  const countryFocus = element("div", undefined, "chips");
  for (const key of ["korea", "japan", "china"] as const) {
    const id = artifact.cases[key];
    countryFocus.append(
      button(`${shortName(id)} 보기`, () => openCase(id), `case-${key}`)
    );
  }
  body.append(countryFocus);
  for (const row of exactSignatureRows(
    artifact.projection,
    state.scopeCompositeIds
  )) {
    const label = row.signature.length
      ? row.signature.map(shortName).join(" + ")
      : "선택한 집합에 소속 없음";
    const item = button(
      label,
      () => showList(row.eventIds, `${label} · 정확한 leaf 목록`),
      `signature-${row.signature.join("+") || "empty"}`
    );
    item.className = "signature-row";
    item.dataset.signature = JSON.stringify(row.signature);
    item.append(element("strong", String(row.count)));
    body.append(item);
  }
  body.append(
    element(
      "p",
      "중국사를 비교 집합에서 빼면 한국사+일본사의 배타 수가 112 → 141로 바뀝니다. 같은 사건을 다른 기준으로 묻는 것이며 Event가 추가되지 않습니다.",
      "warning"
    )
  );
}
function renderDetails() {
  $("drawer-eyebrow").textContent = "B0 / 후보 A · 같은 r56 · 독립 프리뷰";
  $("drawer-title").textContent = "비교 결과와 남은 한계";
  const body = $("drawer-body");
  body.append(
    element(
      "p",
      "면으로 소속을 주장하지 않습니다. 두 배치의 윤곽은 검증 실패·미확인 구간을 포함하는 진단선입니다. 실제 소속은 선택한 Event의 정확한 포트·목록으로 확인하세요.",
      "warning"
    )
  );
  const table = element("table");
  const head = element("tr");
  for (const text of ["같은 전체 자료", "B0", "후보 A"])
    head.append(element("th", text));
  table.append(head);
  const metrics: [string, keyof TstlComparisonLayout["metrics"]][] = [
    ["단일 Event", "totalEvents"],
    ["leaf carrier", "totalLeaves"],
    ["Composite", "totalComposites"],
    ["의미 면", "semanticFilledRegions"],
    ["선·목록 대체 Composite", "fallbackComposites"],
    ["정확한 소속 포트", "membershipPorts"],
    ["시간 Y 불일치", "sourceYMismatchCount"],
    ["진단 윤곽 조각", "provisionalRegions"],
    ["여러 run 단면", "multiRunBands"]
  ];
  for (const [label, key] of metrics) {
    const row = element("tr");
    for (const text of [
      label,
      artifact.b0.metrics[key],
      artifact.a.metrics[key]
    ])
      row.append(element("td", String(text)));
    table.append(row);
  }
  body.append(table);
  section("이번 A의 구현 범위");
  body.append(
    element(
      "p",
      "결정적 순서 → 고정 Y의 Event X QP → 직교 single-run 윤곽 → 제한된 patch별 선·목록 대체입니다. 전체 X/경계 공동 QP와 모든 국소 repair 메뉴, B/C 알고리즘은 구현하지 않았습니다."
    )
  );
  section("검증과 데이터 한계");
  body.append(
    element(
      "p",
      "legacy-scalar-only: 원래 시간 descriptor가 없어 정확 시점·불확실 발생 범위·실제 지속기간의 의미 검증은 미완료입니다. 5개 Composite 윤곽을 비교하며 나머지 104개는 정확한 목록으로 읽습니다."
    )
  );
  body.append(
    element(
      "p",
      "B0의 사선 hull은 직교 exact 검증 범위 밖입니다. A의 예산 초과·불명 판정도 승인으로 세지 않습니다. 모바일 실기기 성능과 독해 개선은 아직 확인하지 않았습니다.",
      "muted"
    )
  );
  body.append(
    element(
      "p",
      "손실 없는 r56 원본 fixture를 유지했습니다. handoff의 byte SHA와 저장소 파일의 실제 byte SHA가 달라 재현 증거에 불일치를 기록했습니다.",
      "muted"
    )
  );
  section("조작과 표시");
  body.append(
    element(
      "p",
      "드래그·핀치는 기존 Lab 제스처를 사용합니다. B0/A 전환은 같은 카메라·선택·접기 의도를 유지합니다. 목록의 직접 부모만 contains이며 포트는 조상 소속입니다. Collection을 모두 끄면 빈 선택이 됩니다."
    )
  );
  body.append(
    element(
      "p",
      "글자와 선택 테두리는 화면 주석입니다. 작은 점도 근처를 눌러 선택하거나 검색으로 찾을 수 있습니다. 검증된 본체와 진단 윤곽은 저장된 좌표를 그대로 사용합니다.",
      "muted"
    )
  );
  section("검증한 소스");
  body.append(
    element(
      "pre",
      `source ${sourceCommit}\nB0 ${artifact.b0.canonicalHash}\nA ${artifact.a.canonicalHash}\nsource root ${artifact.source.sourceRootDigest}`
    )
  );
  const links = element("p", undefined, "chips");
  for (const [title, path] of [
    ["빌드 SHA", "build.json"],
    ["비교 artifact", "preview.json"],
    ["측정", "measurements.json"]
  ]) {
    const link = element("a", title!);
    link.href = path!;
    links.append(link);
  }
  body.append(links);
}
function renderDrawer() {
  $("drawer-body").replaceChildren();
  if (drawerKind === "event") renderEventDrawer();
  else if (drawerKind === "search") renderSearch();
  else if (drawerKind === "signatures") renderSignatures();
  else if (drawerKind === "details") renderDetails();
  else {
    $("drawer-eyebrow").textContent =
      `WORLD r56 · unique leaf ${listedIds.length} · 동일 Event 선택`;
    $("drawer-title").textContent = listTitle;
    $("drawer-body").append(
      button("공유 집합 비교로 돌아가기", () => openDrawer("signatures"))
    );
    const inspected = new Map(
      inspectView(active().events, artifact.projection, state).map((item) => [
        item.eventId,
        item
      ])
    );
    for (const id of listedIds)
      $("drawer-body").append(
        eventRow(
          id,
          inspected
            .get(id)
            ?.reasons.map((reason) => omissionText[reason])
            .join(" · ") || "같은 사건으로 이동"
        )
      );
  }
}

function installControls() {
  for (const mode of ["A", "B0"] as const)
    $(mode === "A" ? "mode-a" : "mode-b0").onclick = () => {
      state = switchComparison(state, mode);
      commitView();
    };
  const zoom = (factor: number) => {
    state = {
      ...state,
      camera: {
        ...state.camera,
        spanX: Math.max(10, Math.min(1e7, state.camera.spanX * factor)),
        spanY: Math.max(10, Math.min(1e7, state.camera.spanY * factor))
      }
    };
    commitView();
  };
  $("zoom-in").onclick = () => zoom(0.7);
  $("zoom-out").onclick = () => zoom(1 / 0.7);
  $("fit").onclick = () => fit();
  $("search-open").onclick = () => {
    openDrawer("search");
    $("drawer").dataset.expanded = "true";
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>('[data-testid="search-input"]')
        ?.focus()
    );
  };
  $("signatures-open").onclick = () => openDrawer("signatures");
  $("details-open").onclick = $("limitation").onclick = () =>
    openDrawer("details");
  $("drawer-close").onclick = closeDrawer;
  $("drawer-expand").onclick = () => {
    const expanded = $("drawer").dataset.expanded !== "true";
    $("drawer").dataset.expanded = String(expanded);
    $("drawer-expand").setAttribute(
      "aria-label",
      expanded ? "상세 접기" : "상세 펼치기"
    );
  };
  let drawerStart: number | null = null;
  $("drawer-handle").onpointerdown = (event) => {
    drawerStart = event.clientY;
    if (event.isTrusted) $("drawer-handle").setPointerCapture(event.pointerId);
  };
  $("drawer-handle").onpointerup = (event) => {
    if (drawerStart !== null && Math.abs(event.clientY - drawerStart) > 25) {
      if (event.clientY < drawerStart) $("drawer").dataset.expanded = "true";
      else if ($("drawer").dataset.expanded === "true")
        $("drawer").dataset.expanded = "false";
      else closeDrawer();
    }
    drawerStart = null;
  };
  $("case-imjin").onclick = () => openCase(artifact.cases.imjin);
  $("case-yi").onclick = () => openCase(artifact.cases.yi);
  $("case-shared").onclick = () => {
    const shared = artifact.projection.leafMembers[
      artifact.cases.imjin
    ]!.filter((id) =>
      artifact.projection.ancestors[id]!.includes(artifact.cases.china)
    );
    const id =
      shared.find((id) => eventName(id).includes("왜교성")) ?? shared[0]!;
    focusEvent(id, true);
  };
  const dialog = $("collections-dialog") as HTMLDialogElement;
  $("collections-open").onclick = () => {
    dialog.showModal();
    $("collections-open").setAttribute("aria-expanded", "true");
  };
  const close = () => {
    dialog.close();
    $("collections-open").setAttribute("aria-expanded", "false");
    $("collections-open").focus();
  };
  $("collections-close").onclick = close;
  dialog.addEventListener("cancel", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        close();
    }
  });
  const allOn = () => {
    state = {
      ...state,
      activeCollectionIds: artifact.snapshot.collections.map((item) => item.id)
    };
    commitView();
  };
  $("collections-all-on").onclick = $("empty-restore").onclick = allOn;
  $("collections-all-off").onclick = () => {
    state = { ...state, activeCollectionIds: [] };
    commitView();
  };
  for (const collection of artifact.snapshot.collections) {
    const label = element("label", undefined, "collection-row");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.value = collection.id;
    checkbox.checked = true;
    checkbox.dataset.testid = `collection-${collection.id}`;
    checkbox.onchange = () => {
      state = {
        ...state,
        activeCollectionIds: checkbox.checked
          ? [...state.activeCollectionIds, collection.id]
          : state.activeCollectionIds.filter((id) => id !== collection.id)
      };
      commitView();
    };
    label.append(
      checkbox,
      element("span", collection.title),
      element("small", `${collection.eventIds.length}`)
    );
    $("collections-list").append(label);
  }
  let start: { x: number; y: number; id: number } | null = null;
  let moved = false;
  graph.addEventListener("pointerdown", (event) => {
    if (Object.keys(gesture.activePointers).length === 0) {
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      moved = false;
    } else moved = true;
    gesture = addLabPointer(gesture, event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
    if (event.isTrusted) graph.setPointerCapture(event.pointerId);
  });
  graph.addEventListener("pointermove", (event) => {
    if (!Object.hasOwn(gesture.activePointers, event.pointerId)) return;
    if (
      start &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    )
      moved = true;
    gesture = moveLabPointer(gesture, event.pointerId, {
      x: event.clientX,
      y: event.clientY
    });
    state = { ...state, camera: viewToCamera(gesture.view, size) };
    requestDraw();
  });
  const end = (event: PointerEvent) => {
    const clicked =
      event.type === "pointerup" && !moved && start?.id === event.pointerId;
    gesture = removeLabPointer(gesture, event.pointerId);
    if (Object.keys(gesture.activePointers).length === 0) start = null;
    if (clicked) {
      const candidates = renderedEventIds
        .map((id) => {
          const p = screen(eventsById().get(id)!);
          return {
            id,
            distance: Math.hypot(p.x - event.clientX, p.y - event.clientY)
          };
        })
        .filter((item) => item.distance <= 20)
        .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
      if (candidates[0]) focusEvent(candidates[0].id, false);
    }
  };
  graph.addEventListener("pointerup", end);
  graph.addEventListener("pointercancel", end);
  graph.addEventListener("lostpointercapture", end);
  const cancelContacts = () => {
    gesture = createLabGesture(state.camera, size);
    start = null;
    moved = true;
    drawerStart = null;
  };
  window.addEventListener("pagehide", cancelContacts);
  window.addEventListener("blur", cancelContacts);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelContacts();
  });
  graph.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = Math.exp(
        Math.max(-0.6, Math.min(0.6, event.deltaY * 0.0015))
      );
      const before = cameraToView(state.camera, size);
      const wx = (event.clientX - before.x) / before.scaleX;
      const wy = (event.clientY - before.y) / before.scaleY;
      const spanX = Math.max(10, Math.min(1e7, state.camera.spanX * factor));
      const spanY = Math.max(10, Math.min(1e7, state.camera.spanY * factor));
      state = {
        ...state,
        camera: {
          x: wx - ((event.clientX - size.width / 2) * spanX) / size.width,
          y: wy - ((event.clientY - size.height / 2) * spanY) / size.height,
          spanX,
          spanY
        }
      };
      resetGesture();
      requestDraw();
    },
    { passive: false }
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.open) closeDrawer();
  });
  new ResizeObserver(() => {
    size = { width: graph.clientWidth, height: graph.clientHeight };
    resetGesture();
    requestDraw();
  }).observe(graph);
}

async function sha256(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function freezeDeep(value: unknown): void {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
}
async function load() {
  const metadataResponse = await fetch("build.json", { cache: "no-store" });
  if (!metadataResponse.ok) throw Error("빌드 정보를 읽을 수 없습니다.");
  const metadata = (await metadataResponse.json()) as {
    sourceCommit: string;
    assets: Record<string, { sha256: string; bytes: number }>;
  };
  const response = await fetch("preview.json");
  if (!response.ok) throw Error("비교 자료를 읽을 수 없습니다.");
  const bytes = await response.arrayBuffer();
  const expected = metadata.assets["preview.json"];
  if (
    !expected ||
    expected.bytes !== bytes.byteLength ||
    expected.sha256 !== (await sha256(bytes))
  )
    throw Error("비교 자료 digest 불일치 · 표시를 중단했습니다.");
  artifact = JSON.parse(
    new TextDecoder().decode(bytes)
  ) as TstlComparisonArtifact;
  if (
    artifact.formatVersion !== "tstl-comparison/1" ||
    artifact.source.revision !== 56 ||
    artifact.projection.status !== "COMPLETE" ||
    artifact.snapshot.inputDigest !== artifact.source.inputDigest
  )
    throw Error("비교 자료 revision 또는 source 불일치");
  for (const layout of [artifact.b0, artifact.a]) {
    const sourceY = (event: TstlComparisonEvent) =>
      (event.sourceY - artifact.referenceFrame.sourceYOrigin) *
      artifact.referenceFrame.scale;
    if (
      layout.events.some(
        (event) =>
          !Number.isFinite(event.sourceY) || event.referenceY !== sourceY(event)
      )
    )
      throw Error("원본 시간 Y와 표시 anchor 불일치");
    const source = {
      regions: layout.regions,
      glyphs: layout.events.map((event) => ({
        eventId: event.eventId,
        support: event.support,
        anchor: { x: event.x, y: sourceY(event) }
      })),
      semanticFillEligible: false
    };
    const commands = validateTstlRenderCommands(
      source,
      layout.diagnosticRenderCommands
    );
    const bodyCommands = validateTstlRenderCommands(
      { ...source, regions: [] },
      layout.renderCommands
    );
    if (
      !commands.valid ||
      !bodyCommands.valid ||
      layout.diagnosticRenderCommands.regions.some(
        (region) => region.fill !== "none"
      ) ||
      layout.renderCommands.regions.length !== 0 ||
      layout.events.length !== 539 ||
      new Set(layout.events.map((event) => event.eventId)).size !== 539
    )
      throw Error("renderer 계약 또는 단일 Event 검증 실패");
    eventMaps.set(
      layout.id,
      new Map(layout.events.map((event) => [event.eventId, event]))
    );
    const eventMap = eventMaps.get(layout.id)!;
    contextBounds.set(
      layout.id,
      new Map(
        artifact.projection.compositeIds.map((id) => {
          const members = [
            id,
            ...(artifact.projection.descendants[id] ?? [])
          ].map((eventId) => eventMap.get(eventId)!);
          return [
            id,
            {
              minX: Math.min(...members.map((event) => event.support.minX)),
              maxX: Math.max(...members.map((event) => event.support.maxX)),
              minY: Math.min(...members.map((event) => event.support.minY)),
              maxY: Math.max(...members.map((event) => event.support.maxY))
            }
          ];
        })
      )
    );
  }
  const baselineEvents = eventMaps.get("B0")!;
  if (
    artifact.a.events.some(
      (event) =>
        event.sourceY !== baselineEvents.get(event.eventId)?.sourceY ||
        event.referenceY !== baselineEvents.get(event.eventId)?.referenceY
    )
  )
    throw Error("B0/A 시간 Y 불일치");
  freezeDeep(artifact);
  sourceCommit = metadata.sourceCommit;
  $("build").textContent =
    `독립 프리뷰 · source ${sourceCommit.slice(0, 8)} · 역사 r56 고정`;
  state = {
    mode: "A",
    camera: { x: 0, y: 2048, spanX: 1000, spanY: 5000 },
    selectedEventId: null,
    activeCollectionIds: artifact.snapshot.collections.map((item) => item.id),
    scopeCompositeIds: [
      artifact.cases.korea,
      artifact.cases.japan,
      artifact.cases.china
    ],
    collapsedPathKeys: [],
    shownEventIds: [],
    hiddenEventIds: []
  };
  ready = true;
  installControls();
  fit();
  updateControls();
}
Object.defineProperty(window, "moiraiTstl", {
  get: () =>
    ready
      ? {
          ready,
          selectedMode: state.mode,
          hashes: {
            A: artifact.a.canonicalHash,
            B0: artifact.b0.canonicalHash
          },
          camera: { ...state.camera },
          selectedEventId: state.selectedEventId,
          activeCollectionIds: [...state.activeCollectionIds],
          collapsedPathKeys: [...state.collapsedPathKeys],
          scopeCompositeIds: [...state.scopeCompositeIds],
          visibleIds: inspectView(active().events, artifact.projection, state)
            .filter((item) => item.visible)
            .map((item) => item.eventId),
          omitted: inspectView(
            active().events,
            artifact.projection,
            state
          ).filter((item) => !item.visible),
          signatureCounts: exactSignatureRows(
            artifact.projection,
            state.scopeCompositeIds
          ),
          renderCommands: active().renderCommands,
          diagnosticRenderCommands: active().diagnosticRenderCommands,
          renderedEventIds: [...renderedEventIds],
          renderedRegionIds: [...renderedRegionIds],
          labeledEventIds: [...labeledEventIds],
          semanticFillCount: active().renderCommands.regions.filter(
            (region) => region.fill === "semantic"
          ).length,
          temporalStatus: "legacy-scalar-only",
          sourceCommit,
          artifact,
          drawDurations: [...drawDurations]
        }
      : { ready: false }
});
void load().catch((error: unknown) => {
  $("status").textContent =
    error instanceof Error ? error.message : "자료를 불러오지 못했습니다.";
  $("status").style.color = "#934530";
});
