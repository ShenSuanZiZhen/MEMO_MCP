import { describe, expect, it } from "vitest";
import {
  ENVIRONMENTS,
  accessPolicyId,
  actorId,
  auditRecordId,
  candidateId,
  candidateVersion,
  credentialId,
  credentialRevision,
  dataSourceId,
  dataSourceRevision,
  dataVersionId,
  definitionId,
  definitionVersion,
  deploymentId,
  draftId,
  draftRevision,
  environment,
  listLegalTransitions,
  moduleId,
  moduleVersion,
  platformScope,
  policyVersionId,
  projectId,
  projectRevision,
  projectScope,
  releaseVersion,
  serviceId,
  serviceVersionId,
  stateMachines,
  transitionEdge,
  transitionState,
  uploadId,
  workspaceId,
  workspaceRevision,
  type AccessPolicyAggregate,
  type ActorContext,
  type DataSourceAggregate,
  type DataVersionAggregate,
  type DomainPorts,
  type DomainResult,
  type DraftAggregate,
  type ImpactScope,
  type ModuleVersionAggregate,
  type OpaqueValue,
  type ServiceDefinitionAggregate,
  type StateMachineDefinition,
  type StateTransitionRequest,
  type StatefulEntity,
} from "../../packages/domain/src/index.js";

function unwrap<T>(result: DomainResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

const ids = {
  accessPolicy: unwrap(accessPolicyId("ap_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  actor: unwrap(actorId("actor_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  candidate: unwrap(candidateId("cand_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  credential: unwrap(credentialId("cred_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  dataSource: unwrap(dataSourceId("ds_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  dataVersion: unwrap(dataVersionId("dv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  definition: unwrap(definitionId("def_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  deployment: unwrap(deploymentId("dep_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  draft: unwrap(draftId("draft_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  module: unwrap(moduleId("mod_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  policyVersion: unwrap(policyVersionId("pv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  project: unwrap(projectId("prj_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  service: unwrap(serviceId("svc_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  serviceVersion: unwrap(serviceVersionId("sv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  upload: unwrap(uploadId("upl_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
  workspace: unwrap(workspaceId("ws_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
};

const scope = projectScope({
  workspaceId: ids.workspace,
  projectId: ids.project,
  environment: "production",
});

const ports: DomainPorts = {
  clock: { now: () => new Date("2026-09-16T00:00:00.000Z") },
  ids: { newId: () => "audit_01HZY8T3M6R7P9K2Q4V5X6Y7Z8" },
};

function actorFor(requirement: {
  readonly roles: readonly ActorContext["roles"][number][];
  readonly capability: string;
}): ActorContext {
  return {
    actorId: ids.actor,
    roles: [requirement.roles[0] ?? "owner"],
    capabilities: [requirement.capability],
  };
}

function request<S extends string>(
  from: S,
  to: S,
  impactScope: ImpactScope,
  actor: ActorContext,
  overrides: Partial<StateTransitionRequest<S>> = {},
): StateTransitionRequest<S> {
  return {
    from,
    to,
    expectedRevision: 7,
    actor,
    reason: "required operational transition",
    impactScope,
    ...overrides,
  };
}

function entity<S extends string>(
  machineName: string,
  state: S,
  entityId: OpaqueValue<string> = ids.draft,
  entityScope = scope,
  revision = 7,
): StatefulEntity<S> {
  return {
    id: entityId,
    scope: entityScope,
    state,
    revision,
  };
}

function impact(
  entityId: OpaqueValue<string> = ids.draft,
  targetScope = scope,
): ImpactScope {
  return {
    scope: targetScope,
    resourceIds: [entityId],
  };
}

function allIllegalPairs<S extends string>(
  machine: StateMachineDefinition<S>,
): ReadonlyArray<readonly [S, S]> {
  const legal = new Set(
    listLegalTransitions(machine).map(([from, to]) => transitionEdge(from, to)),
  );
  return machine.states.flatMap((from) =>
    machine.states
      .filter((to) => from !== to && !legal.has(transitionEdge(from, to)))
      .map((to) => [from, to] as const),
  );
}

describe("domain value objects", () => {
  it("keeps opaque ids aligned with the public schema", () => {
    expect(workspaceId("ws_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")).toMatchObject({
      ok: true,
    });
    expect(projectId("prj_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")).toMatchObject({
      ok: true,
    });
    expect(dataVersionId("dv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")).toMatchObject({
      ok: true,
    });

    for (const invalid of [
      "value_001",
      "ABC_12345678",
      "../secret",
      "ws_short",
    ]) {
      expect(workspaceId(invalid)).toMatchObject({
        ok: false,
        error: { code: "INVALID_VALUE" },
      });
    }
  });

  it("accepts only canonical environments", () => {
    expect(ENVIRONMENTS).toEqual(["development", "test", "production"]);
    for (const valid of ENVIRONMENTS) {
      expect(environment(valid)).toMatchObject({ ok: true });
    }
    for (const invalid of ["dev", "prod", "staging"]) {
      expect(environment(invalid)).toMatchObject({
        ok: false,
        error: { code: "INVALID_VALUE" },
      });
    }
  });

  it("separates revisions, exact versions, and version ids", () => {
    expect(workspaceRevision(1)).toMatchObject({ ok: true });
    expect(projectRevision(Number.MAX_SAFE_INTEGER)).toMatchObject({
      ok: true,
    });
    expect(dataSourceRevision(1)).toMatchObject({ ok: true });
    expect(dataSourceRevision(Number.MAX_SAFE_INTEGER)).toMatchObject({
      ok: true,
    });
    for (const invalid of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(dataSourceRevision(invalid)).toMatchObject({
        ok: false,
        error: { code: "INVALID_VALUE" },
      });
    }
    expect(draftRevision(0)).toMatchObject({
      ok: false,
      error: { code: "INVALID_VALUE" },
    });
    for (const invalid of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(credentialRevision(invalid)).toMatchObject({
        ok: false,
        error: { code: "INVALID_VALUE" },
      });
    }

    expect(moduleVersion("1.2.3")).toMatchObject({ ok: true });
    expect(definitionVersion("1.2.3+build.1")).toMatchObject({ ok: true });
    expect(candidateVersion("^1.2.3")).toMatchObject({
      ok: false,
      error: { code: "INVALID_VALUE" },
    });
    expect(releaseVersion("1.2.3")).toMatchObject({ ok: true });
    expect(dataVersionId("dv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")).toMatchObject({
      ok: true,
    });
    expect(policyVersionId("pv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")).toMatchObject({
      ok: true,
    });
  });
});

describe("aggregate scopes", () => {
  it("requires project-scoped aggregates to carry workspace, project, and environment", () => {
    const dataSource: DataSourceAggregate = {
      id: ids.dataSource,
      scope,
      revision: unwrap(dataSourceRevision(1)),
    };
    const dataVersion: DataVersionAggregate = {
      id: ids.dataVersion,
      dataSourceId: ids.dataSource,
      scope,
      state: "completed",
      immutable: true,
    };
    const draft: DraftAggregate = {
      id: ids.draft,
      scope,
      revision: unwrap(draftRevision(1)),
      state: "editing",
    };
    const definition: ServiceDefinitionAggregate = {
      id: ids.definition,
      scope,
      version: unwrap(definitionVersion("1.0.0")),
      digest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      immutable: true,
    };
    const policy: AccessPolicyAggregate = {
      id: ids.accessPolicy,
      scope,
      policyVersionId: ids.policyVersion,
    };

    for (const aggregate of [
      dataSource,
      dataVersion,
      draft,
      definition,
      policy,
    ]) {
      expect(aggregate.scope).toMatchObject({
        kind: "project",
        workspaceId: ids.workspace,
        projectId: ids.project,
        environment: "production",
      });
    }
  });

  it("keeps module versions in the platform scope for P0", () => {
    const moduleVersionAggregate: ModuleVersionAggregate = {
      moduleId: ids.module,
      scope: platformScope(),
      version: unwrap(moduleVersion("1.0.0")),
      state: "approved",
      artifactDigest:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      signatureRef: "sig_01HZY8T3M6R7P9K2Q4V5X6Y7Z8",
    };

    expect(moduleVersionAggregate.scope).toEqual({ kind: "platform" });
  });
});

describe("PRD critical state machines", () => {
  const entries = Object.values(stateMachines);

  it.each(entries)(
    "$name accepts every legal transition with a minimal allowed role and capability",
    (machine) => {
      for (const [from, to] of listLegalTransitions(machine)) {
        const requirement = machine.requirements[transitionEdge(from, to)];
        expect(requirement).toBeDefined();
        const result = transitionState(
          machine,
          entity(machine.name, from),
          request(from, to, impact(), actorFor(requirement!)),
          ports,
        );

        expect(result).toMatchObject({
          ok: true,
          value: {
            state: to,
            revision: 8,
            changedAt: "2026-09-16T00:00:00.000Z",
            changedBy: ids.actor,
            audit: {
              id: unwrap(auditRecordId("audit_01HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
              machine: machine.name,
              entityId: ids.draft,
              from,
              to,
              actorId: ids.actor,
              revision: 8,
              occurredAt: "2026-09-16T00:00:00.000Z",
            },
          },
        });
      }
    },
  );

  it.each(entries)("$name rejects every non-PRD transition edge", (machine) => {
    for (const [from, to] of allIllegalPairs(machine)) {
      const requirement = machine.requirements[
        transitionEdge(from, machine.transitions[from][0]!)
      ] ?? { roles: ["owner"] as const, capability: "unused" };
      const result = transitionState(
        machine,
        entity(machine.name, from),
        request(from, to, impact(), actorFor(requirement)),
        ports,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_STATE_TRANSITION" },
      });
    }
  });

  it.each(entries)("$name rejects every self transition", (machine) => {
    for (const state of machine.states) {
      const result = transitionState(
        machine,
        entity(machine.name, state),
        request(state, state, impact(), {
          actorId: ids.actor,
          roles: ["owner"],
          capabilities: ["unused"],
        }),
        ports,
      );

      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_STATE_TRANSITION" },
      });
    }
  });

  it("expresses reviewed recovery semantics only", () => {
    const releaseResume =
      stateMachines.serviceVersion.requirements[
        transitionEdge("suspended", "published")
      ]!;
    expect(
      transitionState(
        stateMachines.serviceVersion,
        entity("serviceVersion", "suspended"),
        request("suspended", "published", impact(), actorFor(releaseResume)),
        ports,
      ),
    ).toMatchObject({ ok: true });

    const deploymentResume =
      stateMachines.deployment.requirements[
        transitionEdge("suspended", "healthy")
      ]!;
    expect(
      transitionState(
        stateMachines.deployment,
        entity("deployment", "suspended"),
        request("suspended", "healthy", impact(), actorFor(deploymentResume)),
        ports,
      ),
    ).toMatchObject({ ok: true });

    expect(
      transitionState(
        stateMachines.serviceVersion,
        entity("serviceVersion", "suspended"),
        request("suspended", "deploying", impact(), actorFor(releaseResume)),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATE_TRANSITION" },
    });

    expect(
      transitionState(
        stateMachines.deployment,
        entity("deployment", "suspended"),
        request("suspended", "degraded", impact(), actorFor(deploymentResume)),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATE_TRANSITION" },
    });
  });

  it("checks pre-state, revision, reason, impact scope, and revision overflow", () => {
    const machine = stateMachines.draft;
    const requirement =
      machine.requirements[transitionEdge("editing", "validating")]!;
    const allowedActor = actorFor(requirement);

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request("validating", "ready", impact(), allowedActor),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATE_PRECONDITION" },
    });

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request("editing", "validating", impact(), allowedActor, {
          expectedRevision: 6,
        }),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "REVISION_CONFLICT" },
    });

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request("editing", "validating", impact(), allowedActor, {
          expectedRevision: 0,
        }),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_VALUE" },
    });

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request("editing", "validating", impact(), allowedActor, {
          reason: " ",
        }),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "MISSING_REASON" },
    });

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request(
          "editing",
          "validating",
          { ...impact(), resourceIds: [] },
          allowedActor,
        ),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "IMPACT_SCOPE_REQUIRED" },
    });

    expect(
      transitionState(
        machine,
        entity("draft", "editing", ids.draft, scope, Number.MAX_SAFE_INTEGER),
        request("editing", "validating", impact(), allowedActor, {
          expectedRevision: Number.MAX_SAFE_INTEGER,
        }),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "REVISION_OVERFLOW" },
    });
  });

  it("rejects scope mismatch and resource containment violations", () => {
    const machine = stateMachines.draft;
    const requirement =
      machine.requirements[transitionEdge("editing", "validating")]!;
    const allowedActor = actorFor(requirement);
    const otherWorkspaceScope = projectScope({
      workspaceId: unwrap(workspaceId("ws_11HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
      projectId: ids.project,
      environment: "production",
    });
    const otherProjectScope = projectScope({
      workspaceId: ids.workspace,
      projectId: unwrap(projectId("prj_11HZY8T3M6R7P9K2Q4V5X6Y7Z8")),
      environment: "production",
    });
    const otherEnvironmentScope = projectScope({
      workspaceId: ids.workspace,
      projectId: ids.project,
      environment: "test",
    });

    for (const mismatchedScope of [
      otherWorkspaceScope,
      otherProjectScope,
      otherEnvironmentScope,
    ]) {
      expect(
        transitionState(
          machine,
          entity("draft", "editing"),
          request(
            "editing",
            "validating",
            impact(ids.draft, mismatchedScope),
            allowedActor,
          ),
          ports,
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "SCOPE_MISMATCH" },
      });
    }

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request(
          "editing",
          "validating",
          impact(unwrap(draftId("draft_11HZY8T3M6R7P9K2Q4V5X6Y7Z8"))),
          allowedActor,
        ),
        ports,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "RESOURCE_NOT_IN_SCOPE" },
    });

    expect(
      transitionState(
        machine,
        entity("draft", "editing"),
        request("editing", "validating", impact(), allowedActor),
        ports,
      ),
    ).toMatchObject({ ok: true });
  });

  it("checks the permission matrix per edge", () => {
    for (const machine of Object.values(stateMachines)) {
      for (const [from, to] of listLegalTransitions(machine)) {
        const requirement = machine.requirements[transitionEdge(from, to)]!;

        expect(
          transitionState(
            machine,
            entity(machine.name, from),
            request(from, to, impact(), actorFor(requirement)),
            ports,
          ),
        ).toMatchObject({ ok: true });

        expect(
          transitionState(
            machine,
            entity(machine.name, from),
            request(from, to, impact(), {
              actorId: ids.actor,
              roles: ["auditor"],
              capabilities: [requirement.capability],
            }),
            ports,
          ),
        ).toMatchObject({
          ok: false,
          error: { code: "ACTOR_NOT_ALLOWED" },
        });

        expect(
          transitionState(
            machine,
            entity(machine.name, from),
            request(from, to, impact(), {
              actorId: ids.actor,
              roles: [requirement.roles[0] ?? "owner"],
              capabilities: [],
            }),
            ports,
          ),
        ).toMatchObject({
          ok: false,
          error: { code: "MISSING_CAPABILITY" },
        });
      }
    }
  });

  it("is deterministic for unchanged inputs and fixed ports", () => {
    const machine = stateMachines.draft;
    const requirement =
      machine.requirements[transitionEdge("editing", "validating")]!;
    const transitionRequest = request(
      "editing",
      "validating",
      impact(),
      actorFor(requirement),
    );
    const transitionEntity = entity("draft", "editing");

    const first = transitionState(
      machine,
      transitionEntity,
      transitionRequest,
      ports,
    );
    const second = transitionState(
      machine,
      transitionEntity,
      transitionRequest,
      ports,
    );

    expect(first).toEqual(second);
  });
});
