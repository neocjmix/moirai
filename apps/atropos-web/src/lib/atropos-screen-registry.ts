export const ATROPOS_SCREEN_IDS = [
  "graph",
  "private",
  "explore",
  "settings",
  "operations"
] as const;

export type AtroposScreenId = (typeof ATROPOS_SCREEN_IDS)[number];

export interface AtroposScreenDefinition {
  readonly id: AtroposScreenId;
  readonly path: string;
  readonly primary_navigation: boolean;
  readonly availability: "available" | "unavailable" | "auth_gated_future";
  readonly label: { readonly ko: string; readonly en: string };
}

/**
 * App-level destinations only. Graph sources and filters belong to the top
 * query island and must never be added to this registry.
 */
export const ATROPOS_SCREEN_REGISTRY = [
  {
    id: "graph",
    path: "/graph",
    primary_navigation: true,
    availability: "available",
    label: { ko: "공개 그래프", en: "Public graph" }
  },
  {
    id: "private",
    path: "/graph/private",
    primary_navigation: true,
    availability: "unavailable",
    label: { ko: "프라이빗", en: "Private" }
  },
  {
    id: "explore",
    path: "/graph/explore",
    primary_navigation: true,
    availability: "unavailable",
    label: { ko: "탐색", en: "Explore" }
  },
  {
    id: "settings",
    path: "/graph/settings",
    primary_navigation: true,
    availability: "available",
    label: { ko: "설정", en: "Settings" }
  },
  {
    id: "operations",
    path: "/graph/operations",
    primary_navigation: false,
    availability: "auth_gated_future",
    label: { ko: "운영", en: "Operations" }
  }
] as const satisfies readonly AtroposScreenDefinition[];

export const ATROPOS_PRIMARY_SCREENS = ATROPOS_SCREEN_REGISTRY.filter(
  (screen) => screen.primary_navigation
);

export function getAtroposScreen(id: AtroposScreenId): AtroposScreenDefinition {
  return ATROPOS_SCREEN_REGISTRY.find((screen) => screen.id === id)!;
}

export function resolveAtroposScreen(pathname: string): AtroposScreenId | null {
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    ATROPOS_SCREEN_REGISTRY.find((screen) => screen.path === normalized)?.id ??
    null
  );
}
