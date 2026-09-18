export const packageLayer = "database" as const;

export const migrationHead = "0003_repository_outbox" as const;

export const rlsSessionSettings = {
  workspaceId: "app.workspace_id",
  actorId: "app.actor_id",
} as const;

export const tenantCoreTables = [
  "app.workspaces",
  "app.workspace_members",
  "app.projects",
  "app.project_members",
  "app.data_sources",
  "app.data_versions",
  "app.drafts",
  "app.draft_revisions",
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

export interface RepositorySupportAdapters {
  readonly idempotency: IdempotencyRepository;
  readonly outbox: OutboxRepository;
}

export function createRepositorySupportAdapters(
  transaction: DatabaseTransaction,
): RepositorySupportAdapters {
  return {
    idempotency: createIdempotencyRepository(transaction),
    outbox: createOutboxRepository(transaction),
  };
}
