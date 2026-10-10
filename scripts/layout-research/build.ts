/** Static Pages build: no production build, database, publication or network writes. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFixtureState, snapshotFromState } from "./fixtures.js";
import { validateLabSnapshot } from "../../apps/atropos-web/src/labs/layout/snapshot-validation.js";
const root = process.cwd(),
  source = resolve(root, "scripts/layout-research"),
  out = resolve(process.argv[2] ?? ".artifacts/layout-pages");
mkdirSync(resolve(out, "data"), { recursive: true });
for (const mode of ["changing", "independent", "dense-shared"] as const) {
  const snapshot = validateLabSnapshot(
    snapshotFromState(createFixtureState(mode))
  );
  writeFileSync(resolve(out, "data", mode + ".json"), JSON.stringify(snapshot));
}
writeFileSync(
  resolve(out, "data/changing-updated.json"),
  JSON.stringify(
    validateLabSnapshot(snapshotFromState(createFixtureState("changing", true)))
  )
);
const real = validateLabSnapshot(
  JSON.parse(readFileSync(resolve(source, "data/history-r56.json"), "utf8"))
);
writeFileSync(resolve(out, "data/history-r56.json"), JSON.stringify(real));
for (const name of ["index.html", "style.css"])
  copyFileSync(resolve(source, name), resolve(out, name));
for (const name of ["app", "worker"])
  execFileSync(
    resolve(root, "node_modules/.pnpm/node_modules/esbuild/bin/esbuild"),
    [
      resolve(source, name + ".ts"),
      "--bundle",
      "--format=esm",
      "--target=es2022",
      "--minify",
      "--tsconfig=" + resolve(root, "tsconfig.json"),
      "--outfile=" + resolve(out, name + ".js")
    ],
    { stdio: "inherit" }
  );
writeFileSync(resolve(out, ".nojekyll"), "");
writeFileSync(
  resolve(out, "build.json"),
  JSON.stringify({
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8"
    }).trim(),
    builtAt: new Date().toISOString(),
    engineVersion: "research-incidence/2",
    historyRevision: 56
  })
);
for (const file of ["review.md", "measurements.json"])
  try {
    copyFileSync(
      file === "review.md"
        ? resolve(
            root,
            "docs/evidence/ip013/collection-layout-experiment-v2.md"
          )
        : resolve(source, file),
      resolve(out, file)
    );
  } catch {
    /* Created by the verification phase; deploy check requires both. */
  }
console.log("Static research build:", out);
mkdirSync(resolve(out, "collection-layout-v2"), { recursive: true });
for (const image of ["overview.png", "contact.png", "history.png"])
  try {
    copyFileSync(
      resolve(root, "docs/evidence/ip013/collection-layout-v2", image),
      resolve(out, "collection-layout-v2", image)
    );
  } catch {
    /* Capture evidence is supplied before deployment. */
  }
