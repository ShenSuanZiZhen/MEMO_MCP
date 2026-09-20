import type {
  ModuleType,
  TypedModuleManifest,
} from "../../packages/module-sdk/src/index.js";

const limits = {
  requestsPerMinute: 60,
  maxConcurrency: 5,
  timeoutMs: 15000,
  maxResults: 10,
  maxSections: 5,
  maxResponseBytes: 65536,
} as const;

const permissionsByType = {
  source: ["data:read"],
  capability: ["tool:provide"],
  output: ["output:guard"],
  prompt: ["prompt:compose"],
} as const;

const providePrefixByType = {
  source: "source.",
  capability: "tool.",
  output: "output.",
  prompt: "prompt.",
} as const;

function digest(seed: string): string {
  return `sha256:${seed.repeat(64).slice(0, 64)}`;
}

export function manifest(input: {
  readonly id: string;
  readonly version?: string;
  readonly type: ModuleType;
  readonly provides?: readonly string[];
  readonly requires?: readonly string[];
  readonly conflicts?: readonly string[];
  readonly risk?: TypedModuleManifest["risk"];
  readonly digestSeed?: string;
}): TypedModuleManifest {
  const version = input.version ?? "1.0.0";
  const slug = input.id.split(".")[1] ?? input.id;
  const artifactDigest = digest(input.digestSeed ?? slug[0] ?? "a");
  return {
    id: input.id,
    version,
    type: input.type,
    apiVersion: "studio.mcp/v1",
    implementation: `builtin:${slug}@${artifactDigest}`,
    requires: [...(input.requires ?? [])],
    conflicts: [...(input.conflicts ?? [])],
    provides: [
      ...(input.provides ?? [`${providePrefixByType[input.type]}${slug}`]),
    ],
    permissions: [...permissionsByType[input.type]],
    risk: input.risk ?? "low",
    limits,
    artifactDigest,
    signature: {
      keyId: "platform-root-1",
      value: `sig_synthetic_${slug.replaceAll("-", "_")}_0000000000000000`,
    },
  } as TypedModuleManifest;
}

export const graphFixtures = {
  sourceDocuments: manifest({
    id: "source.documents",
    type: "source",
    provides: ["source.documents"],
    digestSeed: "a",
  }),
  sourceDocumentsV2: manifest({
    id: "source.documents",
    version: "2.0.0",
    type: "source",
    provides: ["source.documents"],
    digestSeed: "b",
  }),
  sourceLive: manifest({
    id: "source.live",
    type: "source",
    provides: ["source.live"],
    conflicts: ["source.documents"],
    digestSeed: "c",
  }),
  capabilityIndex: manifest({
    id: "capability.index",
    type: "capability",
    provides: ["tool.index"],
    requires: ["source.documents@1.0.0"],
    digestSeed: "d",
  }),
  capabilitySearch: manifest({
    id: "capability.search",
    type: "capability",
    provides: ["tool.search"],
    requires: ["capability.index@1.0.0"],
    digestSeed: "e",
  }),
  capabilitySearchV2: manifest({
    id: "capability.search-v2",
    type: "capability",
    provides: ["tool.search_v2"],
    requires: ["source.documents@2.0.0"],
    digestSeed: "f",
  }),
  outputCitations: manifest({
    id: "output.citations",
    type: "output",
    provides: ["output.citations"],
    requires: ["capability.search@1.0.0"],
    conflicts: ["source.live"],
    digestSeed: "1",
  }),
  outputSafeCitations: manifest({
    id: "output.safe-citations",
    type: "output",
    provides: ["output.citations"],
    requires: ["capability.search@1.0.0"],
    digestSeed: "2",
  }),
  promptAnswer: manifest({
    id: "prompt.answer",
    type: "prompt",
    provides: ["prompt.answer"],
    requires: ["capability.search@1.0.0", "output.citations@1.0.0"],
    digestSeed: "3",
  }),
  cycleA: manifest({
    id: "capability.cycle-a",
    type: "capability",
    requires: ["capability.cycle-b@1.0.0"],
    digestSeed: "4",
  }),
  cycleB: manifest({
    id: "capability.cycle-b",
    type: "capability",
    requires: ["capability.cycle-a@1.0.0"],
    digestSeed: "5",
  }),
  needsMissing: manifest({
    id: "capability.needs-missing",
    type: "capability",
    requires: ["source.missing@1.0.0"],
    digestSeed: "6",
  }),
  needsSourceV2: manifest({
    id: "capability.needs-v2",
    type: "capability",
    requires: ["source.documents@2.0.0"],
    digestSeed: "7",
  }),
  outputHighRisk: manifest({
    id: "output.high-risk",
    type: "output",
    provides: ["output.high_risk"],
    risk: "high",
    digestSeed: "8",
  }),
  needsHighRisk: manifest({
    id: "capability.needs-high-risk",
    type: "capability",
    requires: ["output.high-risk@1.0.0"],
    digestSeed: "9",
  }),
  mediumNeedsHighRisk: manifest({
    id: "capability.medium-high",
    type: "capability",
    provides: ["tool.medium_high"],
    requires: ["output.high-risk@1.0.0"],
    risk: "medium",
    digestSeed: "0",
  }),
  rootNeedsMediumHighRisk: manifest({
    id: "prompt.root-high",
    type: "prompt",
    provides: ["prompt.root_high"],
    requires: ["capability.medium-high@1.0.0"],
    digestSeed: "a1",
  }),
  mediumNeedsMissing: manifest({
    id: "capability.medium-missing",
    type: "capability",
    provides: ["tool.medium_missing"],
    requires: ["source.missing@1.0.0"],
    risk: "medium",
    digestSeed: "b1",
  }),
  rootNeedsMediumMissing: manifest({
    id: "prompt.root-missing",
    type: "prompt",
    provides: ["prompt.root_missing"],
    requires: ["capability.medium-missing@1.0.0"],
    digestSeed: "c1",
  }),
  rootVersionConflict: manifest({
    id: "prompt.version-conflict",
    type: "prompt",
    provides: ["prompt.version_conflict"],
    requires: ["capability.search@1.0.0", "capability.search-v2@1.0.0"],
    digestSeed: "d1",
  }),
  capabilityKeep: manifest({
    id: "capability.keep",
    type: "capability",
    provides: ["tool.keep"],
    digestSeed: "e1",
  }),
  outputConflictOld: manifest({
    id: "output.conflict-old",
    type: "output",
    provides: ["output.alt"],
    conflicts: ["capability.keep"],
    digestSeed: "f1",
  }),
  outputConflictNew: manifest({
    id: "output.conflict-new",
    type: "output",
    provides: ["output.alt"],
    digestSeed: "a2",
  }),
  outputConflictSourceAlt: manifest({
    id: "output.conflict-source-alt",
    type: "output",
    provides: ["output.alt"],
    requires: ["source.documents@1.0.0"],
    digestSeed: "b4",
  }),
  outputConflictHigh: manifest({
    id: "output.conflict-high",
    type: "output",
    provides: ["output.alt"],
    risk: "high",
    digestSeed: "c4",
  }),
  outputConflictCycleA: manifest({
    id: "output.conflict-cycle-a",
    type: "output",
    provides: ["output.alt"],
    requires: ["output.conflict-cycle-b@1.0.0"],
    digestSeed: "d4",
  }),
  outputConflictCycleB: manifest({
    id: "output.conflict-cycle-b",
    type: "output",
    provides: ["output.cycle-b"],
    requires: ["output.conflict-cycle-a@1.0.0"],
    digestSeed: "e4",
  }),
  outputConflictMissing: manifest({
    id: "output.conflict-missing",
    type: "output",
    provides: ["output.alt"],
    requires: ["source.missing@1.0.0"],
    digestSeed: "b2",
  }),
  promptThird: manifest({
    id: "prompt.third",
    type: "prompt",
    provides: ["prompt.third"],
    digestSeed: "c2",
  }),
  outputConflictThird: manifest({
    id: "output.conflict-third",
    type: "output",
    provides: ["output.alt"],
    conflicts: ["prompt.third"],
    digestSeed: "d2",
  }),
  capabilityChoiceLow: manifest({
    id: "capability.choice-low",
    type: "capability",
    provides: ["tool.choice"],
    conflicts: ["output.choice-low"],
    digestSeed: "e2",
  }),
  outputChoiceLow: manifest({
    id: "output.choice-low",
    type: "output",
    provides: ["output.choice"],
    digestSeed: "f2",
  }),
  outputChoiceSafe: manifest({
    id: "output.choice-safe",
    type: "output",
    provides: ["output.choice"],
    risk: "medium",
    digestSeed: "a3",
  }),
  capabilityIndependentA: manifest({
    id: "capability.independent-a",
    type: "capability",
    provides: ["tool.independent_a"],
    conflicts: ["output.independent-a"],
    digestSeed: "f4",
  }),
  outputIndependentA: manifest({
    id: "output.independent-a",
    type: "output",
    provides: ["output.independent_a"],
    digestSeed: "a5",
  }),
  capabilityIndependentB: manifest({
    id: "capability.independent-b",
    type: "capability",
    provides: ["tool.independent_b"],
    conflicts: ["output.independent-b"],
    digestSeed: "b5",
  }),
  outputIndependentB: manifest({
    id: "output.independent-b",
    type: "output",
    provides: ["output.independent_b"],
    digestSeed: "c5",
  }),
  capabilityMediumDependency: manifest({
    id: "capability.medium-dependency",
    type: "capability",
    provides: ["tool.medium_dependency"],
    risk: "medium",
    digestSeed: "d5",
  }),
  capabilityRankLowRoot: manifest({
    id: "capability.rank-low-root",
    type: "capability",
    provides: ["tool.rank"],
    requires: ["capability.medium-dependency@1.0.0"],
    digestSeed: "e5",
  }),
  capabilityRankMediumDirect: manifest({
    id: "capability.rank-medium-direct",
    type: "capability",
    provides: ["tool.rank"],
    risk: "medium",
    digestSeed: "f5",
  }),
  transitiveRootA: manifest({
    id: "prompt.transitive-root-a",
    type: "prompt",
    provides: ["prompt.transitive_root_a"],
    requires: ["capability.transitive-dep-a@1.0.0"],
    digestSeed: "a6",
  }),
  transitiveDepA: manifest({
    id: "capability.transitive-dep-a",
    type: "capability",
    provides: ["tool.transitive_dep_a"],
    conflicts: ["capability.transitive-dep-b"],
    digestSeed: "b6",
  }),
  transitiveRootB: manifest({
    id: "prompt.transitive-root-b",
    type: "prompt",
    provides: ["prompt.transitive_root_b"],
    requires: ["capability.transitive-dep-b@1.0.0"],
    digestSeed: "c6",
  }),
  transitiveDepB: manifest({
    id: "capability.transitive-dep-b",
    type: "capability",
    provides: ["tool.transitive_dep_b"],
    digestSeed: "d6",
  }),
  multiRootA: manifest({
    id: "prompt.multi-root-a",
    type: "prompt",
    provides: ["prompt.multi_root_a"],
    requires: ["capability.multi-mid-a@1.0.0"],
    digestSeed: "e6",
  }),
  multiMidA: manifest({
    id: "capability.multi-mid-a",
    type: "capability",
    provides: ["tool.multi_mid_a"],
    requires: ["capability.multi-dep-a@1.0.0"],
    digestSeed: "f6",
  }),
  multiDepA: manifest({
    id: "capability.multi-dep-a",
    type: "capability",
    provides: ["tool.multi_dep_a"],
    conflicts: ["capability.multi-dep-b"],
    digestSeed: "a7",
  }),
  multiRootB: manifest({
    id: "prompt.multi-root-b",
    type: "prompt",
    provides: ["prompt.multi_root_b"],
    requires: ["capability.multi-mid-b@1.0.0"],
    digestSeed: "b7",
  }),
  multiMidB: manifest({
    id: "capability.multi-mid-b",
    type: "capability",
    provides: ["tool.multi_mid_b"],
    requires: ["capability.multi-dep-b@1.0.0"],
    digestSeed: "c7",
  }),
  multiDepB: manifest({
    id: "capability.multi-dep-b",
    type: "capability",
    provides: ["tool.multi_dep_b"],
    digestSeed: "d7",
  }),
  sharedRootA: manifest({
    id: "prompt.shared-root-a",
    type: "prompt",
    provides: ["prompt.shared_root_a"],
    requires: ["capability.shared-dep-x@1.0.0"],
    digestSeed: "e7",
  }),
  sharedRootC: manifest({
    id: "prompt.shared-root-c",
    type: "prompt",
    provides: ["prompt.shared_root_c"],
    requires: ["capability.shared-dep-x@1.0.0"],
    digestSeed: "f7",
  }),
  sharedDepX: manifest({
    id: "capability.shared-dep-x",
    type: "capability",
    provides: ["tool.shared_dep_x"],
    conflicts: ["capability.shared-dep-y"],
    digestSeed: "a8",
  }),
  sharedRootB: manifest({
    id: "prompt.shared-root-b",
    type: "prompt",
    provides: ["prompt.shared_root_b"],
    requires: ["capability.shared-dep-y@1.0.0"],
    digestSeed: "b8",
  }),
  sharedDepY: manifest({
    id: "capability.shared-dep-y",
    type: "capability",
    provides: ["tool.shared_dep_y"],
    digestSeed: "c8",
  }),
} as const;

export const allGraphManifests = Object.values(graphFixtures);
