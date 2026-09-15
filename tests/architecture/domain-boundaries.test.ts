import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const domainRoot = resolve(root, "packages/domain");
const domainSourceRoot = resolve(domainRoot, "src");
const appsRoot = resolve(root, "apps");
const packagesRoot = resolve(root, "packages");

const forbiddenWorkspaceImports = new Set([
  "@modular-mcp/authz",
  "@modular-mcp/data-access",
  "@modular-mcp/database",
  "@modular-mcp/module-builtins",
  "@modular-mcp/observability",
  "@modular-mcp/ui",
]);

const forbiddenRuntimeImports = [
  "@aws-sdk/",
  "@azure/",
  "@google-cloud/",
  "@opensearch-project/",
  "@prisma/",
  "@temporalio/",
  "aws-sdk",
  "ioredis",
  "kysely",
  "open-policy-agent",
  "prisma",
  "redis",
];

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectTypeScriptFiles(path);
      }
      return extname(path) === ".ts" ? [path] : [];
    }),
  );
  return files.flat();
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern =
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g;
  const exportPattern =
    /\bexport\s+(?:type\s+)?[^'"]*?\s+from\s+["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [importPattern, exportPattern, dynamicImportPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1] ?? "");
    }
  }
  return specifiers;
}

function isForbiddenRelativeImport(
  fromFile: string,
  specifier: string,
): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const target = normalize(resolve(dirname(fromFile), specifier));
  if (target.startsWith(appsRoot)) {
    return true;
  }
  if (target.startsWith(packagesRoot) && !target.startsWith(domainRoot)) {
    return true;
  }
  return false;
}

function isForbiddenBareImport(specifier: string): boolean {
  if (forbiddenWorkspaceImports.has(specifier)) {
    return true;
  }
  if (
    [...forbiddenWorkspaceImports].some((prefix) =>
      specifier.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }
  return forbiddenRuntimeImports.some(
    (forbidden) => specifier === forbidden || specifier.startsWith(forbidden),
  );
}

describe("domain architecture boundary", () => {
  it("does not import apps or infrastructure packages", async () => {
    const violations: string[] = [];
    const files = await collectTypeScriptFiles(domainSourceRoot);

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const specifier of extractImportSpecifiers(source)) {
        if (
          isForbiddenRelativeImport(file, specifier) ||
          isForbiddenBareImport(specifier)
        ) {
          violations.push(
            `${file.replace(`${root}/`, "")} imports ${specifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
