"use client";
import { App } from "../urdr-port/src/App";
import { graphReadLoader } from "../urdr-port/src/graph-read-loader";
import type { AtroposScreenId } from "../lib/atropos-screen-registry";
export default function UrdrDemoApp({
  initialScreen
}: {
  initialScreen: AtroposScreenId;
}) {
  return <App initialScreen={initialScreen} loader={graphReadLoader} />;
}
