// Next.js adapter: this keeps the copied URDR UI imports stable without
// importing URDR's server-side domain package.
export {
  buildGraphShellAbsoluteUrl,
  GRAPH_SHELL_URL_PARAM_CANONS,
  GRAPH_SHELL_URL_PARAM_EVENT,
  GRAPH_SHELL_URL_PARAM_STAGE,
  GRAPH_SHELL_URL_PARAM_TIMELINE,
  type GraphShellAbsoluteUrlPatch,
  type GraphShellDrawerStage,
  type GraphShellShareLinkDrawerSlice,
  type GraphShellShareLinkShellSlice,
} from "./domain/graph-shell-share-link";

export type ChartPlaneXForceLayoutOptions = {
  iterations: number;
  repulsion: number;
  causesAttraction: number;
  temporalAttraction: number;
  maxStep: number;
};
