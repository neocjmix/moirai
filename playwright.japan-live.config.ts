import { defineConfig } from "@playwright/test";
import base from "./playwright.imjin-live.config";

export default defineConfig({
  ...base,
  testMatch: "japan.spec.ts",
  outputDir: "test-results/japan-live"
});
