"use client";

import { Theme } from "@radix-ui/themes";

import { App } from "../../urdr-port/src/App";

export default function GraphPage() {
  return (
    <Theme
      accentColor="gray"
      appearance="light"
      grayColor="sage"
      radius="large"
      scaling="100%"
    >
      <App />
    </Theme>
  );
}
