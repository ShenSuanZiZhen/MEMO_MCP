import type { DomainPorts } from "./ports.js";
import { err, ok, type DomainResult } from "./result.js";
import {
  auditRecordId,
  isSameDomainScope,
  type ActorId,
  type AuditRecordId,
  type DomainScope,
  type OpaqueValue,
} from "./values.js";

export type ActorRole =
  | "admin"
  | "auditor"
  | "maintainer"
  | "operator"
  | "owner"
  | "reviewer"
  | "system";

export interface ActorContext {
  readonly actorId: ActorId;
  readonly roles: readonly ActorRole[];
  readonly capabilities: readonly string[];
}

export interface ImpactScope {
  readonly scope: DomainScope;
  readonly resourceIds: readonly OpaqueValue<string>[];
}

export interface StateTransitionRequest<S extends string> {
  readonly from: S;
  readonly to: S;
  readonly expectedRevision: number;
  readonly actor: ActorContext;
  readonly reason: string;
  readonly impactScope: ImpactScope;
}

export interface StatefulEntity<S extends string> {
  readonly id: OpaqueValue<string>;
  readonly scope: DomainScope;
  readonly state: S;
  readonly revision: number;
}

export interface DomainAuditRecord<S extends string> {
  readonly id: AuditRecordId;
  readonly machine: StateMachineName;
  readonly entityId: OpaqueValue<string>;
  readonly from: S;
  readonly to: S;
  readonly actorId: ActorId;
  readonly reason: string;
  readonly impactScope: ImpactScope;
  readonly revision: number;
  readonly occurredAt: string;
}

export interface StateTransitionResult<S extends string> {
  readonly state: S;
  readonly revision: number;
  readonly changedAt: string;
  readonly changedBy: ActorId;
  readonly audit: DomainAuditRecord<S>;
}

export interface TransitionRequirement {
  readonly roles: readonly ActorRole[];
  readonly capability: string;
}

export interface StateMachineDefinition<S extends string> {
  readonly name: StateMachineName;
  readonly states: readonly S[];
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  readonly requirements: Readonly<Record<string, TransitionRequirement>>;
}

export type DraftState =
  | "editing"
  | "validating"
  | "ready"
  | "building"
  | "built"
  | "submitted";

export type CandidateState =
  | "submitted"
  | "changes_requested"
  | "materials_required"
  | "rejected"
  | "approved"
  | "withdrawn";

export type ServiceVersionState =
  | "approved"
  | "deploying"
  | "published"
  | "suspended"
  | "retired";

export type DeploymentState =
  | "provisioning"
  | "healthy"
  | "degraded"
  | "draining"
  | "suspended"
  | "stopped"
  | "blocked";

export type UploadState =
  | "created"
  | "uploading"
  | "uploaded"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "expired";

export type CredentialState = "active" | "rotating" | "revoked" | "expired";

export type ModuleVersionState =
  | "draft"
  | "testing"
  | "submitted"
  | "approved"
  | "deprecated"
  | "blocked";

export type StateMachineName =
  | "candidate"
  | "credential"
  | "deployment"
  | "draft"
  | "moduleVersion"
  | "serviceVersion"
  | "upload";

function requirement(
  capability: string,
  roles: readonly ActorRole[],
): TransitionRequirement {
  return { capability, roles };
}

export function transitionEdge(from: string, to: string): string {
  return `${from}->${to}`;
}

function defineStateMachine<S extends string>(
  definition: StateMachineDefinition<S>,
): StateMachineDefinition<S> {
  return definition;
}

const draftRequirement = requirement("draft.transition", [
  "maintainer",
  "owner",
  "system",
]);

export const draftStateMachine = defineStateMachine<DraftState>({
  name: "draft",
  states: ["editing", "validating", "ready", "building", "built", "submitted"],
  transitions: {
    editing: ["validating"],
    validating: ["ready"],
    ready: ["building"],
    building: ["built"],
    built: ["submitted"],
    submitted: [],
  },
  requirements: {
    [transitionEdge("editing", "validating")]: draftRequirement,
    [transitionEdge("validating", "ready")]: draftRequirement,
    [transitionEdge("ready", "building")]: draftRequirement,
    [transitionEdge("building", "built")]: draftRequirement,
    [transitionEdge("built", "submitted")]: requirement("draft.submit", [
      "maintainer",
      "owner",
    ]),
  },
});

const reviewRequirement = requirement("candidate.review", [
  "owner",
  "reviewer",
]);

export const candidateStateMachine = defineStateMachine<CandidateState>({
  name: "candidate",
  states: [
    "submitted",
    "changes_requested",
    "materials_required",
    "rejected",
    "approved",
    "withdrawn",
  ],
  transitions: {
    submitted: [
      "changes_requested",
      "materials_required",
      "rejected",
      "approved",
      "withdrawn",
    ],
    changes_requested: [],
    materials_required: [],
    rejected: [],
    approved: [],
    withdrawn: [],
  },
  requirements: {
    [transitionEdge("submitted", "changes_requested")]: reviewRequirement,
    [transitionEdge("submitted", "materials_required")]: reviewRequirement,
    [transitionEdge("submitted", "rejected")]: reviewRequirement,
    [transitionEdge("submitted", "approved")]: reviewRequirement,
    [transitionEdge("submitted", "withdrawn")]: requirement(
      "candidate.withdraw",
      ["maintainer", "owner"],
    ),
  },
});

const releaseRequirement = requirement("release.operate", [
  "operator",
  "owner",
  "system",
]);
const releaseResumeRequirement = requirement("release.resume", [
  "operator",
  "owner",
  "system",
]);

export const serviceVersionStateMachine =
  defineStateMachine<ServiceVersionState>({
    name: "serviceVersion",
    states: ["approved", "deploying", "published", "suspended", "retired"],
    transitions: {
      approved: ["deploying"],
      deploying: ["published"],
      published: ["suspended"],
      suspended: ["published", "retired"],
      retired: [],
    },
    requirements: {
      [transitionEdge("approved", "deploying")]: releaseRequirement,
      [transitionEdge("deploying", "published")]: releaseRequirement,
      [transitionEdge("published", "suspended")]: releaseRequirement,
      [transitionEdge("suspended", "published")]: releaseResumeRequirement,
      [transitionEdge("suspended", "retired")]: releaseRequirement,
    },
  });

const deploymentRequirement = requirement("deployment.operate", [
  "operator",
  "owner",
  "system",
]);
const deploymentResumeRequirement = requirement("deployment.resume", [
  "operator",
  "owner",
  "system",
]);

export const deploymentStateMachine = defineStateMachine<DeploymentState>({
  name: "deployment",
  states: [
    "provisioning",
    "healthy",
    "degraded",
    "draining",
    "suspended",
    "stopped",
    "blocked",
  ],
  transitions: {
    provisioning: ["healthy", "blocked"],
    healthy: ["degraded", "draining"],
    degraded: ["healthy", "draining", "blocked"],
    draining: ["suspended", "stopped"],
    suspended: ["healthy", "stopped"],
    stopped: [],
    blocked: [],
  },
  requirements: {
    [transitionEdge("provisioning", "healthy")]: deploymentRequirement,
    [transitionEdge("provisioning", "blocked")]: deploymentRequirement,
    [transitionEdge("healthy", "degraded")]: deploymentRequirement,
    [transitionEdge("healthy", "draining")]: deploymentRequirement,
    [transitionEdge("degraded", "healthy")]: deploymentRequirement,
    [transitionEdge("degraded", "draining")]: deploymentRequirement,
    [transitionEdge("degraded", "blocked")]: deploymentRequirement,
    [transitionEdge("draining", "suspended")]: deploymentRequirement,
    [transitionEdge("draining", "stopped")]: deploymentRequirement,
    [transitionEdge("suspended", "healthy")]: deploymentResumeRequirement,
    [transitionEdge("suspended", "stopped")]: deploymentRequirement,
  },
});

const uploadRequirement = requirement("upload.process", [
  "maintainer",
  "owner",
  "system",
]);

export const uploadStateMachine = defineStateMachine<UploadState>({
  name: "upload",
  states: [
    "created",
    "uploading",
    "uploaded",
    "processing",
    "completed",
    "partial",
    "failed",
    "cancelled",
    "expired",
  ],
  transitions: {
    created: ["uploading", "cancelled", "expired"],
    uploading: ["uploaded", "failed", "cancelled", "expired"],
    uploaded: ["processing", "failed", "cancelled", "expired"],
    processing: ["completed", "partial", "failed"],
    completed: [],
    partial: [],
    failed: [],
    cancelled: [],
    expired: [],
  },
  requirements: {
    [transitionEdge("created", "uploading")]: uploadRequirement,
    [transitionEdge("created", "cancelled")]: uploadRequirement,
    [transitionEdge("created", "expired")]: uploadRequirement,
    [transitionEdge("uploading", "uploaded")]: uploadRequirement,
    [transitionEdge("uploading", "failed")]: uploadRequirement,
    [transitionEdge("uploading", "cancelled")]: uploadRequirement,
    [transitionEdge("uploading", "expired")]: uploadRequirement,
    [transitionEdge("uploaded", "processing")]: uploadRequirement,
    [transitionEdge("uploaded", "failed")]: uploadRequirement,
    [transitionEdge("uploaded", "cancelled")]: uploadRequirement,
    [transitionEdge("uploaded", "expired")]: uploadRequirement,
    [transitionEdge("processing", "completed")]: uploadRequirement,
    [transitionEdge("processing", "partial")]: uploadRequirement,
    [transitionEdge("processing", "failed")]: uploadRequirement,
  },
});

const credentialRequirement = requirement("credential.manage", [
  "owner",
  "system",
]);

export const credentialStateMachine = defineStateMachine<CredentialState>({
  name: "credential",
  states: ["active", "rotating", "revoked", "expired"],
  transitions: {
    active: ["rotating", "revoked", "expired"],
    rotating: ["revoked", "expired"],
    revoked: [],
    expired: [],
  },
  requirements: {
    [transitionEdge("active", "rotating")]: credentialRequirement,
    [transitionEdge("active", "revoked")]: credentialRequirement,
    [transitionEdge("active", "expired")]: credentialRequirement,
    [transitionEdge("rotating", "revoked")]: credentialRequirement,
    [transitionEdge("rotating", "expired")]: credentialRequirement,
  },
});

const moduleRequirement = requirement("module.review", [
  "admin",
  "reviewer",
  "system",
]);

export const moduleVersionStateMachine = defineStateMachine<ModuleVersionState>(
  {
    name: "moduleVersion",
    states: [
      "draft",
      "testing",
      "submitted",
      "approved",
      "deprecated",
      "blocked",
    ],
    transitions: {
      draft: ["testing"],
      testing: ["submitted"],
      submitted: ["approved", "blocked"],
      approved: ["deprecated", "blocked"],
      deprecated: [],
      blocked: [],
    },
    requirements: {
      [transitionEdge("draft", "testing")]: moduleRequirement,
      [transitionEdge("testing", "submitted")]: moduleRequirement,
      [transitionEdge("submitted", "approved")]: moduleRequirement,
      [transitionEdge("submitted", "blocked")]: moduleRequirement,
      [transitionEdge("approved", "deprecated")]: moduleRequirement,
      [transitionEdge("approved", "blocked")]: moduleRequirement,
    },
  },
);

export const stateMachines = {
  candidate: candidateStateMachine,
  credential: credentialStateMachine,
  deployment: deploymentStateMachine,
  draft: draftStateMachine,
  moduleVersion: moduleVersionStateMachine,
  serviceVersion: serviceVersionStateMachine,
  upload: uploadStateMachine,
} as const;

export function listLegalTransitions<S extends string>(
  machine: StateMachineDefinition<S>,
): ReadonlyArray<readonly [S, S]> {
  return machine.states.flatMap((from) =>
    (machine.transitions[from] ?? []).map((to) => [from, to] as const),
  );
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function hasResourceId(
  resourceIds: readonly OpaqueValue<string>[],
  entityId: OpaqueValue<string>,
): boolean {
  return resourceIds.some((resourceId) => resourceId.value === entityId.value);
}

export function transitionState<S extends string>(
  machine: StateMachineDefinition<S>,
  entity: StatefulEntity<S>,
  request: StateTransitionRequest<S>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<S>> {
  if (request.from !== entity.state) {
    return err(
      "INVALID_STATE_PRECONDITION",
      "transition from state does not match current state",
      { currentState: entity.state, requestedFrom: request.from },
    );
  }

  if (
    !isPositiveSafeInteger(request.expectedRevision) ||
    !isPositiveSafeInteger(entity.revision)
  ) {
    return err(
      "INVALID_VALUE",
      "transition revision must be positive and safe",
    );
  }

  if (request.expectedRevision !== entity.revision) {
    return err("REVISION_CONFLICT", "transition revision does not match", {
      currentRevision: entity.revision,
      expectedRevision: request.expectedRevision,
    });
  }

  if (request.reason.trim().length === 0) {
    return err("MISSING_REASON", "state transition requires a reason");
  }

  if (request.impactScope.resourceIds.length === 0) {
    return err(
      "IMPACT_SCOPE_REQUIRED",
      "state transition requires an impact scope",
    );
  }

  if (!isSameDomainScope(entity.scope, request.impactScope.scope)) {
    return err(
      "SCOPE_MISMATCH",
      "state transition impact scope does not match entity scope",
      { machine: machine.name },
    );
  }

  if (!hasResourceId(request.impactScope.resourceIds, entity.id)) {
    return err(
      "RESOURCE_NOT_IN_SCOPE",
      "state transition impact scope does not include the entity",
      { machine: machine.name },
    );
  }

  const allowedTargets = machine.transitions[entity.state] ?? [];
  if (!allowedTargets.includes(request.to)) {
    return err("INVALID_STATE_TRANSITION", "state transition is not allowed", {
      from: entity.state,
      to: request.to,
      machine: machine.name,
    });
  }

  const requirementForEdge =
    machine.requirements[transitionEdge(entity.state, request.to)];
  if (requirementForEdge === undefined) {
    return err("INVALID_STATE_TRANSITION", "state transition has no policy", {
      from: entity.state,
      to: request.to,
      machine: machine.name,
    });
  }

  if (
    !requirementForEdge.roles.some((role) => request.actor.roles.includes(role))
  ) {
    return err("ACTOR_NOT_ALLOWED", "actor role cannot perform transition", {
      capability: requirementForEdge.capability,
      machine: machine.name,
    });
  }

  if (!request.actor.capabilities.includes(requirementForEdge.capability)) {
    return err(
      "MISSING_CAPABILITY",
      "actor lacks required transition capability",
      {
        capability: requirementForEdge.capability,
        machine: machine.name,
      },
    );
  }

  if (entity.revision === Number.MAX_SAFE_INTEGER) {
    return err(
      "REVISION_OVERFLOW",
      "state transition revision would exceed safe integer range",
      { machine: machine.name },
    );
  }

  const auditId = auditRecordId(ports.ids.newId("audit"));
  if (!auditId.ok) {
    return auditId;
  }

  const revision = entity.revision + 1;
  const occurredAt = ports.clock.now().toISOString();
  return ok({
    state: request.to,
    revision,
    changedAt: occurredAt,
    changedBy: request.actor.actorId,
    audit: {
      id: auditId.value,
      machine: machine.name,
      entityId: entity.id,
      from: entity.state,
      to: request.to,
      actorId: request.actor.actorId,
      reason: request.reason,
      impactScope: request.impactScope,
      revision,
      occurredAt,
    },
  });
}

export const transitionDraft = (
  entity: StatefulEntity<DraftState>,
  request: StateTransitionRequest<DraftState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<DraftState>> =>
  transitionState(draftStateMachine, entity, request, ports);

export const transitionCandidate = (
  entity: StatefulEntity<CandidateState>,
  request: StateTransitionRequest<CandidateState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<CandidateState>> =>
  transitionState(candidateStateMachine, entity, request, ports);

export const transitionServiceVersion = (
  entity: StatefulEntity<ServiceVersionState>,
  request: StateTransitionRequest<ServiceVersionState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<ServiceVersionState>> =>
  transitionState(serviceVersionStateMachine, entity, request, ports);

export const transitionDeployment = (
  entity: StatefulEntity<DeploymentState>,
  request: StateTransitionRequest<DeploymentState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<DeploymentState>> =>
  transitionState(deploymentStateMachine, entity, request, ports);

export const transitionUpload = (
  entity: StatefulEntity<UploadState>,
  request: StateTransitionRequest<UploadState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<UploadState>> =>
  transitionState(uploadStateMachine, entity, request, ports);

export const transitionCredential = (
  entity: StatefulEntity<CredentialState>,
  request: StateTransitionRequest<CredentialState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<CredentialState>> =>
  transitionState(credentialStateMachine, entity, request, ports);

export const transitionModuleVersion = (
  entity: StatefulEntity<ModuleVersionState>,
  request: StateTransitionRequest<ModuleVersionState>,
  ports: DomainPorts,
): DomainResult<StateTransitionResult<ModuleVersionState>> =>
  transitionState(moduleVersionStateMachine, entity, request, ports);
