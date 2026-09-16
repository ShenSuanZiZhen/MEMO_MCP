import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const allowlistPath = ".secret-scan-allowlist.json";
const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".env",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".rego",
  ".sh",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
const ignoredFiles = new Set(["pnpm-lock.yaml"]);
const patterns = [
  {
    id: "aws-access-key-id",
    regex: /\bA(?:KIA|SIA)[A-Z0-9]{16}\b/g,
  },
  {
    id: "github-token",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
  },
  {
    id: "openai-api-key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    id: "slack-token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    id: "private-key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
];

async function readAllowlist() {
  const config = JSON.parse(await readFile(join(root, allowlistPath), "utf8"));
  return new Set(
    (config.allowedFindings ?? []).map(
      (finding) =>
        `${finding.path}\0${finding.pattern}\0${finding.secretSha256}`,
    ),
  );
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const rel = relative(root, path).split(sep).join("/");
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await collectFiles(path)));
      }
      continue;
    }
    if (ignoredFiles.has(rel)) {
      continue;
    }
    if (textExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

function hashSecret(secret) {
  return createHash("sha256").update(secret).digest("hex");
}

function lineForOffset(contents, offset) {
  return contents.slice(0, offset).split("\n").length;
}

function isAllowlisted(allowlist, path, pattern, secret) {
  return allowlist.has(`${path}\0${pattern}\0${hashSecret(secret)}`);
}

const allowlist = await readAllowlist();
const findings = [];

for (const file of await collectFiles(root)) {
  const rel = relative(root, file).split(sep).join("/");
  const contents = await readFile(file, "utf8");
  if (contents.includes("\0")) {
    continue;
  }

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(contents)) !== null) {
      const secret = match[0];
      if (isAllowlisted(allowlist, rel, pattern.id, secret)) {
        continue;
      }
      findings.push({
        path: rel,
        line: lineForOffset(contents, match.index),
        pattern: pattern.id,
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `secret scan failed: ${finding.path}:${finding.line} matched ${finding.pattern}`,
    );
  }
  process.exit(1);
}

console.log("secret scan passed: no unallowlisted secret patterns found");
