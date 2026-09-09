export const GRAPH_SHELL_URL_PARAM_TIMELINE = "gsTimeline";
export const GRAPH_SHELL_URL_PARAM_CANONS = "gsCanons";
export const GRAPH_SHELL_URL_PARAM_EVENT = "gsEvent";
export const GRAPH_SHELL_URL_PARAM_STAGE = "gsStage";

export type GraphShellDrawerStage = "peek" | "full";

export type GraphShellShareLinkShellSlice = {
  selectedTimelineId: string;
  enabledCanonIds: string[];
};

export type GraphShellShareLinkDrawerSlice = {
  eventId: string;
  stage: GraphShellDrawerStage;
};

export type GraphShellAbsoluteUrlPatch = {
  shell?: GraphShellShareLinkShellSlice | null;
  drawer?: GraphShellShareLinkDrawerSlice | null;
};

export function buildGraphShellAbsoluteUrl(baseUrl: string | URL, patch: GraphShellAbsoluteUrlPatch): string {
  const url = new URL(baseUrl.toString());

  if (patch.shell !== undefined) {
    url.searchParams.delete(GRAPH_SHELL_URL_PARAM_TIMELINE);
    url.searchParams.delete(GRAPH_SHELL_URL_PARAM_CANONS);

    if (patch.shell) {
      url.searchParams.set(GRAPH_SHELL_URL_PARAM_TIMELINE, patch.shell.selectedTimelineId);
      url.searchParams.set(GRAPH_SHELL_URL_PARAM_CANONS, patch.shell.enabledCanonIds.join(","));
    }
  }

  if (patch.drawer !== undefined) {
    url.searchParams.delete(GRAPH_SHELL_URL_PARAM_EVENT);
    url.searchParams.delete(GRAPH_SHELL_URL_PARAM_STAGE);

    if (patch.drawer) {
      url.searchParams.set(GRAPH_SHELL_URL_PARAM_EVENT, patch.drawer.eventId);
      url.searchParams.set(GRAPH_SHELL_URL_PARAM_STAGE, patch.drawer.stage);
    }
  }

  return url.toString();
}
