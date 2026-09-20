import { createHash, randomBytes } from "node:crypto";

export const packageLayer = "database" as const;

export const migrationHead = "0008_upload_multipart" as const;

export const rlsSessionSettings = {
  workspaceId: "app.workspace_id",
  actorId: "app.actor_id",
} as const;

export const tenantCoreTables = [
  "app.workspaces",
  "app.workspace_members",
  "app.member_role_audit_events",
  "app.projects",
  "app.project_members",
  "app.data_sources",
  "app.data_versions",
  "app.drafts",
  "app.draft_revisions",
  "app.multipart_uploads",
  "app.multipart_upload_parts",
] as const;

export const releaseOpsTables = [
  "app.modules",
  "app.module_versions",
  "app.services",
  "app.service_definitions",
  "app.definition_modules",
  "app.candidates",
  "app.test_runs",
  "app.test_cases",
  "app.service_versions",
  "app.deployments",
  "app.deployment_events",
  "app.access_policies",
  "app.policy_versions",
  "app.credentials",
  "app.credential_secrets",
  "app.credential_rotations",
  "app.request_traces",
  "app.usage_events",
  "app.quota_buckets",
  "app.audit_events",
] as const;

export const repositorySupportTables = [
  "app.idempotency_records",
  "app.outbox_events",
  "app.outbox_consumptions",
] as const;

export const opaqueIdPrefixes = {
  workspace: "ws",
  project: "prj",
  actor: "usr",
  dataSource: "ds",
  dataVersion: "dv",
  draft: "drf",
  upload: "upl",
  service: "svc",
  definition: "def",
  candidate: "cand",
  serviceVersion: "sv",
  deployment: "dep",
  accessPolicy: "ap",
  policyVersion: "pol",
  credential: "cred",
  trace: "trace",
  audit: "audit",
} as const;

export type OpaqueIdResource = keyof typeof opaqueIdPrefixes;

export const opaqueIdUuidV7Format =
  "<resource-prefix>_<canonical-lowercase-hyphenated-uuid>" as const;

export const opaqueIdUuidV7EncodedLengths = {
  workspace: 39,
  project: 40,
  actor: 40,
  dataSource: 39,
  dataVersion: 39,
  draft: 40,
  upload: 40,
  service: 40,
  definition: 40,
  candidate: 41,
  serviceVersion: 39,
  deployment: 40,
  accessPolicy: 39,
  policyVersion: 40,
  credential: 41,
  trace: 42,
  audit: 42,
} as const;

export const opaqueIdUuidV7TestVectors = {
  workspace: "ws_018f0000-0000-7000-8000-000000000001",
  project: "prj_018f0000-0000-7000-8000-000000000201",
  dataSource: "ds_018f0000-0000-7000-8000-000000000301",
  upload: "upl_018f0000-0000-7000-8000-000000000601",
  service: "svc_018f0000-0000-7000-8000-000000001001",
  definition: "def_018f0000-0000-7000-8000-000000001201",
  candidate: "cand_018f0000-0000-7000-8000-000000001301",
  serviceVersion: "sv_018f0000-0000-7000-8000-000000001501",
  deployment: "dep_018f0000-0000-7000-8000-000000001601",
  accessPolicy: "ap_018f0000-0000-7000-8000-000000001701",
  policyVersion: "pol_018f0000-0000-7000-8000-000000001702",
  credential: "cred_018f0000-0000-7000-8000-000000001803",
  trace: "trace_018f0000-0000-7000-8000-000000001901",
  audit: "audit_018f0000-0000-7000-8000-000000001951",
} as const;

export const opaqueIdDatabaseMapping =
  "Public IDs use <resource-prefix>_<canonical-lowercase-hyphenated-uuid>. Hyphens are preserved and UUID text is normalized to lowercase. Decoding validates the expected resource prefix before validating UUIDv7 version and RFC variant bits; a wrong prefix cannot decode as another resource type. encode(decode(id)) returns the normalized original ID." as const;

const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function encodeOpaqueId(
  resource: OpaqueIdResource,
  uuid: string,
): string {
  const canonicalUuid = uuid.toLowerCase();
  if (!uuidV7Pattern.test(canonicalUuid)) {
    throw new Error("database opaque ID UUID must be canonical UUIDv7");
  }
  return `${opaqueIdPrefixes[resource]}_${canonicalUuid}`;
}

export function decodeOpaqueId(
  resource: OpaqueIdResource,
  opaqueId: string,
): string {
  const prefix = `${opaqueIdPrefixes[resource]}_`;
  const canonicalOpaqueId = opaqueId.toLowerCase();
  if (!canonicalOpaqueId.startsWith(prefix)) {
    throw new Error("database opaque ID prefix does not match resource");
  }
  const uuid = canonicalOpaqueId.slice(prefix.length);
  if (!uuidV7Pattern.test(uuid)) {
    throw new Error("database opaque ID UUID must be canonical UUIDv7");
  }
  return uuid;
}

export type Environment = "development" | "test" | "production";

export interface ProjectEnvironmentScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environment: Environment;
}

export interface TenantActorContext {
  readonly scope: ProjectEnvironmentScope;
  readonly actorId: string;
}

export type SqlValue =
  | string
  | number
  | boolean
  | null
  | Date
  | readonly SqlValue[]
  | { readonly [key: string]: SqlValue };

export interface SqlResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

export interface SqlExecutor {
  query<Row extends object = Record<string, unknown>>(
    sql: string,
    params?: readonly SqlValue[],
  ): Promise<SqlResult<Row>>;
}

export interface DatabaseTransaction extends SqlExecutor {
  readonly context: TenantActorContext;
}

export const pinnedTransactionConnectionBrand: unique symbol = Symbol(
  "PinnedTransactionConnection",
);

export interface PinnedTransactionConnection extends SqlExecutor {
  readonly [pinnedTransactionConnectionBrand]: true;
  release(): void | Promise<void>;
}

export interface TransactionConnectionProvider {
  connect(): Promise<PinnedTransactionConnection>;
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
}

export function assertProjectEnvironmentScope(
  scope: ProjectEnvironmentScope,
): void {
  requireNonEmpty("workspaceId", scope.workspaceId);
  requireNonEmpty("projectId", scope.projectId);
  if (
    scope.environment !== "development" &&
    scope.environment !== "test" &&
    scope.environment !== "production"
  ) {
    throw new Error("environment must be development, test, or production");
  }
}

export async function withTenantTransaction<Result>(
  provider: TransactionConnectionProvider,
  context: TenantActorContext,
  work: (transaction: DatabaseTransaction) => Promise<Result>,
): Promise<Result> {
  assertProjectEnvironmentScope(context.scope);
  requireNonEmpty("actorId", context.actorId);

  const connection = await provider.connect();
  const transaction: DatabaseTransaction = {
    context,
    query: (sql, params) => connection.query(sql, params),
  };

  let transactionStarted = false;
  let primaryError: unknown;
  try {
    await connection.query("BEGIN");
    transactionStarted = true;
    await transaction.query(
      "SELECT set_config($1, $2, true), set_config($3, $4, true)",
      [
        rlsSessionSettings.workspaceId,
        context.scope.workspaceId,
        rlsSessionSettings.actorId,
        context.actorId,
      ],
    );
    const result = await work(transaction);
    await transaction.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    primaryError = error;
    if (transactionStarted) {
      try {
        await transaction.query("ROLLBACK");
      } catch {
        // Preserve the original transaction failure; cleanup errors are secondary.
      }
    }
    throw error;
  } finally {
    try {
      await connection.release();
    } catch (releaseError) {
      if (primaryError === undefined) {
        throw releaseError;
      }
    }
  }
}

export type IdempotencyDecision =
  | { readonly kind: "acquired" }
  | {
      readonly kind: "completed";
      readonly responseDigest: string;
      readonly resourceType: string | null;
      readonly resourceId: string | null;
    };

export interface EnsureIdempotencyInput {
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestDigest: string;
}

export interface CompleteIdempotencyInput extends EnsureIdempotencyInput {
  readonly responseDigest: string;
  readonly resourceType: string;
  readonly resourceId: string;
}

export interface IdempotencyRepository {
  ensure(input: EnsureIdempotencyInput): Promise<IdempotencyDecision>;
  complete(input: CompleteIdempotencyInput): Promise<void>;
}

export function createIdempotencyRepository(
  transaction: DatabaseTransaction,
): IdempotencyRepository {
  return {
    async ensure(input) {
      const result = await transaction.query<{
        kind: string;
        response_digest: string | null;
        resource_type: string | null;
        resource_id: string | null;
      }>(
        `
          SELECT *
          FROM app.ensure_idempotency_key(
            $1::uuid,
            $2::uuid,
            $3::app.environment,
            $4::text,
            $5::text,
            $6::text
          ) AS decision
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          input.operation,
          input.idempotencyKey,
          input.requestDigest,
        ],
      );
      const decision = result.rows[0];
      if (!decision) {
        throw new Error("idempotency decision was not returned");
      }
      if (decision.kind === "acquired") {
        return { kind: "acquired" };
      }
      if (decision.kind === "completed" && decision.response_digest) {
        return {
          kind: "completed",
          responseDigest: decision.response_digest,
          resourceType: decision.resource_type,
          resourceId: decision.resource_id,
        };
      }
      throw new Error("idempotency decision was not valid");
    },
    async complete(input) {
      await transaction.query(
        `
          SELECT app.complete_idempotency_key(
            $1::uuid,
            $2::uuid,
            $3::app.environment,
            $4::text,
            $5::text,
            $6::text,
            $7::text,
            $8::text,
            $9::uuid
          )
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          input.operation,
          input.idempotencyKey,
          input.requestDigest,
          input.responseDigest,
          input.resourceType,
          input.resourceId,
        ],
      );
    },
  };
}

export interface AppendOutboxEventInput {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateRevision: number;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: { readonly [key: string]: SqlValue };
  readonly idempotencyKey?: string;
  readonly requestDigest?: string;
}

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly workspace_id: string;
  readonly project_id: string;
  readonly environment: Environment;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly aggregate_revision: number;
  readonly event_type: string;
  readonly event_version: number;
  readonly logical_event_key: string;
  readonly payload: { readonly [key: string]: SqlValue };
  readonly publish_attempts: number;
  readonly claim_token: string;
  readonly claimed_by: string;
  readonly claim_expires_at: Date | string;
}

export interface OutboxRepository {
  append(event: AppendOutboxEventInput): Promise<void>;
  claim(
    batchSize: number,
    publisherId: string,
    leaseSeconds: number,
  ): Promise<readonly ClaimedOutboxEvent[]>;
  markPublished(eventId: string, claimToken: string): Promise<void>;
  releaseOrRetry(
    eventId: string,
    claimToken: string,
    availableAt: Date | string,
  ): Promise<void>;
  consumeOnce(consumerName: string, eventId: string): Promise<boolean>;
}

export const memberRbacRoles = Object.freeze([
  "admin",
  "editor",
  "observer",
  "operator",
  "owner",
  "publisher",
  "reviewer",
] as const);

export type MemberRbacRole = (typeof memberRbacRoles)[number];

export type MemberRoleChangeScope =
  | {
      readonly kind: "workspace";
      readonly workspaceId: string;
    }
  | {
      readonly kind: "project";
      readonly workspaceId: string;
      readonly projectId: string;
    };

export type MemberRoleChangeResult =
  | {
      readonly kind: "changed";
      readonly previousRole: MemberRbacRole;
      readonly nextRole: MemberRbacRole;
      readonly revision: number;
    }
  | { readonly kind: "not_found_or_forbidden" }
  | { readonly kind: "last_owner_conflict" };

export interface ChangeMemberRoleAndRecordAuditInput {
  readonly actorId: string;
  readonly targetActorId: string;
  readonly scope: MemberRoleChangeScope;
  readonly nextRole: MemberRbacRole;
  readonly authorization: {
    readonly actorId: string;
    readonly scope: MemberRoleChangeScope;
    readonly nextRole: MemberRbacRole;
    readonly manageExistingOwner: boolean;
  };
  readonly occurredAt: string;
}

export interface MemberRoleChangeRepository {
  changeMemberRoleAndRecordAudit(
    input: ChangeMemberRoleAndRecordAuditInput,
  ): Promise<MemberRoleChangeResult>;
}

export interface ModuleCatalogReference {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest: string;
}

export type ModuleVersionReviewStatus =
  | "draft"
  | "testing"
  | "submitted"
  | "approved"
  | "deprecated"
  | "blocked";

export interface ModuleCatalogRecord extends ModuleCatalogReference {
  readonly moduleVersionId: string;
  readonly moduleName: string;
  readonly moduleKind: "source" | "capability" | "output" | "prompt";
  readonly status: ModuleVersionReviewStatus;
  readonly signatureDigest: string;
}

export interface ApprovedModuleCatalogRecord extends ModuleCatalogRecord {
  readonly status: "approved";
}

export interface AffectedServiceVersionRecord {
  readonly serviceVersionId: string;
  readonly serviceId: string;
  readonly serviceVersion: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly status:
    | "approved"
    | "deploying"
    | "published"
    | "suspended"
    | "retired";
}

export interface ModuleCatalogRepository {
  findExact(
    reference: ModuleCatalogReference,
  ): Promise<ModuleCatalogRecord | null>;
  findApprovedExact(
    reference: ModuleCatalogReference,
  ): Promise<ApprovedModuleCatalogRecord | null>;
  findAffectedServiceVersions(
    reference: ModuleCatalogReference,
  ): Promise<readonly AffectedServiceVersionRecord[]>;
}

export type DraftCreationMode = "blank" | "template" | "copy_version";

export type DraftStatus =
  | "editing"
  | "validating"
  | "ready"
  | "building"
  | "built"
  | "submitted";

export type WizardStep =
  | "goal"
  | "data"
  | "modules"
  | "configuration"
  | "preview"
  | "test"
  | "publish";

export interface DraftCreationScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environment: Environment;
}

export interface CopyableServiceVersion {
  readonly sourceVersionId: string;
  readonly definitionId: string;
  readonly definitionDigest: string;
  readonly definition: unknown;
}

export interface CreatedDraftRecord {
  readonly draftId: string;
  readonly projectId: string;
  readonly environment: Environment;
  readonly name: string;
  readonly status: DraftStatus;
  readonly revision: number;
  readonly currentStep: WizardStep;
  readonly goal?: unknown;
  readonly document: unknown;
  readonly updatedAt: string;
}

export type CreateDraftRepositoryResult =
  | {
      readonly kind: "created" | "replayed";
      readonly draft: CreatedDraftRecord;
    }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "source_version_not_found" };

export interface DraftCreationRepository {
  findCopyableServiceVersion(input: {
    readonly scope: DraftCreationScope;
    readonly actorId: string;
    readonly sourceVersionId: string;
  }): Promise<CopyableServiceVersion | null>;
  createDraft(input: {
    readonly scope: DraftCreationScope;
    readonly actorId: string;
    readonly draftId: string;
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly creationMode: DraftCreationMode;
    readonly templateId: string | null;
    readonly sourceVersionId: string | null;
    readonly name: string;
    readonly document: unknown;
    readonly occurredAt: string;
  }): Promise<CreateDraftRepositoryResult>;
}

export type DraftUpdateRepositoryResult =
  | {
      readonly kind: "updated" | "replayed";
      readonly draft: CreatedDraftRecord;
    }
  | {
      readonly kind: "conflict";
      readonly serverRevision: number;
      readonly serverDocument: unknown;
      readonly baseDocument: unknown;
      readonly updatedAt: string;
    }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "not_found_or_forbidden" };

export interface DraftUpdateRepository {
  updateDraft(input: {
    readonly scope: DraftCreationScope;
    readonly actorId: string;
    readonly draftId: string;
    readonly expectedRevision: number;
    readonly idempotencyKey: string;
    readonly requestDigest: string;
    readonly patch: Record<string, unknown>;
    readonly currentStep?: WizardStep;
    readonly occurredAt: string;
  }): Promise<DraftUpdateRepositoryResult>;
}

export function catalogModuleNameForManifestId(moduleId: string): string {
  if (!/^[a-z]+\.[a-z0-9-]+$/.test(moduleId)) {
    throw new Error(
      "moduleId must match ModuleManifestV1 before catalog lookup",
    );
  }
  return moduleId.replaceAll(".", "_").replaceAll("-", "_");
}

export function createModuleCatalogRepository(
  transaction: DatabaseTransaction,
): ModuleCatalogRepository {
  return {
    async findExact(reference) {
      const result = await transaction.query<{
        module_version_id: string;
        module_name: string;
        module_kind: "source" | "capability" | "output" | "prompt";
        version: string;
        status: ModuleVersionReviewStatus;
        artifact_digest: string;
        signature_digest: string;
      }>(
        `
          SELECT
            id AS module_version_id,
            module_name,
            module_kind,
            version,
            status,
            artifact_digest,
            signature_digest
          FROM app.module_versions
          WHERE module_name = $1::text
            AND version = $2::text
            AND artifact_digest = $3::text
          LIMIT 1
        `,
        [
          catalogModuleNameForManifestId(reference.moduleId),
          reference.exactVersion,
          reference.artifactDigest,
        ],
      );
      const row = result.rows[0];
      if (row === undefined) {
        return null;
      }
      const expectedModuleName = catalogModuleNameForManifestId(
        reference.moduleId,
      );
      if (!isValidModuleCatalogRow(row, reference, expectedModuleName)) {
        return null;
      }
      return {
        moduleId: reference.moduleId,
        exactVersion: row.version,
        artifactDigest: row.artifact_digest,
        moduleVersionId: row.module_version_id,
        moduleName: row.module_name,
        moduleKind: row.module_kind,
        status: row.status,
        signatureDigest: row.signature_digest,
      };
    },
    async findApprovedExact(reference) {
      const record = await this.findExact(reference);
      return record?.status === "approved"
        ? { ...record, status: "approved" }
        : null;
    },
    async findAffectedServiceVersions(reference) {
      const result = await transaction.query<{
        service_version_id: string;
        service_id: string;
        service_version: string;
        definition_id: string;
        definition_digest: string;
        status: AffectedServiceVersionRecord["status"];
      }>(
        `
          SELECT
            sv.id AS service_version_id,
            sv.service_id,
            sv.version AS service_version,
            sv.definition_id,
            sv.definition_digest,
            sv.status
          FROM app.definition_modules dm
          INNER JOIN app.service_versions sv
            ON sv.workspace_id = dm.workspace_id
           AND sv.project_id = dm.project_id
           AND sv.environment = dm.environment
           AND sv.definition_id = dm.definition_id
          WHERE dm.workspace_id = $1::uuid
            AND dm.project_id = $2::uuid
            AND dm.environment = $3::app.environment
            AND dm.module_name = $4::text
            AND dm.exact_version = $5::text
            AND dm.artifact_digest = $6::text
          ORDER BY sv.service_id ASC, sv.version ASC, sv.id ASC
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          catalogModuleNameForManifestId(reference.moduleId),
          reference.exactVersion,
          reference.artifactDigest,
        ],
      );
      const byKey = new Map<string, AffectedServiceVersionRecord>();
      for (const row of result.rows) {
        if (!isValidAffectedServiceVersionRow(row)) {
          continue;
        }
        byKey.set(row.service_version_id, {
          serviceVersionId: row.service_version_id,
          serviceId: row.service_id,
          serviceVersion: row.service_version,
          definitionId: row.definition_id,
          definitionDigest: row.definition_digest,
          status: row.status,
        });
      }
      return [...byKey.values()].sort(
        (left, right) =>
          left.serviceId.localeCompare(right.serviceId) ||
          left.serviceVersion.localeCompare(right.serviceVersion) ||
          left.serviceVersionId.localeCompare(right.serviceVersionId),
      );
    },
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(stableJson(value))
    .digest("hex")}`;
}

const databaseSha256DigestPattern = /^sha256:[a-f0-9]{64}$/;

function isModuleReviewStatus(
  value: unknown,
): value is ModuleVersionReviewStatus {
  return (
    value === "draft" ||
    value === "testing" ||
    value === "submitted" ||
    value === "approved" ||
    value === "deprecated" ||
    value === "blocked"
  );
}

function isModuleKind(
  value: unknown,
): value is "source" | "capability" | "output" | "prompt" {
  return (
    value === "source" ||
    value === "capability" ||
    value === "output" ||
    value === "prompt"
  );
}

function isServiceVersionStatus(
  value: unknown,
): value is AffectedServiceVersionRecord["status"] {
  return (
    value === "approved" ||
    value === "deploying" ||
    value === "published" ||
    value === "suspended" ||
    value === "retired"
  );
}

function isValidModuleCatalogRow(
  row: {
    readonly module_version_id?: unknown;
    readonly module_name?: unknown;
    readonly module_kind?: unknown;
    readonly version?: unknown;
    readonly status?: unknown;
    readonly artifact_digest?: unknown;
    readonly signature_digest?: unknown;
  },
  reference: ModuleCatalogReference,
  expectedModuleName: string,
): row is {
  readonly module_version_id: string;
  readonly module_name: string;
  readonly module_kind: "source" | "capability" | "output" | "prompt";
  readonly version: string;
  readonly status: ModuleVersionReviewStatus;
  readonly artifact_digest: string;
  readonly signature_digest: string;
} {
  return (
    typeof row.module_version_id === "string" &&
    uuidV7Pattern.test(row.module_version_id) &&
    row.module_name === expectedModuleName &&
    isModuleKind(row.module_kind) &&
    row.version === reference.exactVersion &&
    isModuleReviewStatus(row.status) &&
    row.artifact_digest === reference.artifactDigest &&
    typeof row.signature_digest === "string" &&
    databaseSha256DigestPattern.test(row.signature_digest)
  );
}

function isValidAffectedServiceVersionRow(row: {
  readonly service_version_id?: unknown;
  readonly service_id?: unknown;
  readonly service_version?: unknown;
  readonly definition_id?: unknown;
  readonly definition_digest?: unknown;
  readonly status?: unknown;
}): row is {
  readonly service_version_id: string;
  readonly service_id: string;
  readonly service_version: string;
  readonly definition_id: string;
  readonly definition_digest: string;
  readonly status: AffectedServiceVersionRecord["status"];
} {
  return (
    typeof row.service_version_id === "string" &&
    uuidV7Pattern.test(row.service_version_id) &&
    typeof row.service_id === "string" &&
    uuidV7Pattern.test(row.service_id) &&
    typeof row.service_version === "string" &&
    typeof row.definition_id === "string" &&
    uuidV7Pattern.test(row.definition_id) &&
    typeof row.definition_digest === "string" &&
    databaseSha256DigestPattern.test(row.definition_digest) &&
    isServiceVersionStatus(row.status)
  );
}

function isIdempotencyConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes(
      "idempotency key reused with different request digest",
    )
  );
}

function isDraftStatus(value: unknown): value is DraftStatus {
  return (
    value === "editing" ||
    value === "validating" ||
    value === "ready" ||
    value === "building" ||
    value === "built" ||
    value === "submitted"
  );
}

function isWizardStep(value: unknown): value is WizardStep {
  return (
    value === "goal" ||
    value === "data" ||
    value === "modules" ||
    value === "configuration" ||
    value === "preview" ||
    value === "test" ||
    value === "publish"
  );
}

function maybeGoal(document: unknown): unknown {
  return document !== null &&
    typeof document === "object" &&
    !Array.isArray(document) &&
    "goal" in document
    ? (document as { readonly goal?: unknown }).goal
    : undefined;
}

interface DraftRow {
  readonly id: string;
  readonly project_id: string;
  readonly environment: Environment;
  readonly title: string;
  readonly state: DraftStatus;
  readonly revision: string | number;
  readonly current_step: WizardStep;
  readonly document: unknown;
  readonly updated_at: Date | string;
}

function mapDraftRow(row: DraftRow): CreatedDraftRecord {
  const revision = Number(row.revision);
  if (
    !isDraftStatus(row.state) ||
    !isWizardStep(row.current_step) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    throw new Error("draft row shape is invalid");
  }
  const goal = maybeGoal(row.document);
  return {
    draftId: encodeOpaqueId("draft", row.id),
    projectId: encodeOpaqueId("project", row.project_id),
    environment: row.environment,
    name: row.title,
    status: row.state,
    revision,
    currentStep: row.current_step,
    ...(goal !== undefined ? { goal } : {}),
    document: row.document,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

function dbIsRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneDatabaseJson(value: unknown): unknown {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function applyDatabaseMergePatch(target: unknown, patch: unknown): unknown {
  if (!dbIsRecord(patch)) {
    return cloneDatabaseJson(patch);
  }
  const base = dbIsRecord(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
    } else {
      base[key] = dbIsRecord(value)
        ? applyDatabaseMergePatch(base[key], value)
        : cloneDatabaseJson(value);
    }
  }
  return base;
}

function decodeDraftCreationScope(scope: DraftCreationScope): {
  readonly workspaceUuid: string;
  readonly projectUuid: string;
} {
  return {
    workspaceUuid: decodeOpaqueId("workspace", scope.workspaceId),
    projectUuid: decodeOpaqueId("project", scope.projectId),
  };
}

export function createPostgresDraftCreationRepository(
  provider: TransactionConnectionProvider,
): DraftCreationRepository {
  return {
    async findCopyableServiceVersion(input) {
      const scope = decodeDraftCreationScope(input.scope);
      const actorUuid = decodeOpaqueId("actor", input.actorId);
      const sourceVersionUuid = decodeOpaqueId(
        "serviceVersion",
        input.sourceVersionId,
      );
      return withTenantTransaction(
        provider,
        {
          scope: {
            workspaceId: scope.workspaceUuid,
            projectId: scope.projectUuid,
            environment: input.scope.environment,
          },
          actorId: actorUuid,
        },
        async (transaction) => {
          const result = await transaction.query<{
            service_version_id: string;
            definition_id: string;
            definition_digest: string;
            canonical_json: unknown;
          }>(
            `
              SELECT
                sv.id AS service_version_id,
                sv.definition_id,
                sv.definition_digest,
                sd.canonical_json
              FROM app.service_versions sv
              INNER JOIN app.service_definitions sd
                ON sd.workspace_id = sv.workspace_id
               AND sd.project_id = sv.project_id
               AND sd.environment = sv.environment
               AND sd.id = sv.definition_id
               AND sd.digest = sv.definition_digest
              WHERE sv.workspace_id = $1::uuid
                AND sv.project_id = $2::uuid
                AND sv.environment = $3::app.environment
                AND sv.id = $4::uuid
              LIMIT 1
            `,
            [
              scope.workspaceUuid,
              scope.projectUuid,
              input.scope.environment,
              sourceVersionUuid,
            ],
          );
          const row = result.rows[0];
          if (!row) {
            return null;
          }
          return {
            sourceVersionId: encodeOpaqueId(
              "serviceVersion",
              row.service_version_id,
            ),
            definitionId: encodeOpaqueId("definition", row.definition_id),
            definitionDigest: row.definition_digest,
            definition: row.canonical_json,
          };
        },
      );
    },

    async createDraft(input) {
      if (!databaseSha256DigestPattern.test(input.requestDigest)) {
        throw new Error("draft request digest must be sha256");
      }
      const scope = decodeDraftCreationScope(input.scope);
      const actorUuid = decodeOpaqueId("actor", input.actorId);
      const draftUuid = decodeOpaqueId("draft", input.draftId);
      const sourceVersionUuid = input.sourceVersionId
        ? decodeOpaqueId("serviceVersion", input.sourceVersionId)
        : null;
      try {
        return await withTenantTransaction(
          provider,
          {
            scope: {
              workspaceId: scope.workspaceUuid,
              projectId: scope.projectUuid,
              environment: input.scope.environment,
            },
            actorId: actorUuid,
          },
          async (transaction) => {
            const idempotency = createIdempotencyRepository(transaction);
            const decision = await idempotency.ensure({
              operation: "draft.create",
              idempotencyKey: input.idempotencyKey,
              requestDigest: input.requestDigest,
            });
            if (decision.kind === "completed") {
              if (decision.resourceType !== "draft" || !decision.resourceId) {
                throw new Error("draft idempotency result is invalid");
              }
              const replayed = await transaction.query<DraftRow>(
                `
                  SELECT
                    id,
                    project_id,
                    environment,
                    title,
                    state,
                    revision,
                    current_step,
                    document,
                    updated_at
                  FROM app.drafts
                  WHERE workspace_id = $1::uuid
                    AND project_id = $2::uuid
                    AND environment = $3::app.environment
                    AND id = $4::uuid
                  LIMIT 1
                `,
                [
                  scope.workspaceUuid,
                  scope.projectUuid,
                  transaction.context.scope.environment,
                  decision.resourceId,
                ],
              );
              const row = replayed.rows[0];
              if (!row) {
                throw new Error("draft idempotency resource was not found");
              }
              return { kind: "replayed", draft: mapDraftRow(row) };
            }

            if (sourceVersionUuid !== null) {
              const source = await transaction.query<{ id: string }>(
                `
                  SELECT id
                  FROM app.service_versions
                  WHERE workspace_id = $1::uuid
                    AND project_id = $2::uuid
                    AND environment = $3::app.environment
                    AND id = $4::uuid
                  LIMIT 1
                `,
                [
                  scope.workspaceUuid,
                  scope.projectUuid,
                  transaction.context.scope.environment,
                  sourceVersionUuid,
                ],
              );
              if (!source.rows[0]) {
                return { kind: "source_version_not_found" };
              }
            }

            const inserted = await transaction.query<DraftRow>(
              `
                INSERT INTO app.drafts (
                  id,
                  workspace_id,
                  project_id,
                  environment,
                  revision,
                  state,
                  current_step,
                  creation_mode,
                  template_id,
                  source_version_id,
                  title,
                  document,
                  created_by,
                  updated_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4::app.environment,
                  1,
                  'editing'::app.draft_state,
                  'goal'::app.wizard_step,
                  $5::app.draft_creation_mode,
                  $6::text,
                  $7::uuid,
                  $8::text,
                  $9::jsonb,
                  $10::uuid,
                  $10::uuid
                )
                RETURNING
                  id,
                  project_id,
                  environment,
                  title,
                  state,
                  revision,
                  current_step,
                  document,
                  updated_at
              `,
              [
                draftUuid,
                scope.workspaceUuid,
                scope.projectUuid,
                input.scope.environment,
                input.creationMode,
                input.templateId,
                sourceVersionUuid,
                input.name,
                input.document as SqlValue,
                actorUuid,
              ],
            );
            const row = inserted.rows[0];
            if (!row) {
              throw new Error("draft insert did not return a row");
            }

            await transaction.query(
              `
                INSERT INTO app.draft_revisions (
                  workspace_id,
                  project_id,
                  environment,
                  draft_id,
                  revision,
                  document,
                  changed_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::app.environment,
                  $4::uuid,
                  1,
                  $5::jsonb,
                  $6::uuid
                )
              `,
              [
                scope.workspaceUuid,
                scope.projectUuid,
                input.scope.environment,
                draftUuid,
                input.document as SqlValue,
                actorUuid,
              ],
            );

            const draft = mapDraftRow(row);
            await idempotency.complete({
              operation: "draft.create",
              idempotencyKey: input.idempotencyKey,
              requestDigest: input.requestDigest,
              responseDigest: sha256({
                draftId: draft.draftId,
                revision: draft.revision,
                updatedAt: draft.updatedAt,
              }),
              resourceType: "draft",
              resourceId: draftUuid,
            });
            return { kind: "created", draft };
          },
        );
      } catch (error) {
        if (isIdempotencyConflict(error)) {
          return { kind: "idempotency_conflict" };
        }
        throw error;
      }
    },
  };
}

export function createPostgresDraftUpdateRepository(
  provider: TransactionConnectionProvider,
): DraftUpdateRepository {
  return {
    async updateDraft(input) {
      if (!databaseSha256DigestPattern.test(input.requestDigest)) {
        throw new Error("draft update request digest must be sha256");
      }
      const scope = decodeDraftCreationScope(input.scope);
      const actorUuid = decodeOpaqueId("actor", input.actorId);
      const draftUuid = decodeOpaqueId("draft", input.draftId);
      try {
        return await withTenantTransaction(
          provider,
          {
            scope: {
              workspaceId: scope.workspaceUuid,
              projectId: scope.projectUuid,
              environment: input.scope.environment,
            },
            actorId: actorUuid,
          },
          async (transaction) => {
            const idempotency = createIdempotencyRepository(transaction);
            const decision = await idempotency.ensure({
              operation: `draft.update.${draftUuid}`,
              idempotencyKey: input.idempotencyKey,
              requestDigest: input.requestDigest,
            });
            if (decision.kind === "completed") {
              if (decision.resourceType !== "draft" || !decision.resourceId) {
                throw new Error("draft update idempotency result is invalid");
              }
              const replayed = await transaction.query<DraftRow>(
                `
                  SELECT
                    id,
                    project_id,
                    environment,
                    title,
                    state,
                    revision,
                    current_step,
                    document,
                    updated_at
                  FROM app.drafts
                  WHERE workspace_id = $1::uuid
                    AND project_id = $2::uuid
                    AND environment = $3::app.environment
                    AND id = $4::uuid
                  LIMIT 1
                `,
                [
                  scope.workspaceUuid,
                  scope.projectUuid,
                  transaction.context.scope.environment,
                  decision.resourceId,
                ],
              );
              const row = replayed.rows[0];
              if (!row) {
                throw new Error("draft update idempotency resource not found");
              }
              return { kind: "replayed", draft: mapDraftRow(row) };
            }

            const current = await transaction.query<DraftRow>(
              `
                SELECT
                  id,
                  project_id,
                  environment,
                  title,
                  state,
                  revision,
                  current_step,
                  document,
                  updated_at
                FROM app.drafts
                WHERE workspace_id = $1::uuid
                  AND project_id = $2::uuid
                  AND environment = $3::app.environment
                  AND id = $4::uuid
                FOR UPDATE
              `,
              [
                scope.workspaceUuid,
                scope.projectUuid,
                transaction.context.scope.environment,
                draftUuid,
              ],
            );
            const currentRow = current.rows[0];
            if (!currentRow) {
              return { kind: "not_found_or_forbidden" };
            }

            const currentRevision = Number(currentRow.revision);
            if (currentRevision !== input.expectedRevision) {
              const baseRevision = await transaction.query<{
                document: unknown;
              }>(
                `
                  SELECT document
                  FROM app.draft_revisions
                  WHERE workspace_id = $1::uuid
                    AND project_id = $2::uuid
                    AND environment = $3::app.environment
                    AND draft_id = $4::uuid
                    AND revision = $5::bigint
                  LIMIT 1
                `,
                [
                  scope.workspaceUuid,
                  scope.projectUuid,
                  transaction.context.scope.environment,
                  draftUuid,
                  input.expectedRevision,
                ],
              );
              return {
                kind: "conflict",
                serverRevision: currentRevision,
                serverDocument: currentRow.document,
                baseDocument: baseRevision.rows[0]?.document ?? {},
                updatedAt:
                  currentRow.updated_at instanceof Date
                    ? currentRow.updated_at.toISOString()
                    : currentRow.updated_at,
              };
            }

            const nextDocument = applyDatabaseMergePatch(
              currentRow.document,
              input.patch,
            );
            const nextRevision = currentRevision + 1;
            const nextTitle =
              dbIsRecord(nextDocument) && typeof nextDocument.name === "string"
                ? nextDocument.name
                : currentRow.title;
            const updated = await transaction.query<DraftRow>(
              `
                UPDATE app.drafts
                SET
                  revision = $5::bigint,
                  current_step = COALESCE($6::app.wizard_step, current_step),
                  title = $7::text,
                  document = $8::jsonb,
                  updated_by = $9::uuid
                WHERE workspace_id = $1::uuid
                  AND project_id = $2::uuid
                  AND environment = $3::app.environment
                  AND id = $4::uuid
                RETURNING
                  id,
                  project_id,
                  environment,
                  title,
                  state,
                  revision,
                  current_step,
                  document,
                  updated_at
              `,
              [
                scope.workspaceUuid,
                scope.projectUuid,
                transaction.context.scope.environment,
                draftUuid,
                nextRevision,
                input.currentStep ?? null,
                nextTitle,
                nextDocument as SqlValue,
                actorUuid,
              ],
            );
            const updatedRow = updated.rows[0];
            if (!updatedRow) {
              return { kind: "not_found_or_forbidden" };
            }
            await transaction.query(
              `
                INSERT INTO app.draft_revisions (
                  workspace_id,
                  project_id,
                  environment,
                  draft_id,
                  revision,
                  document,
                  changed_by
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::app.environment,
                  $4::uuid,
                  $5::bigint,
                  $6::jsonb,
                  $7::uuid
                )
              `,
              [
                scope.workspaceUuid,
                scope.projectUuid,
                transaction.context.scope.environment,
                draftUuid,
                nextRevision,
                nextDocument as SqlValue,
                actorUuid,
              ],
            );

            const draft = mapDraftRow(updatedRow);
            await idempotency.complete({
              operation: `draft.update.${draftUuid}`,
              idempotencyKey: input.idempotencyKey,
              requestDigest: input.requestDigest,
              responseDigest: sha256({
                draftId: draft.draftId,
                revision: draft.revision,
                updatedAt: draft.updatedAt,
              }),
              resourceType: "draft",
              resourceId: draftUuid,
            });
            return { kind: "updated", draft };
          },
        );
      } catch (error) {
        if (isIdempotencyConflict(error)) {
          return { kind: "idempotency_conflict" };
        }
        throw error;
      }
    },
  };
}

export function createOutboxRepository(
  transaction: DatabaseTransaction,
): OutboxRepository {
  return {
    async append(event) {
      await transaction.query(
        `
          INSERT INTO app.outbox_events (
            id,
            workspace_id,
            project_id,
            environment,
            aggregate_type,
            aggregate_id,
            aggregate_revision,
            event_type,
            event_version,
            logical_event_key,
            payload,
            idempotency_key,
            request_digest
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::app.environment,
            $5::text,
            $6::uuid,
            $7::bigint,
            $8::text,
            $9::integer,
            $5::text || ':' || $6::uuid::text || ':' || $7::bigint::text || ':' || $8::text,
            $10::jsonb,
            $11::text,
            $12::text
          )
        `,
        [
          event.id,
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          event.aggregateType,
          event.aggregateId,
          event.aggregateRevision,
          event.eventType,
          event.eventVersion,
          event.payload,
          event.idempotencyKey ?? null,
          event.requestDigest ?? null,
        ],
      );
    },
    async claim(batchSize, publisherId, leaseSeconds) {
      const result = await transaction.query<ClaimedOutboxEvent>(
        `
          SELECT *
          FROM app.claim_outbox_events(
            $1::uuid,
            $2::app.environment,
            $3::integer,
            $4::text,
            $5::integer
          )
        `,
        [
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          batchSize,
          publisherId,
          leaseSeconds,
        ],
      );
      return result.rows;
    },
    async markPublished(eventId, claimToken) {
      await transaction.query(
        `
          SELECT app.mark_outbox_published(
            $1::uuid,
            $2::app.environment,
            $3::uuid,
            $4::uuid
          )
        `,
        [
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          eventId,
          claimToken,
        ],
      );
    },
    async releaseOrRetry(eventId, claimToken, availableAt) {
      await transaction.query(
        `
          SELECT app.release_or_retry_outbox_event(
            $1::uuid,
            $2::app.environment,
            $3::uuid,
            $4::uuid,
            $5::timestamptz
          )
        `,
        [
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          eventId,
          claimToken,
          availableAt,
        ],
      );
    },
    async consumeOnce(consumerName, eventId) {
      const result = await transaction.query<{ consumed: boolean }>(
        `
          SELECT app.consume_outbox_event(
            $1::text,
            $2::uuid,
            $3::uuid,
            $4::app.environment
          ) AS consumed
        `,
        [
          consumerName,
          eventId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
        ],
      );
      return result.rows[0]?.consumed === true;
    },
  };
}

function isMemberRbacRole(value: unknown): value is MemberRbacRole {
  return memberRbacRoles.includes(value as MemberRbacRole);
}

function memberRoleScopesEqual(
  left: MemberRoleChangeScope,
  right: MemberRoleChangeScope,
): boolean {
  if (left.kind !== right.kind || left.workspaceId !== right.workspaceId) {
    return false;
  }
  if (left.kind === "workspace") {
    return true;
  }
  return right.kind === "project" && left.projectId === right.projectId;
}

function uuidV7ForAuditId(now = Date.now()): string {
  const bytes = randomBytes(16);
  const milliseconds = BigInt(now);
  bytes[0] = Number((milliseconds >> 40n) & 0xffn);
  bytes[1] = Number((milliseconds >> 32n) & 0xffn);
  bytes[2] = Number((milliseconds >> 24n) & 0xffn);
  bytes[3] = Number((milliseconds >> 16n) & 0xffn);
  bytes[4] = Number((milliseconds >> 8n) & 0xffn);
  bytes[5] = Number(milliseconds & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function notFoundMemberRoleChange(): MemberRoleChangeResult {
  return { kind: "not_found_or_forbidden" };
}

function decodeMemberRoleChangeInput(
  input: ChangeMemberRoleAndRecordAuditInput,
):
  | {
      readonly ok: true;
      readonly value: {
        readonly actorUuid: string;
        readonly targetActorUuid: string;
        readonly workspaceUuid: string;
        readonly projectUuid: string | null;
      };
    }
  | { readonly ok: false } {
  if (
    input.authorization.actorId !== input.actorId ||
    input.authorization.nextRole !== input.nextRole ||
    !memberRoleScopesEqual(input.authorization.scope, input.scope)
  ) {
    return { ok: false };
  }

  try {
    return {
      ok: true,
      value: {
        actorUuid: decodeOpaqueId("actor", input.actorId),
        targetActorUuid: decodeOpaqueId("actor", input.targetActorId),
        workspaceUuid: decodeOpaqueId("workspace", input.scope.workspaceId),
        projectUuid:
          input.scope.kind === "project"
            ? decodeOpaqueId("project", input.scope.projectId)
            : null,
      },
    };
  } catch {
    return { ok: false };
  }
}

export function createPostgresMemberRoleChangeRepository(
  provider: TransactionConnectionProvider,
): MemberRoleChangeRepository {
  return {
    async changeMemberRoleAndRecordAudit(input) {
      if (!isMemberRbacRole(input.nextRole)) {
        return notFoundMemberRoleChange();
      }
      const decoded = decodeMemberRoleChangeInput(input);
      if (!decoded.ok) {
        return notFoundMemberRoleChange();
      }

      const connection = await provider.connect();
      let transactionStarted = false;
      let primaryError: unknown;
      try {
        await connection.query("BEGIN");
        transactionStarted = true;
        await connection.query(
          "SELECT set_config($1, $2, true), set_config($3, $4, true)",
          [
            rlsSessionSettings.workspaceId,
            decoded.value.workspaceUuid,
            rlsSessionSettings.actorId,
            decoded.value.actorUuid,
          ],
        );
        const result = await connection.query<{
          kind: string;
          previous_role: string | null;
          next_role: string | null;
          revision: string | number | null;
        }>(
          `
            SELECT
              kind,
              previous_role::text AS previous_role,
              next_role::text AS next_role,
              revision
            FROM app.change_member_role_and_record_audit(
              $1::app.member_role_change_scope,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              $5::uuid,
              $6::app.member_role,
              $7::boolean,
              $8::timestamptz,
              $9::uuid
            )
          `,
          [
            input.scope.kind,
            decoded.value.workspaceUuid,
            decoded.value.projectUuid,
            decoded.value.actorUuid,
            decoded.value.targetActorUuid,
            input.nextRole,
            input.authorization.manageExistingOwner,
            input.occurredAt,
            uuidV7ForAuditId(),
          ],
        );

        if (result.rows.length !== 1) {
          throw new Error("member role change returned an invalid row count");
        }
        const row = result.rows[0]!;
        let mappedResult: MemberRoleChangeResult;
        if (row.kind === "not_found_or_forbidden") {
          if (
            row.previous_role !== null ||
            row.next_role !== null ||
            row.revision !== null
          ) {
            throw new Error("member role denied result returned data fields");
          }
          mappedResult = notFoundMemberRoleChange();
        } else if (row.kind === "last_owner_conflict") {
          if (
            row.previous_role !== null ||
            row.next_role !== null ||
            row.revision !== null
          ) {
            throw new Error("member role conflict result returned data fields");
          }
          mappedResult = { kind: "last_owner_conflict" };
        } else if (row.kind === "changed") {
          const revision = Number(row.revision);
          if (
            !isMemberRbacRole(row.previous_role) ||
            !isMemberRbacRole(row.next_role) ||
            row.next_role !== input.nextRole ||
            !Number.isSafeInteger(revision) ||
            revision < 1
          ) {
            throw new Error("member role change returned an invalid result");
          }
          mappedResult = {
            kind: "changed",
            previousRole: row.previous_role,
            nextRole: row.next_role,
            revision,
          };
        } else {
          throw new Error("member role change returned an unknown result kind");
        }

        await connection.query("COMMIT");
        transactionStarted = false;
        return mappedResult;
      } catch (error) {
        primaryError = error;
        if (transactionStarted) {
          try {
            await connection.query("ROLLBACK");
          } catch {
            // Preserve the primary database failure; rollback errors are secondary.
          }
        }
        throw error;
      } finally {
        try {
          await connection.release();
        } catch (releaseError) {
          if (primaryError === undefined) {
            throw releaseError;
          }
        }
      }
    },
  };
}

export type MultipartUploadStatus = "uploading" | "uploaded" | "cancelled";

export interface MultipartUploadedPart {
  readonly partNumber: number;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly etag: string;
  readonly confirmedAt: string;
}

export interface MultipartUploadRecord {
  readonly uploadId: string;
  readonly draftId: string;
  readonly dataSourceId: string;
  readonly dataVersionId: string;
  readonly objectKey: string;
  readonly storageUploadId: string;
  readonly declaredFileName: string;
  readonly declaredSizeBytes: number;
  readonly status: MultipartUploadStatus;
  readonly serverSizeBytes?: number;
  readonly serverChecksumSha256?: string;
  readonly expiresAt: string;
  readonly revision: number;
  readonly parts: readonly MultipartUploadedPart[];
}

export type MultipartUploadRepositoryError =
  | "not_found_or_forbidden"
  | "limit_exceeded"
  | "invalid_state"
  | "part_mismatch"
  | "expired";

export type MultipartUploadRepositoryResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | {
      readonly ok: false;
      readonly error: MultipartUploadRepositoryError;
    };

export interface MultipartUploadRepository {
  create(input: {
    readonly scope: ProjectEnvironmentScope;
    readonly actorId: string;
    readonly uploadId: string;
    readonly draftId: string;
    readonly dataSourceId: string;
    readonly dataVersionId: string;
    readonly objectKey: string;
    readonly storageUploadId: string;
    readonly declaredFileName: string;
    readonly declaredContentType: string;
    readonly declaredSizeBytes: number;
    readonly now: string;
    readonly expiresAt: string;
    readonly limits: {
      readonly maxFilesPerDraft: number;
      readonly maxDraftTotalBytes: number;
    };
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  getActive(input: {
    readonly scope: ProjectEnvironmentScope;
    readonly uploadId: string;
    readonly now: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  recordPart(input: {
    readonly scope: ProjectEnvironmentScope;
    readonly uploadId: string;
    readonly part: MultipartUploadedPart;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  complete(input: {
    readonly scope: ProjectEnvironmentScope;
    readonly uploadId: string;
    readonly sizeBytes: number;
    readonly checksumSha256: string;
    readonly now: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  abort(input: {
    readonly scope: ProjectEnvironmentScope;
    readonly uploadId: string;
    readonly now: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
  recoverExpired(input: {
    readonly scope: ProjectEnvironmentScope;
    readonly uploadId: string;
    readonly parts: readonly MultipartUploadedPart[];
    readonly now: string;
    readonly expiresAt: string;
  }): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>>;
}

interface MultipartUploadRow {
  readonly id: string;
  readonly draft_id: string;
  readonly data_source_id: string;
  readonly data_version_id: string;
  readonly status: MultipartUploadStatus;
  readonly object_key: string;
  readonly storage_upload_id: string;
  readonly declared_file_name: string;
  readonly declared_size_bytes: string | number;
  readonly server_size_bytes: string | number | null;
  readonly server_checksum_sha256: string | null;
  readonly expires_at: string | Date;
  readonly revision: string | number;
}

interface MultipartUploadPartRow {
  readonly part_number: number;
  readonly size_bytes: string | number;
  readonly checksum_sha256: string;
  readonly etag: string;
  readonly confirmed_at: string | Date;
}

function notFoundUpload<Value>(): MultipartUploadRepositoryResult<Value> {
  return { ok: false, error: "not_found_or_forbidden" };
}

function uploadError<Value>(
  error: MultipartUploadRepositoryError,
): MultipartUploadRepositoryResult<Value> {
  return { ok: false, error };
}

function toIso(value: string | Date): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function mapMultipartPart(row: MultipartUploadPartRow): MultipartUploadedPart {
  return {
    partNumber: row.part_number,
    sizeBytes: Number(row.size_bytes),
    checksumSha256: row.checksum_sha256,
    etag: row.etag,
    confirmedAt: toIso(row.confirmed_at),
  };
}

async function loadMultipartUpload(
  transaction: DatabaseTransaction,
  uploadUuid: string,
): Promise<MultipartUploadRecord | null> {
  const uploadResult = await transaction.query<MultipartUploadRow>(
    `
      SELECT
        id,
        draft_id,
        data_source_id,
        data_version_id,
        status,
        object_key,
        storage_upload_id,
        declared_file_name,
        declared_size_bytes,
        server_size_bytes,
        server_checksum_sha256,
        expires_at,
        revision
      FROM app.multipart_uploads
      WHERE workspace_id = $1::uuid
        AND project_id = $2::uuid
        AND environment = $3::app.environment
        AND id = $4::uuid
      LIMIT 1
    `,
    [
      transaction.context.scope.workspaceId,
      transaction.context.scope.projectId,
      transaction.context.scope.environment,
      uploadUuid,
    ],
  );
  const upload = uploadResult.rows[0];
  if (!upload) {
    return null;
  }
  const parts = await transaction.query<MultipartUploadPartRow>(
    `
      SELECT part_number, size_bytes, checksum_sha256, etag, confirmed_at
      FROM app.multipart_upload_parts
      WHERE workspace_id = $1::uuid
        AND project_id = $2::uuid
        AND environment = $3::app.environment
        AND upload_id = $4::uuid
      ORDER BY part_number ASC
    `,
    [
      transaction.context.scope.workspaceId,
      transaction.context.scope.projectId,
      transaction.context.scope.environment,
      uploadUuid,
    ],
  );
  return {
    uploadId: encodeOpaqueId("upload", upload.id),
    draftId: encodeOpaqueId("draft", upload.draft_id),
    dataSourceId: encodeOpaqueId("dataSource", upload.data_source_id),
    dataVersionId: encodeOpaqueId("dataVersion", upload.data_version_id),
    objectKey: upload.object_key,
    storageUploadId: upload.storage_upload_id,
    declaredFileName: upload.declared_file_name,
    declaredSizeBytes: Number(upload.declared_size_bytes),
    status: upload.status,
    ...(upload.server_size_bytes !== null
      ? { serverSizeBytes: Number(upload.server_size_bytes) }
      : {}),
    ...(upload.server_checksum_sha256 !== null
      ? { serverChecksumSha256: upload.server_checksum_sha256 }
      : {}),
    expiresAt: toIso(upload.expires_at),
    revision: Number(upload.revision),
    parts: parts.rows.map(mapMultipartPart),
  };
}

function decodeMultipartIds(input: {
  readonly uploadId?: string;
  readonly draftId?: string;
  readonly dataSourceId?: string;
  readonly dataVersionId?: string;
  readonly actorId?: string;
}):
  | {
      readonly ok: true;
      readonly value: {
        readonly uploadUuid?: string;
        readonly draftUuid?: string;
        readonly dataSourceUuid?: string;
        readonly dataVersionUuid?: string;
        readonly actorUuid?: string;
      };
    }
  | { readonly ok: false } {
  try {
    const value: {
      uploadUuid?: string;
      draftUuid?: string;
      dataSourceUuid?: string;
      dataVersionUuid?: string;
      actorUuid?: string;
    } = {
      ...(input.uploadId
        ? { uploadUuid: decodeOpaqueId("upload", input.uploadId) }
        : {}),
      ...(input.draftId
        ? { draftUuid: decodeOpaqueId("draft", input.draftId) }
        : {}),
      ...(input.dataSourceId
        ? { dataSourceUuid: decodeOpaqueId("dataSource", input.dataSourceId) }
        : {}),
      ...(input.dataVersionId
        ? {
            dataVersionUuid: decodeOpaqueId("dataVersion", input.dataVersionId),
          }
        : {}),
      ...(input.actorId
        ? { actorUuid: decodeOpaqueId("actor", input.actorId) }
        : {}),
    };
    return {
      ok: true,
      value,
    };
  } catch {
    return { ok: false };
  }
}

function samePart(
  left: MultipartUploadedPart,
  right: MultipartUploadedPart,
): boolean {
  return (
    left.partNumber === right.partNumber &&
    left.sizeBytes === right.sizeBytes &&
    left.checksumSha256 === right.checksumSha256 &&
    left.etag === right.etag
  );
}

export function createMultipartUploadRepository(
  transaction: DatabaseTransaction,
): MultipartUploadRepository {
  function scopeIdMatches(
    resource: "workspace" | "project",
    supplied: string,
    expected: string,
  ): boolean {
    if (supplied === expected) {
      return true;
    }
    try {
      return decodeOpaqueId(resource, supplied) === expected;
    } catch {
      return false;
    }
  }

  function assertScope(scope: ProjectEnvironmentScope): boolean {
    return (
      scopeIdMatches(
        "workspace",
        scope.workspaceId,
        transaction.context.scope.workspaceId,
      ) &&
      scopeIdMatches(
        "project",
        scope.projectId,
        transaction.context.scope.projectId,
      ) &&
      scope.environment === transaction.context.scope.environment
    );
  }

  async function activeUploadOrError(
    scope: ProjectEnvironmentScope,
    uploadId: string,
    now: string,
  ): Promise<MultipartUploadRepositoryResult<MultipartUploadRecord>> {
    if (!assertScope(scope)) {
      return notFoundUpload();
    }
    const decoded = decodeMultipartIds({ uploadId });
    if (!decoded.ok || !decoded.value.uploadUuid) {
      return notFoundUpload();
    }
    const upload = await loadMultipartUpload(
      transaction,
      decoded.value.uploadUuid,
    );
    if (!upload) {
      return notFoundUpload();
    }
    if (upload.status === "cancelled") {
      return uploadError("invalid_state");
    }
    if (
      upload.status === "uploading" &&
      Date.parse(upload.expiresAt) <= Date.parse(now)
    ) {
      return uploadError("expired");
    }
    return { ok: true, value: upload };
  }

  return {
    async create(input) {
      if (!assertScope(input.scope)) {
        return notFoundUpload();
      }
      const decoded = decodeMultipartIds({
        uploadId: input.uploadId,
        draftId: input.draftId,
        dataSourceId: input.dataSourceId,
        dataVersionId: input.dataVersionId,
        actorId: input.actorId,
      });
      if (
        !decoded.ok ||
        !decoded.value.uploadUuid ||
        !decoded.value.draftUuid ||
        !decoded.value.dataSourceUuid ||
        !decoded.value.dataVersionUuid ||
        !decoded.value.actorUuid
      ) {
        return notFoundUpload();
      }

      const counts = await transaction.query<{
        active_count: string | number;
        active_bytes: string | number;
      }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE status <> 'cancelled') AS active_count,
            COALESCE(SUM(declared_size_bytes) FILTER (WHERE status <> 'cancelled'), 0) AS active_bytes
          FROM app.multipart_uploads
          WHERE workspace_id = $1::uuid
            AND project_id = $2::uuid
            AND environment = $3::app.environment
            AND draft_id = $4::uuid
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.draftUuid,
        ],
      );
      const activeCount = Number(counts.rows[0]?.active_count ?? 0);
      const activeBytes = Number(counts.rows[0]?.active_bytes ?? 0);
      if (
        activeCount + 1 > input.limits.maxFilesPerDraft ||
        activeBytes + input.declaredSizeBytes > input.limits.maxDraftTotalBytes
      ) {
        return uploadError("limit_exceeded");
      }

      const sourceExists = await transaction.query<{ exists: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM app.data_sources
            WHERE workspace_id = $1::uuid
              AND project_id = $2::uuid
              AND environment = $3::app.environment
              AND id = $4::uuid
              AND kind = 'file_upload'::app.data_source_kind
              AND state = 'active'::app.data_source_state
          ) AS exists
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.dataSourceUuid,
        ],
      );
      if (sourceExists.rows[0]?.exists !== true) {
        return notFoundUpload();
      }

      await transaction.query(
        `
          INSERT INTO app.data_versions (
            id,
            workspace_id,
            project_id,
            environment,
            data_source_id,
            status,
            processing_stage,
            revision,
            created_by
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::app.environment,
            $5::uuid,
            'uploading'::app.data_version_status,
            'upload'::app.processing_stage,
            1,
            $6::uuid
          )
        `,
        [
          decoded.value.dataVersionUuid,
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.dataSourceUuid,
          decoded.value.actorUuid,
        ],
      );
      await transaction.query(
        `
          INSERT INTO app.multipart_uploads (
            id,
            workspace_id,
            project_id,
            environment,
            draft_id,
            data_source_id,
            data_version_id,
            status,
            object_key,
            storage_upload_id,
            declared_file_name,
            declared_content_type,
            declared_size_bytes,
            expires_at,
            revision,
            created_by
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::app.environment,
            $5::uuid,
            $6::uuid,
            $7::uuid,
            'uploading',
            $8::text,
            $9::text,
            $10::text,
            $11::text,
            $12::bigint,
            $13::timestamptz,
            1,
            $14::uuid
          )
        `,
        [
          decoded.value.uploadUuid,
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.draftUuid,
          decoded.value.dataSourceUuid,
          decoded.value.dataVersionUuid,
          input.objectKey,
          input.storageUploadId,
          input.declaredFileName,
          input.declaredContentType,
          input.declaredSizeBytes,
          input.expiresAt,
          decoded.value.actorUuid,
        ],
      );
      const upload = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!upload) {
        throw new Error("created multipart upload could not be loaded");
      }
      return { ok: true, value: upload };
    },
    getActive(input) {
      return activeUploadOrError(input.scope, input.uploadId, input.now);
    },
    async recordPart(input) {
      const active = await activeUploadOrError(
        input.scope,
        input.uploadId,
        new Date().toISOString(),
      );
      if (!active.ok) {
        return active;
      }
      if (active.value.status !== "uploading") {
        return uploadError("invalid_state");
      }
      const existing = active.value.parts.find(
        (part) => part.partNumber === input.part.partNumber,
      );
      if (existing) {
        if (!samePart(existing, input.part)) {
          return uploadError("part_mismatch");
        }
        return { ok: true, value: active.value };
      }
      const decoded = decodeMultipartIds({ uploadId: input.uploadId });
      if (!decoded.ok || !decoded.value.uploadUuid) {
        return notFoundUpload();
      }
      await transaction.query(
        `
          INSERT INTO app.multipart_upload_parts (
            workspace_id,
            project_id,
            environment,
            upload_id,
            part_number,
            size_bytes,
            checksum_sha256,
            etag,
            confirmed_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::app.environment,
            $4::uuid,
            $5::integer,
            $6::bigint,
            $7::text,
            $8::text,
            $9::timestamptz
          )
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.uploadUuid,
          input.part.partNumber,
          input.part.sizeBytes,
          input.part.checksumSha256,
          input.part.etag,
          input.part.confirmedAt,
        ],
      );
      const upload = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!upload) {
        throw new Error("multipart upload disappeared after part insert");
      }
      return { ok: true, value: upload };
    },
    async complete(input) {
      const active = await activeUploadOrError(
        input.scope,
        input.uploadId,
        input.now,
      );
      if (!active.ok) {
        return active;
      }
      const upload = active.value;
      if (upload.status === "uploaded") {
        return { ok: true, value: upload };
      }
      if (upload.parts.length === 0) {
        return uploadError("invalid_state");
      }
      const partTotal = upload.parts.reduce(
        (total, part) => total + part.sizeBytes,
        0,
      );
      if (
        partTotal !== input.sizeBytes ||
        input.sizeBytes !== upload.declaredSizeBytes
      ) {
        return uploadError("part_mismatch");
      }
      const decoded = decodeMultipartIds({
        uploadId: input.uploadId,
        dataVersionId: upload.dataVersionId,
      });
      if (
        !decoded.ok ||
        !decoded.value.uploadUuid ||
        !decoded.value.dataVersionUuid
      ) {
        return notFoundUpload();
      }
      await transaction.query(
        `
          UPDATE app.multipart_uploads
          SET
            status = 'uploaded',
            server_size_bytes = $5::bigint,
            server_checksum_sha256 = $6::text,
            completed_at = $7::timestamptz,
            revision = revision + 1
          WHERE workspace_id = $1::uuid
            AND project_id = $2::uuid
            AND environment = $3::app.environment
            AND id = $4::uuid
            AND status = 'uploading'
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.uploadUuid,
          input.sizeBytes,
          input.checksumSha256,
          input.now,
        ],
      );
      await transaction.query(
        `
          UPDATE app.data_versions
          SET
            status = 'uploaded'::app.data_version_status,
            processing_stage = 'upload'::app.processing_stage,
            content_digest = $5::text,
            revision = revision + 1
          WHERE workspace_id = $1::uuid
            AND project_id = $2::uuid
            AND environment = $3::app.environment
            AND id = $4::uuid
            AND status = 'uploading'::app.data_version_status
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.dataVersionUuid,
          input.checksumSha256,
        ],
      );
      const reloaded = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!reloaded) {
        throw new Error("multipart upload disappeared after complete");
      }
      return { ok: true, value: reloaded };
    },
    async abort(input) {
      if (!assertScope(input.scope)) {
        return notFoundUpload();
      }
      const decoded = decodeMultipartIds({ uploadId: input.uploadId });
      if (!decoded.ok || !decoded.value.uploadUuid) {
        return notFoundUpload();
      }
      const upload = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!upload) {
        return notFoundUpload();
      }
      if (upload.status === "uploaded") {
        return uploadError("invalid_state");
      }
      if (upload.status === "cancelled") {
        return { ok: true, value: upload };
      }
      await transaction.query(
        `
          UPDATE app.multipart_uploads
          SET status = 'cancelled', cancelled_at = $5::timestamptz, revision = revision + 1
          WHERE workspace_id = $1::uuid
            AND project_id = $2::uuid
            AND environment = $3::app.environment
            AND id = $4::uuid
            AND status = 'uploading'
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.uploadUuid,
          input.now,
        ],
      );
      await transaction.query(
        `
          UPDATE app.data_versions
          SET status = 'cancelled'::app.data_version_status, revision = revision + 1
          WHERE workspace_id = $1::uuid
            AND project_id = $2::uuid
            AND environment = $3::app.environment
            AND id = $4::uuid
            AND status = 'uploading'::app.data_version_status
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decodeOpaqueId("dataVersion", upload.dataVersionId),
        ],
      );
      const reloaded = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!reloaded) {
        throw new Error("multipart upload disappeared after abort");
      }
      return { ok: true, value: reloaded };
    },
    async recoverExpired(input) {
      if (!assertScope(input.scope)) {
        return notFoundUpload();
      }
      if (input.parts.length === 0) {
        return uploadError("expired");
      }
      const decoded = decodeMultipartIds({ uploadId: input.uploadId });
      if (!decoded.ok || !decoded.value.uploadUuid) {
        return notFoundUpload();
      }
      const upload = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!upload) {
        return notFoundUpload();
      }
      if (upload.status !== "uploading") {
        return uploadError("invalid_state");
      }
      for (const part of input.parts) {
        const existing = upload.parts.find(
          (candidate) => candidate.partNumber === part.partNumber,
        );
        if (existing) {
          if (!samePart(existing, part)) {
            return uploadError("part_mismatch");
          }
          continue;
        }
        await transaction.query(
          `
            INSERT INTO app.multipart_upload_parts (
              workspace_id,
              project_id,
              environment,
              upload_id,
              part_number,
              size_bytes,
              checksum_sha256,
              etag,
              confirmed_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::app.environment,
              $4::uuid,
              $5::integer,
              $6::bigint,
              $7::text,
              $8::text,
              $9::timestamptz
            )
          `,
          [
            transaction.context.scope.workspaceId,
            transaction.context.scope.projectId,
            transaction.context.scope.environment,
            decoded.value.uploadUuid,
            part.partNumber,
            part.sizeBytes,
            part.checksumSha256,
            part.etag,
            part.confirmedAt,
          ],
        );
      }
      await transaction.query(
        `
          UPDATE app.multipart_uploads
          SET expires_at = $5::timestamptz, revision = revision + 1
          WHERE workspace_id = $1::uuid
            AND project_id = $2::uuid
            AND environment = $3::app.environment
            AND id = $4::uuid
            AND status = 'uploading'
        `,
        [
          transaction.context.scope.workspaceId,
          transaction.context.scope.projectId,
          transaction.context.scope.environment,
          decoded.value.uploadUuid,
          input.expiresAt,
        ],
      );
      const recovered = await loadMultipartUpload(
        transaction,
        decoded.value.uploadUuid,
      );
      if (!recovered) {
        throw new Error("multipart upload disappeared after recovery");
      }
      return { ok: true, value: recovered };
    },
  };
}

export interface RepositorySupportAdapters {
  readonly idempotency: IdempotencyRepository;
  readonly outbox: OutboxRepository;
  readonly multipartUploads: MultipartUploadRepository;
}

export function createRepositorySupportAdapters(
  transaction: DatabaseTransaction,
): RepositorySupportAdapters {
  return {
    idempotency: createIdempotencyRepository(transaction),
    outbox: createOutboxRepository(transaction),
    multipartUploads: createMultipartUploadRepository(transaction),
  };
}
