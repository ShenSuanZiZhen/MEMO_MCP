import { spawnSync } from "node:child_process";

const steps = [
  ["format", ["pnpm", "format"]],
  ["lint", ["pnpm", "lint"]],
  ["typecheck", ["pnpm", "typecheck"]],
  ["unit", ["pnpm", "test:unit"]],
  ["contract", ["pnpm", "test:contract"]],
  ["build", ["pnpm", "build"]],
  ["dependency scan", ["pnpm", "dependency:scan"]],
  ["secret scan", ["pnpm", "secret:scan"]],
];

for (const [name, command] of steps) {
  console.log(`\n==> ${name}`);
  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`CI step failed: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nLocal CI reproduction passed.");
