import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const allowedBuildDependencies = new Set(["esbuild"]);

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function collectPackageJsonFiles(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    files.push(join(directory, entry.name, "package.json"));
  }
  return files;
}

function isExactOrWorkspace(version) {
  return (
    /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) ||
    version.startsWith("workspace:") ||
    version.startsWith("file:")
  );
}

function checkDependencyVersions(path, manifest) {
  for (const field of dependencyFields) {
    const dependencies = manifest[field] ?? {};
    for (const [name, version] of Object.entries(dependencies)) {
      if (!isExactOrWorkspace(version)) {
        failures.push(
          `${path}: ${field}.${name} must be exact, workspace:, or file: (found ${version})`,
        );
      }
    }
  }
}

const rootPackage = await readJson("package.json");
if (rootPackage.packageManager !== "pnpm@12.4.1") {
  failures.push("package.json: packageManager must remain pnpm@12.4.1");
}
checkDependencyVersions("package.json", rootPackage);

for (const path of [
  ...(await collectPackageJsonFiles("apps")),
  ...(await collectPackageJsonFiles("packages")),
]) {
  checkDependencyVersions(path, await readJson(path));
}

const lockfile = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
if (!lockfile.includes("lockfileVersion:")) {
  failures.push("pnpm-lock.yaml: missing lockfileVersion");
}

const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
const allowedBuildMatches = [
  ...workspace.matchAll(/^\s{2}([@/A-Za-z0-9_.-]+):\s*true\s*$/gm),
].map((match) => match[1]);
for (const dependency of allowedBuildMatches) {
  if (!allowedBuildDependencies.has(dependency)) {
    failures.push(
      `pnpm-workspace.yaml: unreviewed build script allowlist entry ${dependency}`,
    );
  }
}
for (const dependency of allowedBuildDependencies) {
  if (!allowedBuildMatches.includes(dependency)) {
    failures.push(
      `pnpm-workspace.yaml: missing reviewed build script allowlist entry ${dependency}`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`dependency scan failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `dependency scan passed: ${relative(root, join(root, "pnpm-lock.yaml"))} and workspace manifests use pinned dependency policy`,
);
