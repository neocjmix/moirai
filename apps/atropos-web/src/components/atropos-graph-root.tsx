"use client";

import { Theme } from "@radix-ui/themes";

import type { MoiraiGraphUrlState } from "@moirai/contracts";

import type { AtroposScreenId } from "../lib/atropos-screen-registry";
import { App } from "../urdr-port/src/App";
import { GraphQueryProvider } from "./graph-query-context";

export function AtroposGraphRoot({
  initialScreen,
  initialGraphQuery
}: Readonly<{
  initialScreen: AtroposScreenId;
  initialGraphQuery: MoiraiGraphUrlState;
}>) {
  return (
    <GraphQueryProvider initialState={initialGraphQuery}>
      <Theme
        accentColor="gray"
        appearance="light"
        grayColor="sage"
        radius="large"
        scaling="100%"
      >
        <App initialScreen={initialScreen} />
      </Theme>
    </GraphQueryProvider>
  );
}
