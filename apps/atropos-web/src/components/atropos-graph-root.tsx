"use client";

import { Theme } from "@radix-ui/themes";

import type { AtroposScreenId } from "../lib/atropos-screen-registry";
import { App } from "../urdr-port/src/App";

export function AtroposGraphRoot({
  initialScreen
}: Readonly<{ initialScreen: AtroposScreenId }>) {
  return (
    <Theme
      accentColor="gray"
      appearance="light"
      grayColor="sage"
      radius="large"
      scaling="100%"
    >
      <App initialScreen={initialScreen} />
    </Theme>
  );
}
