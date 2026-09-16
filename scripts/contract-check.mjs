import { spawnSync } from "node:child_process";

const steps = [
  [
    "schema lint",
    ["pnpm", "--filter", "@modular-mcp/contracts", "lint:schemas"],
  ],
  [
    "example validation",
    ["pnpm", "--filter", "@modular-mcp/contracts", "validate:examples"],
  ],
  ["generated types check", ["node", "scripts/contracts-generate-types.mjs"]],
  [
    "breaking-change check",
    ["pnpm", "--filter", "@modular-mcp/contracts", "breaking:check"],
  ],
];

for (const [name, command] of steps) {
  console.log(`\n==> contract ${name}`);
  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`contract check failed: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  "\ncontract check passed: schemas, examples, generated types, and baseline are current",
);
