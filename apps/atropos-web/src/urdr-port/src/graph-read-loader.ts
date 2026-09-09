import type {
  EventDetailResponse,
  GraphShellChartPlaneEntity,
  GraphShellViewportQuery,
  GraphShellViewportResponse,
  GraphShellWorkspaceShell,
} from "@urdr/contracts";

import type { AppLocale } from "./locale";

export type GraphReadLoader = {
  loadWorkspace(locale: AppLocale): Promise<GraphShellWorkspaceShell>;
  loadViewport(locale: AppLocale, query: GraphShellViewportQuery): Promise<GraphShellViewportResponse>;
  loadEventDetail(locale: AppLocale, eventId: string): Promise<EventDetailResponse>;
};

const CANON_ID = "canon:mock-joseon";

const point = (
  id: string,
  label: string,
  x: number,
  y: number,
  containedBy?: string,
): GraphShellChartPlaneEntity => ({
  id,
  eventId: id,
  canonId: CANON_ID,
  label,
  geometryKind: "point",
  validationState: "ok",
  contains: [],
  containedBy,
  diagnostics: [],
  viewportClass: "visible",
  position: { x, y },
});

const segment = (
  id: string,
  label: string,
  fromId: string,
  toId: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): GraphShellChartPlaneEntity => ({
  id,
  eventId: id,
  canonId: CANON_ID,
  label,
  geometryKind: "segment",
  validationState: "ok",
  contains: [fromId, toId],
  diagnostics: [],
  viewportClass: "visible",
  start,
  end,
});

const mockPoints = [
  point("event:founding", "조선 건국", -210, -250, "region:early-joseon"),
  point("event:capital", "한양 천도", 35, -175, "region:early-joseon"),
  point("event:hunmin", "훈민정음 창제", -105, -40, "region:early-joseon"),
  point("event:promulgation", "훈민정음 반포", 155, 38, "region:early-joseon"),
  point("event:sarim", "사림의 성장", -185, 155, "region:mid-joseon"),
  point("event:reform", "중종반정", 75, 235, "region:mid-joseon"),
  point("event:war", "임진왜란", 220, 355, "region:mid-joseon"),
  point("t_anchor_1392", "anchor 1392", -360, -250),
  point("t_anchor_1446", "anchor 1446", -360, 38),
  point("t_anchor_1592", "anchor 1592", -360, 355),
] satisfies GraphShellChartPlaneEntity[];

const mockSegments = [
  segment("edge:founding-capital", "ORDER", "event:founding", "event:capital", { x: -210, y: -250 }, { x: 35, y: -175 }),
  segment("edge:capital-hunmin", "CAUSES", "event:capital", "event:hunmin", { x: 35, y: -175 }, { x: -105, y: -40 }),
  segment("edge:hunmin-promulgation", "ORDER", "event:hunmin", "event:promulgation", { x: -105, y: -40 }, { x: 155, y: 38 }),
  segment("edge:promulgation-sarim", "INFLUENCES", "event:promulgation", "event:sarim", { x: 155, y: 38 }, { x: -185, y: 155 }),
  segment("edge:sarim-reform", "CAUSES", "event:sarim", "event:reform", { x: -185, y: 155 }, { x: 75, y: 235 }),
  segment("edge:reform-war", "ORDER", "event:reform", "event:war", { x: 75, y: 235 }, { x: 220, y: 355 }),
] satisfies GraphShellChartPlaneEntity[];

const mockRegions: GraphShellChartPlaneEntity[] = [
  {
    id: "region:early-joseon",
    eventId: "region:early-joseon",
    canonId: CANON_ID,
    label: "조선 전기",
    geometryKind: "region",
    validationState: "ok",
    contains: ["event:founding", "event:capital", "event:hunmin", "event:promulgation"],
    diagnostics: [],
    viewportClass: "visible",
    worldBounds: { minX: -260, minY: -300, maxX: 205, maxY: 88 },
  },
  {
    id: "region:mid-joseon",
    eventId: "region:mid-joseon",
    canonId: CANON_ID,
    label: "조선 중기",
    geometryKind: "region",
    validationState: "ok",
    contains: ["event:sarim", "event:reform", "event:war"],
    diagnostics: [],
    viewportClass: "visible",
    worldBounds: { minX: -235, minY: 105, maxX: 270, maxY: 405 },
  },
];

function createMockWorkspace(locale: AppLocale): GraphShellWorkspaceShell {
  const ko = locale === "ko";
  return {
    menuItems: [{ id: "global", label: ko ? "전체" : "Global", active: true }],
    tabs: [{
      id: "timeline:gregorian",
      label: ko ? "그레고리력" : "Gregorian",
      description: ko ? "MOCK 연표" : "MOCK timeline",
      availableCanonIds: [CANON_ID],
      defaultEnabledCanonIds: [CANON_ID],
      timeSystemId: "time:gregorian-historical",
      compatibilityKey: "gregorian-historical",
    }],
    canons: [{
      id: CANON_ID,
      label: ko ? "조선 왕조" : "Joseon Dynasty",
      worldId: "world:mock-history",
      worldLabel: ko ? "세계사" : "World History",
      timeSystemId: "time:gregorian-historical",
      timeSystemLabel: ko ? "그레고리력" : "Gregorian",
      compatibilityKey: "gregorian-historical",
    }],
    defaultTabId: "timeline:gregorian",
    buildRevision: "mock-urdr-graph-v1",
    chronologyBoard: {
      mode: "gregorian",
      axis: {
        scheme: "gregorian_utc",
        timeSystemId: "time:gregorian-historical",
        compatibilityKey: "gregorian-historical",
        startYear: 1388,
        endYear: 1598,
        tickYears: [1388, 1392, 1443, 1446, 1506, 1592, 1598],
      },
      columns: [],
      placements: [],
      unplaced: [],
    },
  };
}

function createMockEventDetail(eventId: string, locale: AppLocale): EventDetailResponse {
  const entity = mockPoints.find((candidate) => candidate.eventId === eventId);
  const title = entity?.label ?? eventId;
  return {
    id: eventId,
    canonId: CANON_ID,
    type: "historical-event",
    title,
    participantEventIds: [],
    figureHandleIds: [],
    notes: locale === "ko"
      ? `**MOCK 데이터** — ${title} 사건의 상세 설명입니다. 실제 URDR API 연결 전 렌더링 확인용입니다.`
      : `**MOCK data** — Render-only detail for ${title} before the URDR API is connected.`,
    contextEventIds: [],
    chronologySummary: locale === "ko" ? "조선 시대" : "Joseon period",
    placeEvents: [],
    people: [],
    causeEvents: [],
    resultEvents: [],
  };
}

// MOCK: the original URDR graph reads workspace, viewport, and event-detail
// documents from an API/static projection. This adapter intentionally returns
// render-only local data until the real Moirai integration is designed.
export const graphReadLoader: GraphReadLoader = {
  async loadWorkspace(locale) {
    return createMockWorkspace(locale);
  },
  async loadViewport() {
    return {
      revision: 1,
      canonicalRevision: 1,
      lodLevel: 0,
      entities: mockPoints,
      edges: mockSegments,
      regions: mockRegions,
      diagnostics: [],
      truncated: false,
      cache: { stale: false },
    };
  },
  async loadEventDetail(locale, eventId) {
    return createMockEventDetail(eventId, locale);
  },
};
