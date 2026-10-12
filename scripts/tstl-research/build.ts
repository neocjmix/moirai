/** Independent static preview build. No database, production or pointer writes. */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HISTORY_FIXTURE_PATH,
  loadHistorySnapshot,
  replayBaseline,
  sha256
} from "./baseline.js";
import { buildTstlComparison } from "./candidate.js";

const root = process.cwd();
const source = resolve(root, "scripts/tstl-research");
const out = resolve(process.argv[2] ?? ".artifacts/tstl-preview");
if (out === root || out === source)
  throw Error("Build output must be a separate artifact directory");
mkdirSync(resolve(out, "data"), { recursive: true });
const snapshot = loadHistorySnapshot();
const baseline = replayBaseline(snapshot);
const comparison = buildTstlComparison(snapshot, baseline.artifact);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();
const builtAt = new Date().toISOString();
const writeJson = (name: string, data: unknown) =>
  writeFileSync(resolve(out, name), JSON.stringify(data) + "\n");

writeJson("preview.json", comparison.artifact);
writeJson("measurements.json", {
  sourceCommit,
  builtAt,
  baseline: baseline.measurements,
  candidate: comparison.measurements,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    peakRssBytes: process.resourceUsage().maxRSS * 1024
  },
  scope: "Offline static artifact generation; no browser or real-device claim"
});
copyFileSync(
  resolve(root, HISTORY_FIXTURE_PATH),
  resolve(out, "data/history-r56.json")
);
copyFileSync(
  resolve(source, "evidence/b0-validation.json"),
  resolve(out, "b0-validation.json")
);
for (const name of ["index.html", "style.css"])
  copyFileSync(resolve(source, name), resolve(out, name));
execFileSync(
  resolve(root, "node_modules/.pnpm/node_modules/esbuild/bin/esbuild"),
  [
    resolve(source, "app.ts"),
    "--bundle",
    "--format=esm",
    "--target=es2022",
    "--minify",
    "--tsconfig=" + resolve(root, "tsconfig.json"),
    "--outfile=" + resolve(out, "app.js")
  ],
  { stdio: "inherit" }
);
const names = [
  "index.html",
  "style.css",
  "app.js",
  "preview.json",
  "data/history-r56.json",
  "b0-validation.json",
  "measurements.json"
];
const assets = Object.fromEntries(
  names.map((name) => {
    const bytes = readFileSync(resolve(out, name));
    return [name, { sha256: sha256(bytes), bytes: bytes.length }];
  })
);
writeJson("build.json", {
  formatVersion: "tstl-preview-build/1",
  sourceCommit,
  builtAt,
  historyRevision: snapshot.sourceRevision,
  worldId: snapshot.worldId,
  sourceRootDigest: snapshot.sourceRootDigest,
  temporalStatus: "legacy-scalar-only",
  assets
});
writeJson("health.json", {
  status: "ok",
  surface: "static-isolated-preview",
  sourceCommit,
  historyRevision: snapshot.sourceRevision,
  previewSha256: assets["preview.json"]!.sha256
});
writeFileSync(resolve(out, ".nojekyll"), "");
console.log(JSON.stringify({ output: out, sourceCommit, assets }, null, 2));
