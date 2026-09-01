import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import ts from "typescript";

const root = process.cwd();
const packages = new Map<string, string>();
for (const base of ["apps", "packages", "skills"])
  for (const dir of readdirSync(base)) {
    try {
      const pkg = JSON.parse(
        readFileSync(`${base}/${dir}/package.json`, "utf8")
      ) as { name: string };
      packages.set(pkg.name, `${base}/${dir}`);
    } catch {
      /* Not a workspace package. */
    }
  }
function target(from: string, spec: string): string {
  if (spec.startsWith("."))
    return relative(root, resolve(dirname(resolve(root, from)), spec));
  for (const [name, path] of packages)
    if (spec === name || spec.startsWith(`${name}/`))
      return `${path}${spec.slice(name.length)}/`;
  return spec;
}
function forbidden(from: string, to: string): boolean {
  if (from.startsWith("packages/clotho-application/"))
    return (
      /^(packages\/(persistence|publication)|apps\/|skills\/|fastify|jose|@modelcontextprotocol|pg(?:\/|$)|kysely)/.test(
        to
      ) || /packages\/lachesis\/(?:src\/)?database(?:[./]|$)/.test(to)
    );
  if (from.startsWith("packages/lachesis/"))
    return (
      /^(packages\/clotho-application|apps\/|skills\/|fastify|jose|@modelcontextprotocol)/.test(
        to
      ) ||
      (from !== "packages/lachesis/src/database.ts" &&
        to.startsWith("packages/persistence/"))
    );
  if (
    from.startsWith("apps/clotho-api/") &&
    from !== "apps/clotho-api/src/app.ts"
  )
    return (
      to.startsWith("packages/persistence/") ||
      /packages\/lachesis\/(?:src\/)?database(?:[./]|$)/.test(to)
    );
  return false;
}
const failures: string[] = [];
function scan(dir: string): void {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) {
      if (!["node_modules", "dist", ".next"].includes(item.name)) scan(path);
      continue;
    }
    if (!/\.tsx?$/.test(path) || /\.test\.tsx?$/.test(path)) continue;
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );
    function check(spec: string) {
      if (forbidden(path, target(path, spec)))
        failures.push(`${path} -> ${spec}`);
    }
    function visit(node: ts.Node): void {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        check(node.moduleSpecifier.text);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) check(arg.text);
        else failures.push(`${path}: computed module loading is not allowed`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
for (const dir of [
  "apps/clotho-api/src",
  "packages/clotho-application/src",
  "packages/lachesis/src"
])
  scan(dir);
for (const name of ["@moirai/clotho-application"]) {
  const path = packages.get(name)!;
  const pkg = JSON.parse(readFileSync(`${path}/package.json`, "utf8")) as {
    dependencies: Record<string, string>;
  };
  for (const dep of Object.keys(pkg.dependencies))
    if (forbidden(`${path}/package.json`, target(`${path}/package.json`, dep)))
      failures.push(`${path}/package.json -> ${dep}`);
}
if (failures.length)
  throw new Error(`Architecture boundary violations:\n${failures.join("\n")}`);
process.stdout.write("Clotho/Lachesis dependency boundaries passed\n");
