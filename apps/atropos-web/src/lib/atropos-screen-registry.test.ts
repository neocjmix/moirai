import { describe, expect, it } from "vitest";

import {
  ATROPOS_PRIMARY_SCREENS,
  ATROPOS_SCREEN_REGISTRY,
  getAtroposScreen,
  resolveAtroposScreen
} from "./atropos-screen-registry.js";

describe("Atropos app screen registry", () => {
  it("keeps graph queries out of app-level navigation", () => {
    expect(ATROPOS_PRIMARY_SCREENS.map((screen) => screen.id)).toEqual([
      "graph",
      "private",
      "explore",
      "settings"
    ]);
    expect(JSON.stringify(ATROPOS_SCREEN_REGISTRY)).not.toMatch(
      /time_system|world_id|canon_id|relation_filter/
    );
  });

  it("resolves reloadable graph screen paths", () => {
    expect(resolveAtroposScreen("/graph")).toBe("graph");
    expect(resolveAtroposScreen("/graph/private/")).toBe("private");
    expect(resolveAtroposScreen("/graph/explore")).toBe("explore");
    expect(resolveAtroposScreen("/graph/settings")).toBe("settings");
    expect(resolveAtroposScreen("/graph/unknown")).toBeNull();
  });

  it("reserves Operations without exposing it as a working destination", () => {
    expect(getAtroposScreen("operations")).toMatchObject({
      primary_navigation: false,
      availability: "auth_gated_future"
    });
    expect(getAtroposScreen("private").availability).toBe("unavailable");
    expect(getAtroposScreen("explore").availability).toBe("unavailable");
  });
});
