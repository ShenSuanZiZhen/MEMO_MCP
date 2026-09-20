import { describe, expect, it } from "vitest";
import {
  recommendModuleSelection,
  resolveModuleGraph,
  type ModuleGraphProposal,
  type ModuleGraphSelection,
  type TypedModuleManifest,
} from "../../packages/module-sdk/src/index.js";
import {
  allGraphManifests,
  graphFixtures,
  manifest,
} from "./module-graph-fixtures.js";

function selection(manifest: TypedModuleManifest): ModuleGraphSelection {
  return {
    moduleId: manifest.id,
    exactVersion: manifest.version,
    artifactDigest: manifest.artifactDigest,
  };
}

function selectionKey(entry: ModuleGraphSelection): string {
  return `${entry.moduleId}@${entry.exactVersion}`;
}

function orderedKeys(result: ReturnType<typeof resolveModuleGraph>): string[] {
  return result.orderedModules.map((node) => node.registryKey);
}

function additionKeys(result: ReturnType<typeof resolveModuleGraph>): string[] {
  return result.additions.map((entry) => entry.registryKey);
}

function issueCodes(result: ReturnType<typeof resolveModuleGraph>): string[] {
  return result.issues.map((entry) => entry.code);
}

function recommendationIssueCodes(
  result: ReturnType<typeof recommendModuleSelection>,
): string[] {
  return result.issues.map((entry) => entry.code);
}

function applyProposal(
  selected: readonly ModuleGraphSelection[],
  proposal: ModuleGraphProposal,
): readonly ModuleGraphSelection[] {
  const removals = new Set(
    proposal.changeSet.removals.map((entry) => entry.registryKey),
  );
  const next = new Map<string, ModuleGraphSelection>();
  for (const entry of selected) {
    const key = `${entry.moduleId}@${entry.exactVersion}`;
    if (!removals.has(key)) {
      next.set(key, entry);
    }
  }
  for (const addition of proposal.changeSet.additions) {
    next.set(addition.registryKey, {
      moduleId: addition.moduleId,
      exactVersion: addition.exactVersion,
      artifactDigest: addition.artifactDigest,
    });
  }
  return [...next.values()].sort((left, right) =>
    `${left.moduleId}@${left.exactVersion}`.localeCompare(
      `${right.moduleId}@${right.exactVersion}`,
    ),
  );
}

function expectExecutableProposals(input: {
  readonly knownManifests: readonly TypedModuleManifest[];
  readonly selected: readonly ModuleGraphSelection[];
}): void {
  const result = resolveModuleGraph(input);
  for (const proposal of result.proposals) {
    const validation = resolveModuleGraph({
      knownManifests: input.knownManifests,
      selected: applyProposal(input.selected, proposal),
    });
    expect({
      proposal: proposal.message,
      issues: validation.issues,
      additions: validation.additions,
    }).toEqual({
      proposal: proposal.message,
      issues: [],
      additions: [],
    });
  }
}

function proposalSemantics(proposal: ModuleGraphProposal): {
  readonly code: ModuleGraphProposal["code"];
  readonly additions: readonly string[];
  readonly removals: readonly string[];
} {
  return {
    code: proposal.code,
    additions: proposal.changeSet.additions.map((entry) => entry.registryKey),
    removals: proposal.changeSet.removals.map((entry) => entry.registryKey),
  };
}

describe("module dependency resolver", () => {
  it("resolves a DAG closure and returns one-click additions before applying", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [selection(graphFixtures.capabilitySearch)],
    });

    expect(orderedKeys(result)).toEqual([
      "source.documents@1.0.0",
      "capability.index@1.0.0",
      "capability.search@1.0.0",
    ]);
    expect(additionKeys(result)).toEqual([
      "capability.index@1.0.0",
      "source.documents@1.0.0",
    ]);
    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "autofill_dependencies",
          changeSet: {
            additions: result.additions,
            removals: [],
          },
        }),
      ]),
    );
    expect(result.issues).toEqual([]);
  });

  it("resolves a diamond closure once and is stable across shuffled input", () => {
    const selected = [
      selection(graphFixtures.promptAnswer),
      selection(graphFixtures.capabilitySearch),
    ];
    const forward = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected,
    });
    const shuffled = resolveModuleGraph({
      knownManifests: [...allGraphManifests].reverse(),
      selected: [...selected].reverse(),
    });

    expect(orderedKeys(forward)).toEqual([
      "source.documents@1.0.0",
      "capability.index@1.0.0",
      "capability.search@1.0.0",
      "output.citations@1.0.0",
      "prompt.answer@1.0.0",
    ]);
    expect(forward).toEqual(shuffled);
  });

  it("detects cycles with relationship paths and JSON Pointers", () => {
    const result = resolveModuleGraph({
      knownManifests: [graphFixtures.cycleA, graphFixtures.cycleB],
      selected: [selection(graphFixtures.cycleA)],
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "cycle_detected",
          pointer: "/knownManifests/1/requires/0",
          relationshipPath: [
            "capability.cycle-a@1.0.0",
            "capability.cycle-b@1.0.0",
            "capability.cycle-a@1.0.0",
          ],
        }),
      ]),
    );
  });

  it("detects conflicts and returns only executable removal proposals", () => {
    const selected = [
      selection(graphFixtures.sourceDocuments),
      selection(graphFixtures.capabilityIndex),
      selection(graphFixtures.capabilitySearch),
      selection(graphFixtures.sourceLive),
      selection(graphFixtures.outputCitations),
    ];
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected,
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "module_conflict",
          relationshipPath: ["output.citations@1.0.0", "source.live@1.0.0"],
        }),
      ]),
    );
    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "remove_conflicting_module",
          changeSet: expect.objectContaining({
            removals: [
              expect.objectContaining({
                registryKey: "source.live@1.0.0",
              }),
            ],
          }),
        }),
      ]),
    );
    expect(
      result.proposals.some(
        (proposal) => proposal.code === "replace_with_alternative",
      ),
    ).toBe(false);
    expectExecutableProposals({ knownManifests: allGraphManifests, selected });
  });

  it("returns a complete plan for two unrelated conflicts and stays stable when shuffled", () => {
    const knownManifests = [
      graphFixtures.capabilityIndependentA,
      graphFixtures.outputIndependentA,
      graphFixtures.capabilityIndependentB,
      graphFixtures.outputIndependentB,
    ];
    const selected = knownManifests.map(selection);
    const forward = resolveModuleGraph({ knownManifests, selected });
    const shuffled = resolveModuleGraph({
      knownManifests: [...knownManifests].reverse(),
      selected: [...selected].reverse(),
    });
    const semantic = (proposal: ModuleGraphProposal) => ({
      code: proposal.code,
      additions: proposal.changeSet.additions.map((entry) => entry.registryKey),
      removals: proposal.changeSet.removals.map((entry) => entry.registryKey),
    });

    expect(forward.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "resolve_conflicts",
          changeSet: expect.objectContaining({
            removals: [
              expect.objectContaining({
                registryKey: "capability.independent-a@1.0.0",
              }),
              expect.objectContaining({
                registryKey: "capability.independent-b@1.0.0",
              }),
            ],
          }),
        }),
      ]),
    );
    expect(forward.proposals.map(semantic)).toEqual(
      shuffled.proposals.map(semantic),
    );
    expectExecutableProposals({ knownManifests, selected });
  });

  it("returns executable root-level proposals for two transitive dependency conflicts", () => {
    const knownManifests = [
      graphFixtures.transitiveRootA,
      graphFixtures.transitiveDepA,
      graphFixtures.transitiveRootB,
      graphFixtures.transitiveDepB,
    ];
    const selected = [
      selection(graphFixtures.transitiveRootA),
      selection(graphFixtures.transitiveRootB),
    ];
    const selectedKeys = new Set(selected.map(selectionKey));
    const result = resolveModuleGraph({ knownManifests, selected });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "module_conflict",
          relationshipPath: [
            "capability.transitive-dep-a@1.0.0",
            "capability.transitive-dep-b@1.0.0",
          ],
        }),
      ]),
    );
    expect(result.proposals.length).toBeGreaterThan(0);
    for (const proposal of result.proposals) {
      expect(
        proposal.changeSet.removals.every((entry) =>
          selectedKeys.has(entry.registryKey),
        ),
      ).toBe(true);
    }
    expectExecutableProposals({ knownManifests, selected });
  });

  it("returns executable root-level proposals for multi-level transitive conflicts", () => {
    const knownManifests = [
      graphFixtures.multiRootA,
      graphFixtures.multiMidA,
      graphFixtures.multiDepA,
      graphFixtures.multiRootB,
      graphFixtures.multiMidB,
      graphFixtures.multiDepB,
    ];
    const selected = [
      selection(graphFixtures.multiRootA),
      selection(graphFixtures.multiRootB),
    ];
    const selectedKeys = new Set(selected.map(selectionKey));
    const result = resolveModuleGraph({ knownManifests, selected });

    expect(issueCodes(result)).toContain("module_conflict");
    expect(result.proposals.length).toBeGreaterThan(0);
    for (const proposal of result.proposals) {
      expect(
        proposal.changeSet.removals.every((entry) =>
          selectedKeys.has(entry.registryKey),
        ),
      ).toBe(true);
    }
    expectExecutableProposals({ knownManifests, selected });
  });

  it("does not return partial owner removals for shared dependency conflicts", () => {
    const knownManifests = [
      graphFixtures.sharedRootA,
      graphFixtures.sharedRootC,
      graphFixtures.sharedDepX,
      graphFixtures.sharedRootB,
      graphFixtures.sharedDepY,
    ];
    const selected = [
      selection(graphFixtures.sharedRootA),
      selection(graphFixtures.sharedRootC),
      selection(graphFixtures.sharedRootB),
    ];
    const result = resolveModuleGraph({ knownManifests, selected });
    const removalSets = result.proposals.map(
      (proposal) =>
        new Set(proposal.changeSet.removals.map((entry) => entry.registryKey)),
    );

    expect(issueCodes(result)).toContain("module_conflict");
    expect(result.proposals.length).toBeGreaterThan(0);
    expect(
      removalSets.some(
        (removals) =>
          removals.size === 1 && removals.has("prompt.shared-root-a@1.0.0"),
      ),
    ).toBe(false);
    expect(
      removalSets.some(
        (removals) =>
          removals.size === 1 && removals.has("prompt.shared-root-c@1.0.0"),
      ),
    ).toBe(false);
    expectExecutableProposals({ knownManifests, selected });
  });

  it("keeps transitive conflict proposal semantics stable for shuffled inputs", () => {
    const knownManifests = [
      graphFixtures.sharedRootA,
      graphFixtures.sharedRootC,
      graphFixtures.sharedDepX,
      graphFixtures.sharedRootB,
      graphFixtures.sharedDepY,
    ];
    const selected = [
      selection(graphFixtures.sharedRootA),
      selection(graphFixtures.sharedRootC),
      selection(graphFixtures.sharedRootB),
    ];
    const forward = resolveModuleGraph({ knownManifests, selected });
    const shuffled = resolveModuleGraph({
      knownManifests: [...knownManifests].reverse(),
      selected: [...selected].reverse(),
    });

    expect(forward.proposals.map(proposalSemantics)).toEqual(
      shuffled.proposals.map(proposalSemantics),
    );
  });

  it("detects missing and incompatible exact dependencies without choosing versions", () => {
    const missing = resolveModuleGraph({
      knownManifests: [graphFixtures.needsMissing],
      selected: [selection(graphFixtures.needsMissing)],
    });
    const incompatible = resolveModuleGraph({
      knownManifests: [
        graphFixtures.sourceDocuments,
        graphFixtures.needsSourceV2,
      ],
      selected: [selection(graphFixtures.needsSourceV2)],
    });

    expect(missing.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_dependency",
          relationshipPath: [
            "capability.needs-missing@1.0.0",
            "source.missing@1.0.0",
          ],
        }),
      ]),
    );
    expect(incompatible.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible_dependency",
          relationshipPath: [
            "capability.needs-v2@1.0.0",
            "source.documents@2.0.0",
          ],
        }),
      ]),
    );
  });

  it("detects multi-version closure conflicts", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [
        selection(graphFixtures.capabilitySearch),
        selection(graphFixtures.capabilitySearchV2),
      ],
    });

    expect(issueCodes(result)).toContain("multi_version_conflict");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "multi_version_conflict",
          relationshipPath: [
            "source.documents@1.0.0",
            "source.documents@2.0.0",
          ],
        }),
      ]),
    );
  });

  it("blocks one-click autofill for high-risk dependencies", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [selection(graphFixtures.needsHighRisk)],
    });

    expect(result.additions).toEqual([]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "high_risk_autofill_blocked",
          relationshipPath: [
            "capability.needs-high-risk@1.0.0",
            "output.high-risk@1.0.0",
          ],
        }),
      ]),
    );
  });

  it("does not return executable autofill for root -> medium -> high-risk", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [selection(graphFixtures.rootNeedsMediumHighRisk)],
    });

    expect(result.additions).toEqual([]);
    expect(result.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "autofill_dependencies" }),
      ]),
    );
    expect(issueCodes(result)).toContain("high_risk_autofill_blocked");
  });

  it("does not return executable autofill for root -> medium -> missing", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [selection(graphFixtures.rootNeedsMediumMissing)],
    });

    expect(result.additions).toEqual([]);
    expect(result.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "autofill_dependencies" }),
      ]),
    );
    expect(issueCodes(result)).toContain("missing_dependency");
  });

  it("does not return executable autofill when autofill would produce a version conflict", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [selection(graphFixtures.rootVersionConflict)],
    });

    expect(result.additions).toEqual([]);
    expect(result.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "autofill_dependencies" }),
      ]),
    );
    expect(issueCodes(result)).toContain("multi_version_conflict");
  });

  it("returns a replacement proposal only when the full alternative closure is executable", () => {
    const knownManifests = [
      graphFixtures.capabilityKeep,
      graphFixtures.outputConflictOld,
      graphFixtures.outputConflictNew,
    ];
    const selected = [
      selection(graphFixtures.capabilityKeep),
      selection(graphFixtures.outputConflictOld),
    ];
    const result = resolveModuleGraph({ knownManifests, selected });

    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "replace_with_alternative",
          changeSet: expect.objectContaining({
            additions: [
              expect.objectContaining({
                registryKey: "output.conflict-new@1.0.0",
              }),
            ],
            removals: [
              expect.objectContaining({
                registryKey: "output.conflict-old@1.0.0",
              }),
            ],
          }),
        }),
      ]),
    );
    expectExecutableProposals({ knownManifests, selected });
  });

  it("includes safe dependencies required by a replacement alternative", () => {
    const knownManifests = [
      graphFixtures.capabilityKeep,
      graphFixtures.outputConflictOld,
      graphFixtures.outputConflictSourceAlt,
      graphFixtures.sourceDocuments,
    ];
    const selected = [
      selection(graphFixtures.capabilityKeep),
      selection(graphFixtures.outputConflictOld),
    ];
    const result = resolveModuleGraph({ knownManifests, selected });

    expect(result.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "replace_with_alternative",
          changeSet: expect.objectContaining({
            additions: [
              expect.objectContaining({
                registryKey: "output.conflict-source-alt@1.0.0",
                reason: "replacement_alternative",
              }),
              expect.objectContaining({
                registryKey: "source.documents@1.0.0",
                reason: "required_dependency",
              }),
            ],
          }),
        }),
      ]),
    );
    expectExecutableProposals({ knownManifests, selected });
  });

  it("does not propose alternatives with missing dependencies or third-module conflicts", () => {
    const missingAlternative = resolveModuleGraph({
      knownManifests: [
        graphFixtures.capabilityKeep,
        graphFixtures.outputConflictOld,
        graphFixtures.outputConflictMissing,
      ],
      selected: [
        selection(graphFixtures.capabilityKeep),
        selection(graphFixtures.outputConflictOld),
      ],
    });
    const thirdConflictAlternative = resolveModuleGraph({
      knownManifests: [
        graphFixtures.capabilityKeep,
        graphFixtures.promptThird,
        graphFixtures.outputConflictOld,
        graphFixtures.outputConflictThird,
      ],
      selected: [
        selection(graphFixtures.capabilityKeep),
        selection(graphFixtures.promptThird),
        selection(graphFixtures.outputConflictOld),
      ],
    });

    expect(missingAlternative.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "replace_with_alternative" }),
      ]),
    );
    expect(thirdConflictAlternative.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "replace_with_alternative" }),
      ]),
    );
  });

  it("does not propose alternatives with high-risk or cyclic dependency closures", () => {
    const highRiskAlternative = resolveModuleGraph({
      knownManifests: [
        graphFixtures.capabilityKeep,
        graphFixtures.outputConflictOld,
        graphFixtures.outputConflictHigh,
      ],
      selected: [
        selection(graphFixtures.capabilityKeep),
        selection(graphFixtures.outputConflictOld),
      ],
    });
    const cyclicAlternative = resolveModuleGraph({
      knownManifests: [
        graphFixtures.capabilityKeep,
        graphFixtures.outputConflictOld,
        graphFixtures.outputConflictCycleA,
        graphFixtures.outputConflictCycleB,
      ],
      selected: [
        selection(graphFixtures.capabilityKeep),
        selection(graphFixtures.outputConflictOld),
      ],
    });

    expect(highRiskAlternative.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "replace_with_alternative" }),
      ]),
    );
    expect(cyclicAlternative.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "replace_with_alternative" }),
      ]),
    );
  });

  it("does not propose deleting a selected shared dependency required by retained roots", () => {
    const selected = [
      selection(graphFixtures.sourceDocuments),
      selection(graphFixtures.capabilitySearch),
      selection(graphFixtures.outputCitations),
      selection(graphFixtures.sourceLive),
    ];
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected,
    });

    expect(result.proposals).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "remove_conflicting_module",
          changeSet: expect.objectContaining({
            removals: [
              expect.objectContaining({
                registryKey: "source.documents@1.0.0",
              }),
            ],
          }),
        }),
      ]),
    );
    expectExecutableProposals({ knownManifests: allGraphManifests, selected });
  });

  it("keeps original JSON Pointers for unsorted requires and conflicts", () => {
    const unsortedRequires = manifest({
      id: "capability.unsorted-requires",
      type: "capability",
      requires: [
        "source.missing@1.0.0",
        "source.documents@2.0.0",
        "source.missing@1.0.0",
      ],
      digestSeed: "b3",
    });
    const unsortedConflicts = manifest({
      id: "capability.unsorted-conflicts",
      type: "capability",
      conflicts: ["source.none", "source.live", "source.live"],
      digestSeed: "c3",
    });

    const requiresResult = resolveModuleGraph({
      knownManifests: [graphFixtures.sourceDocuments, unsortedRequires],
      selected: [selection(unsortedRequires)],
    });
    const conflictsResult = resolveModuleGraph({
      knownManifests: [unsortedConflicts, graphFixtures.sourceLive],
      selected: [
        selection(unsortedConflicts),
        selection(graphFixtures.sourceLive),
      ],
    });

    expect(requiresResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "incompatible_dependency",
          pointer: "/knownManifests/1/requires/1",
        }),
        expect.objectContaining({
          code: "missing_dependency",
          pointer: "/knownManifests/1/requires/0",
        }),
        expect.objectContaining({
          code: "missing_dependency",
          pointer: "/knownManifests/1/requires/2",
        }),
      ]),
    );
    expect(conflictsResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "module_conflict",
          pointer: "/knownManifests/0/conflicts/1",
        }),
      ]),
    );
  });

  it("marks explicitly selected modules as selected even when first reached as dependencies", () => {
    const result = resolveModuleGraph({
      knownManifests: allGraphManifests,
      selected: [
        selection(graphFixtures.capabilitySearch),
        selection(graphFixtures.sourceDocuments),
      ],
    });

    expect(
      result.orderedModules.find(
        (node) => node.registryKey === "source.documents@1.0.0",
      ),
    ).toMatchObject({ reason: "selected" });
  });
});

describe("module recommendation", () => {
  it("recommends explainable low-risk modules by requested provided capability", () => {
    const result = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["tool.search", "output.citations"],
    });

    expect(result).toEqual({
      selections: [
        selection(graphFixtures.capabilitySearch),
        selection(graphFixtures.outputCitations),
      ],
      reasons: [
        {
          provide: "output.citations",
          registryKey: "output.citations@1.0.0",
          message: "output.citations@1.0.0 provides output.citations",
        },
        {
          provide: "tool.search",
          registryKey: "capability.search@1.0.0",
          message: "capability.search@1.0.0 provides tool.search",
        },
      ],
      issues: [],
    });
  });

  it("does not recommend a low-risk provider with a high-risk transitive dependency", () => {
    const result = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["tool.medium_high"],
    });

    expect(result.selections).toEqual([]);
    expect(recommendationIssueCodes(result)).toContain(
      "high_risk_autofill_blocked",
    );
  });

  it("skips the lowest-risk conflicting combination and chooses a safe backup", () => {
    const result = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["tool.choice", "output.choice"],
    });

    expect(result).toMatchObject({
      selections: [
        selection(graphFixtures.capabilityChoiceLow),
        selection(graphFixtures.outputChoiceSafe),
      ],
      issues: [],
    });
  });

  it("does not surface successful recommendations for missing, cycle, or multi-version graphs", () => {
    const missing = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["tool.medium_missing"],
    });
    const cycle = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["tool.cycle-a"],
    });
    const multiVersion = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["prompt.version_conflict"],
    });

    expect(missing.selections).toEqual([]);
    expect(missing.issues.map((entry) => entry.code)).toContain(
      "missing_dependency",
    );
    expect(cycle.selections).toEqual([]);
    expect(cycle.issues.map((entry) => entry.code)).toContain("cycle_detected");
    expect(multiVersion.selections).toEqual([]);
    expect(multiVersion.issues.map((entry) => entry.code)).toContain(
      "multi_version_conflict",
    );
  });

  it("scores recommendations by the deduplicated resolved closure", () => {
    const result = recommendModuleSelection({
      knownManifests: [
        graphFixtures.capabilityRankLowRoot,
        graphFixtures.capabilityRankMediumDirect,
        graphFixtures.capabilityMediumDependency,
      ],
      desiredProvides: ["tool.rank"],
    });

    expect(result).toMatchObject({
      selections: [selection(graphFixtures.capabilityRankMediumDirect)],
      issues: [],
    });
  });

  it("keeps recommendation choices and reasons stable for shuffled inputs", () => {
    const forward = recommendModuleSelection({
      knownManifests: allGraphManifests,
      desiredProvides: ["tool.choice", "output.choice"],
    });
    const shuffled = recommendModuleSelection({
      knownManifests: [...allGraphManifests].reverse(),
      desiredProvides: ["output.choice", "tool.choice"],
    });

    expect(shuffled).toEqual(forward);
  });

  it("returns a deterministic blocking issue when recommendation search exceeds the evaluation limit", () => {
    const providersA = Array.from({ length: 101 }, (_, index) =>
      manifest({
        id: `capability.limit-a-${index}`,
        type: "capability",
        provides: ["tool.limit_a"],
        risk: "high",
        digestSeed: String(index % 10),
      }),
    );
    const providersB = Array.from({ length: 100 }, (_, index) =>
      manifest({
        id: `output.limit-b-${index}`,
        type: "output",
        provides: ["output.limit_b"],
        risk: "high",
        digestSeed: String((index + 1) % 10),
      }),
    );
    const forward = recommendModuleSelection({
      knownManifests: [...providersA, ...providersB],
      desiredProvides: ["tool.limit_a", "output.limit_b"],
    });
    const shuffled = recommendModuleSelection({
      knownManifests: [...providersB, ...providersA].reverse(),
      desiredProvides: ["output.limit_b", "tool.limit_a"],
    });

    expect(forward).toEqual({
      selections: [],
      reasons: [],
      issues: [
        expect.objectContaining({
          code: "recommendation_search_limit_exceeded",
          relationshipPath: ["output.limit_b", "tool.limit_a"],
        }),
      ],
    });
    expect(shuffled).toEqual(forward);
  });

  it("fails fast for missing desired capabilities before entering large recommendation search", () => {
    const manyProviders = Array.from({ length: 120 }, (_, index) =>
      manifest({
        id: `capability.fast-${index}`,
        type: "capability",
        provides: ["tool.fast"],
        digestSeed: String(index % 10),
      }),
    );
    const result = recommendModuleSelection({
      knownManifests: manyProviders,
      desiredProvides: ["tool.fast", "tool.absent"],
    });

    expect(result.selections).toEqual([]);
    expect(recommendationIssueCodes(result)).toEqual(["missing_dependency"]);
  });
});
