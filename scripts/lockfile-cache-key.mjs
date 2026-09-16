import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const lockfilePath = resolve(process.argv[2] ?? "pnpm-lock.yaml");
const contents = await readFile(lockfilePath);
const digest = createHash("sha256").update(contents).digest("hex");

console.log(`pnpm-${basename(lockfilePath)}-${digest}`);
