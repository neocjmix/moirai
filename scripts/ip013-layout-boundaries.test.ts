import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const app = "apps/atropos-web/src";
function sourceFiles(base: string): string[] {
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const path = `${base}/${entry.name}`;
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path)
        ? [path]
        : [];
  });
}
function imports(path: string): { spec: string; names: string[] }[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const dependencies: { spec: string; names: string[] }[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if (node.importClause?.isTypeOnly) return;
      const bindings = node.importClause?.namedBindings;
      const names =
        bindings && ts.isNamedImports(bindings)
          ? bindings.elements
              .filter((item) => !item.isTypeOnly)
              .map((item) => item.propertyName?.text ?? item.name.text)
          : [];
      if (
        bindings &&
        ts.isNamedImports(bindings) &&
        !names.length &&
        !node.importClause?.name
      )
        return;
      dependencies.push({ spec: node.moduleSpecifier.text, names });
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const names =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements
              .filter((item) => !item.isTypeOnly)
              .map((item) => item.propertyName?.text ?? item.name.text)
          : [];
      if (
        node.exportClause &&
        ts.isNamedExports(node.exportClause) &&
        !names.length
      )
        return;
      dependencies.push({ spec: node.moduleSpecifier.text, names });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteral(argument))
        throw Error(`${path}: computed module loading cannot be verified`);
      dependencies.push({ spec: argument.text, names: [] });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return dependencies;
}
function target(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("."))
    base = resolve(dirname(from), spec.replace(/\.js$/, ""));
  else if (spec === "@urdr/contracts")
    base = resolve(app, "urdr-port/shared/contracts/index");
  else if (spec === "@urdr/domain")
    base = resolve(app, "urdr-port/shared/domain-bridge");
  else if (spec.startsWith("@moirai/")) {
    const [, name, subpath] = spec.split("/");
    const directory = `packages/${name}`;
    const manifest = JSON.parse(
      readFileSync(`${directory}/package.json`, "utf8")
    ) as { exports: Record<string, { types: string }> };
    const entry = manifest.exports[subpath ? `./${subpath}` : "."];
    if (!entry) throw Error(`Unresolved workspace dependency ${spec}`);
    base = resolve(directory, entry.types);
  } else return null;
  if (/\.(css|json)$/.test(base)) return null;
  const found = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`
  ].find((path) => existsSync(path) && /\.tsx?$/.test(path));
  if (!found) throw Error(`Unresolved local dependency ${from} -> ${spec}`);
  return found;
}
function walk(
  entries: string[],
  check: (path: string, spec: string) => void
): Set<string> {
  const seen = new Set<string>();
  const visit = (path: string) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const { spec } of imports(path)) {
      check(relative(root, path), spec);
      const dependency = target(path, spec);
      if (dependency) visit(dependency);
    }
  };
  entries.forEach((path) => visit(resolve(path)));
  return seen;
}

describe("IP-013 research isolation", () => {
  it("keeps the complete production browser renderer import closure outside Lab and runtime layout", () => {
    const seen = walk(
      [
        `${app}/components/v5-atropos-root.tsx`,
        `${app}/urdr-port/src/components/graph-shell.tsx`
      ],
      (path, spec) => {
        expect(`${path} -> ${spec}`).not.toMatch(
          /\/labs\/|layout-lab|layout-engine|v5-world-layout|urdr-chart-plane|semantic-layout/
        );
        expect(spec).not.toBe("@moirai/graph-presentation/server");
      }
    );
    expect(seen.size).toBeGreaterThan(30);
  });
  it("prevents normal production source from directly importing the experimental surface or computation", () => {
    const production = sourceFiles(app).filter(
      (path) => !path.includes("/labs/")
    );
    for (const path of production)
      for (const { spec, names } of imports(path)) {
        expect(`${path} -> ${spec}`).not.toMatch(
          /\/labs\/|layout-lab|layout-engine|v5-world-layout|urdr-chart-plane|semantic-layout/
        );
        expect(names).not.toContain("computeLayout");
        expect(names).not.toContain("prepareV5LayoutInput");
        expect(names).not.toContain("buildV5WorldLayout");
      }
  });
  it("keeps Lab browser controls free from server adapters, projection, publication and canonical writers", () => {
    const seen = walk([`${app}/labs/layout/layout-lab.tsx`], (path, spec) => {
      expect(`${path} -> ${spec}`).not.toMatch(
        /load-snapshot|\/fixtures|\/server|node:|@moirai\/(?:publication|projections|persistence|lachesis|clotho|domain)/
      );
    });
    expect(
      [...seen].some((path) =>
        path.endsWith("graph-presentation/src/layout-engine.ts")
      )
    ).toBe(true);
  });
  it("restricts the snapshot adapter to read and preparation operations", () => {
    const path = `${app}/labs/layout/load-snapshot.ts`;
    for (const { spec, names } of imports(path)) {
      expect(spec).not.toMatch(/@moirai\/(?:persistence|lachesis|clotho)/);
      if (spec === "@moirai/graph-presentation/server")
        expect(names).toEqual(["prepareV5LayoutInput"]);
      if (spec === "@moirai/publication/v5")
        expect(names.sort()).toEqual([
          "readV5ServedRoot",
          "readV5StagedDocument"
        ]);
    }
    const route = readFileSync(
      `${app}/app/labs/layout/snapshot/route.ts`,
      "utf8"
    );
    expect(route).toMatch(/export async function GET/);
    expect(route).not.toMatch(
      /export (?:async )?function (?:POST|PUT|PATCH|DELETE)/
    );
  });
});
