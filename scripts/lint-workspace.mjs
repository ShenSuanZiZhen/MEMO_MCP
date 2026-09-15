import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const expectedPackageNames = [
  "@modular-mcp/web",
  "@modular-mcp/control-api",
  "@modular-mcp/mcp-gateway",
  "@modular-mcp/workers",
  "@modular-mcp/contracts",
  "@modular-mcp/domain",
  "@modular-mcp/database",
  "@modular-mcp/authz",
  "@modular-mcp/definition",
  "@modular-mcp/module-sdk",
  "@modular-mcp/module-builtins",
  "@modular-mcp/data-access",
  "@modular-mcp/observability",
  "@modular-mcp/test-fixtures",
  "@modular-mcp/ui",
];

const failures = [];

async function readJson(path) {
  const contents = await readFile(join(root, path), "utf8");
  return JSON.parse(contents);
}

const rootPackage = await readJson("package.json");
if (rootPackage.packageManager !== "pnpm@12.4.1") {
  failures.push("root packageManager must be pnpm@12.4.1");
}

if (!rootPackage.engines || rootPackage.engines.node !== ">=22 <23") {
  failures.push("root engines.node must pin the Node 22 line");
}

for (const packageName of expectedPackageNames) {
  const [, name] = packageName.split("/");
  const path = packageName.startsWith("@modular-mcp/web")
    ? "apps/web/package.json"
    : packageName.startsWith("@modular-mcp/control-api")
      ? "apps/control-api/package.json"
      : packageName.startsWith("@modular-mcp/mcp-gateway")
        ? "apps/mcp-gateway/package.json"
        : packageName.startsWith("@modular-mcp/workers")
          ? "apps/workers/package.json"
          : `packages/${name}/package.json`;
  const workspacePackage = await readJson(path);
  if (workspacePackage.name !== packageName) {
    failures.push(`${path} must be named ${packageName}`);
  }
  if (workspacePackage.private !== true) {
    failures.push(`${path} must stay private until publishing is reviewed`);
  }
  if (workspacePackage.type !== "module") {
    failures.push(`${path} must use ESM`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`lint failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `lint passed: ${expectedPackageNames.length} workspace package manifests checked`,
);
