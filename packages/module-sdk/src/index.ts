import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { ModuleManifest } from "@modular-mcp/contracts";

export const packageLayer = "module-sdk" as const;

export const moduleApiVersion = "studio.mcp/v1" as const;

export const moduleTypes = [
  "source",
  "capability",
  "output",
  "prompt",
] as const;

export type ModuleType = (typeof moduleTypes)[number];

export type SourceModuleManifest = ModuleManifest & { readonly type: "source" };
export type CapabilityModuleManifest = ModuleManifest & {
  readonly type: "capability";
};
export type OutputModuleManifest = ModuleManifest & { readonly type: "output" };
export type PromptModuleManifest = ModuleManifest & { readonly type: "prompt" };

export type TypedModuleManifest =
  | SourceModuleManifest
  | CapabilityModuleManifest
  | OutputModuleManifest
  | PromptModuleManifest;

export interface ValidationIssue {
  readonly pointer: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export interface LoadedModuleManifest {
  readonly manifest: TypedModuleManifest;
  readonly canonicalJson: string;
  readonly registryKey: string;
}

export interface ProductionModuleReference {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest: string;
}

export interface JsonSchema {
  readonly type?:
    | "object"
    | "array"
    | "string"
    | "integer"
    | "number"
    | "boolean";
  readonly additionalProperties?: boolean;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
}

export interface ModuleConfigSchemaResolver {
  resolveConfigSchema(ref: string): JsonSchema | undefined;
}

export interface RegisteredModule {
  readonly manifest: TypedModuleManifest;
  readonly canonicalJson: string;
  readonly registryKey: string;
}

export interface ModuleRegistry {
  list(): readonly RegisteredModule[];
  get(reference: ProductionModuleReference): RegisteredModule | undefined;
  require(reference: ProductionModuleReference): RegisteredModule;
  validateReference(
    reference: ProductionModuleReference,
  ): ValidationResult<ProductionModuleReference>;
}

export type ModuleReviewStatus =
  | "draft"
  | "testing"
  | "submitted"
  | "approved"
  | "deprecated"
  | "blocked";

export interface ReviewedModuleCatalogRecord extends ProductionModuleReference {
  readonly moduleVersionId: string;
  readonly moduleName: string;
  readonly moduleKind: ModuleType;
  readonly status: ModuleReviewStatus;
  readonly signatureDigest: string;
}

export interface ProductionModuleCatalogPort {
  findExact(
    reference: ProductionModuleReference,
  ): Promise<ReviewedModuleCatalogRecord | null>;
}

export interface ModuleSignatureVerificationInput {
  readonly manifest: TypedModuleManifest;
}

export interface ModuleSignatureVerifier {
  verifyModuleSignature(
    input: ModuleSignatureVerificationInput,
  ): ValidationResult<true>;
}

export interface ModuleSignatureTrustRoot {
  readonly keyId: string;
  readonly publicKey: string | KeyObject;
  readonly algorithm: "ed25519";
}

export interface ModuleArtifactVerificationInput {
  readonly manifest: TypedModuleManifest;
  readonly reference: ProductionModuleReference;
  readonly catalog: ReviewedModuleCatalogRecord;
}

export interface ModuleArtifactVerifier {
  verifyModuleArtifact(
    input: ModuleArtifactVerificationInput,
  ): Promise<ValidationResult<true>> | ValidationResult<true>;
}

export type ProductionModuleIssueCode =
  | "invalid_manifest"
  | "invalid_reference"
  | "module_not_registered"
  | "module_catalog_not_found"
  | "artifact_digest_mismatch"
  | "module_not_approved"
  | "module_deprecated"
  | "module_blocked"
  | "module_catalog_mismatch"
  | "module_implementation_digest_mismatch"
  | "module_artifact_verification_failed"
  | "module_signature_digest_mismatch"
  | "module_signature_invalid";

export interface ProductionModuleIssue {
  readonly code: ProductionModuleIssueCode;
  readonly pointer: string;
  readonly message: string;
  readonly relationshipPath: readonly string[];
}

export interface ApprovedProductionModule {
  readonly reference: ProductionModuleReference;
  readonly registryKey: string;
  readonly manifest: TypedModuleManifest;
  readonly catalog: ReviewedModuleCatalogRecord;
}

export interface ValidateProductionModulesInput {
  readonly knownManifests: readonly unknown[];
  readonly references: readonly ProductionModuleReference[];
  readonly catalog: ProductionModuleCatalogPort;
  readonly signatureVerifier: ModuleSignatureVerifier;
  readonly artifactVerifier: ModuleArtifactVerifier;
}

export type ProductionModuleValidationResult =
  | { readonly ok: true; readonly value: readonly ApprovedProductionModule[] }
  | { readonly ok: false; readonly issues: readonly ProductionModuleIssue[] };

export interface ModuleGraphSelection {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest?: string;
}

export type ModuleResolverIssueCode =
  | "invalid_manifest"
  | "unknown_module"
  | "artifact_digest_mismatch"
  | "missing_dependency"
  | "incompatible_dependency"
  | "cycle_detected"
  | "module_conflict"
  | "multi_version_conflict"
  | "high_risk_autofill_blocked"
  | "recommendation_search_limit_exceeded";

export interface ModuleResolverIssue {
  readonly code: ModuleResolverIssueCode;
  readonly pointer: string;
  readonly message: string;
  readonly relationshipPath: readonly string[];
}

export interface ResolvedModuleNode {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest: string;
  readonly registryKey: string;
  readonly type: ModuleType;
  readonly risk: ModuleManifest["risk"];
  readonly reason: "selected" | "dependency";
  readonly relationshipPath: readonly string[];
}

export interface ModuleGraphAddition {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly artifactDigest: string;
  readonly registryKey: string;
  readonly reason: "required_dependency" | "replacement_alternative";
  readonly requiredBy: string;
  readonly relationshipPath: readonly string[];
}

export interface ModuleGraphRemoval {
  readonly moduleId: string;
  readonly exactVersion: string;
  readonly registryKey: string;
  readonly reason: "resolve_conflict" | "replace_with_alternative";
}

export interface ModuleGraphChangeSet {
  readonly additions: readonly ModuleGraphAddition[];
  readonly removals: readonly ModuleGraphRemoval[];
}

export interface ModuleGraphProposal {
  readonly code:
    | "autofill_dependencies"
    | "remove_conflicting_module"
    | "replace_with_alternative"
    | "resolve_conflicts";
  readonly message: string;
  readonly changeSet: ModuleGraphChangeSet;
}

export interface ModuleGraphResolution {
  readonly orderedModules: readonly ResolvedModuleNode[];
  readonly additions: readonly ModuleGraphAddition[];
  readonly issues: readonly ModuleResolverIssue[];
  readonly proposals: readonly ModuleGraphProposal[];
}

export interface ResolveModuleGraphInput {
  readonly knownManifests: readonly unknown[];
  readonly selected: readonly ModuleGraphSelection[];
}

export interface RecommendModuleSelectionInput {
  readonly knownManifests: readonly unknown[];
  readonly desiredProvides: readonly string[];
}

export interface ModuleRecommendation {
  readonly selections: readonly ModuleGraphSelection[];
  readonly reasons: readonly {
    readonly provide: string;
    readonly registryKey: string;
    readonly message: string;
  }[];
  readonly issues: readonly ModuleResolverIssue[];
}

const exactSemverPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const coreSemverPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const sha256DigestPattern = /^sha256:[a-f0-9]{64}$/;
const manifestIdPattern = /^[a-z]+\.[a-z0-9-]+$/;
const implementationPattern = /^builtin:[a-z0-9-]+@sha256:[a-f0-9]{64}$/;
const exactDependencyPattern = /^[a-z]+\.[a-z0-9-]+@\d+\.\d+\.\d+$/;
const permissionPattern =
  /^(data:(?:read|search)|tool:provide|resource:read|output:guard|prompt:compose|policy:check)$/;
const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const maxRecommendationEvaluations = 10_000;
const maxConflictPlanEvaluations = 10_000;

const manifestKeys = [
  "id",
  "version",
  "type",
  "apiVersion",
  "implementation",
  "requires",
  "conflicts",
  "provides",
  "configSchemaRef",
  "inputSchemaRef",
  "outputSchemaRef",
  "permissions",
  "risk",
  "limits",
  "artifactDigest",
  "signature",
] as const;

const requiredManifestKeys = [
  "id",
  "version",
  "type",
  "apiVersion",
  "implementation",
  "requires",
  "conflicts",
  "provides",
  "permissions",
  "risk",
  "limits",
  "artifactDigest",
  "signature",
] as const;

const limitKeys = [
  "requestsPerMinute",
  "maxConcurrency",
  "timeoutMs",
  "maxResults",
  "maxSections",
  "maxResponseBytes",
] as const;

function issue(
  pointer: string,
  code: string,
  message: string,
): ValidationIssue {
  return { pointer, code, message };
}

function pointer(parent: string, segment: string | number): string {
  const escaped = String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
  return parent === "" ? `/${escaped}` : `${parent}/${escaped}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    issues.push(
      issue(pointer("", key), "invalid_type", `${key} must be a string`),
    );
    return undefined;
  }
  return value;
}

function stringArrayAt(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push(
      issue(pointer("", key), "invalid_type", `${key} must be an array`),
    );
    return [];
  }
  const values: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push(
        issue(
          pointer(pointer("", key), index),
          "invalid_type",
          `${key} entries must be strings`,
        ),
      );
      return;
    }
    values.push(item);
  });
  return values;
}

function validateRequiredAndAdditionalKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of requiredKeys) {
    if (!(key in value)) {
      issues.push(issue(pointer("", key), "required", `${key} is required`));
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(
        issue(
          pointer("", key),
          "additional_property",
          `${key} is not allowed by ModuleManifestV1`,
        ),
      );
    }
  }
}

function validatePattern(
  value: string | undefined,
  pattern: RegExp,
  pointerValue: string,
  code: string,
  message: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !pattern.test(value)) {
    issues.push(issue(pointerValue, code, message));
  }
}

function validateLimits(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(issue("/limits", "invalid_type", "limits must be an object"));
    return;
  }
  validateRequiredAndAdditionalKeys(value, limitKeys, limitKeys, issues);
  const maxValues: Partial<Record<(typeof limitKeys)[number], number>> = {
    maxResults: 100,
    maxSections: 5,
  };
  for (const key of limitKeys) {
    const limit = value[key];
    if (!Number.isInteger(limit) || (limit as number) < 1) {
      issues.push(
        issue(
          pointer("/limits", key),
          "invalid_limit",
          `${key} must be an integer >= 1`,
        ),
      );
      continue;
    }
    const max = maxValues[key];
    if (max !== undefined && (limit as number) > max) {
      issues.push(
        issue(
          pointer("/limits", key),
          "invalid_limit",
          `${key} must be <= ${max}`,
        ),
      );
    }
  }
}

function validateSignature(value: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push(
      issue("/signature", "invalid_type", "signature must be an object"),
    );
    return;
  }
  validateRequiredAndAdditionalKeys(
    value,
    ["keyId", "value"],
    ["keyId", "value"],
    issues,
  );
  if (typeof value.keyId !== "string" || value.keyId.length < 1) {
    issues.push(
      issue("/signature/keyId", "invalid_signature", "keyId is required"),
    );
  }
  if (typeof value.value !== "string" || value.value.length < 32) {
    issues.push(
      issue(
        "/signature/value",
        "invalid_signature",
        "signature value must be at least 32 characters",
      ),
    );
  }
}

function validateProvidesByType(
  type: ModuleType | undefined,
  provides: readonly string[],
  issues: ValidationIssue[],
): void {
  const valid = (provided: string): boolean => {
    if (type === "source") {
      return provided.startsWith("source.");
    }
    if (type === "capability") {
      return provided.startsWith("tool.") || provided.startsWith("resource.");
    }
    if (type === "output") {
      return provided.startsWith("output.");
    }
    if (type === "prompt") {
      return provided.startsWith("prompt.");
    }
    return false;
  };
  provides.forEach((provided, index) => {
    if (!valid(provided)) {
      issues.push(
        issue(
          pointer("/provides", index),
          "incompatible_capability",
          `${provided} is not compatible with module type ${type ?? "unknown"}`,
        ),
      );
    }
  });
}

export function validateModuleManifest(
  input: unknown,
): ValidationResult<TypedModuleManifest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [issue("", "invalid_type", "module manifest must be an object")],
    };
  }

  validateRequiredAndAdditionalKeys(
    input,
    manifestKeys,
    requiredManifestKeys,
    issues,
  );

  const id = stringAt(input, "id", issues);
  const version = stringAt(input, "version", issues);
  const type = stringAt(input, "type", issues);
  const apiVersion = stringAt(input, "apiVersion", issues);
  const implementation = stringAt(input, "implementation", issues);
  const artifactDigest = stringAt(input, "artifactDigest", issues);
  const risk = stringAt(input, "risk", issues);
  const requires = stringArrayAt(input, "requires", issues);
  const conflicts = stringArrayAt(input, "conflicts", issues);
  const provides = stringArrayAt(input, "provides", issues);
  const permissions = stringArrayAt(input, "permissions", issues);

  validatePattern(
    id,
    manifestIdPattern,
    "/id",
    "invalid_id",
    "id must match ModuleManifestV1",
    issues,
  );
  validatePattern(
    version,
    exactSemverPattern,
    "/version",
    "invalid_version",
    "version must be an exact SemVer",
    issues,
  );
  if (!moduleTypes.includes(type as ModuleType)) {
    issues.push(
      issue(
        "/type",
        "invalid_type",
        "type must be source, capability, output, or prompt",
      ),
    );
  }
  if (apiVersion !== moduleApiVersion) {
    issues.push(
      issue(
        "/apiVersion",
        "incompatible_api_version",
        "apiVersion must be studio.mcp/v1",
      ),
    );
  }
  validatePattern(
    implementation,
    implementationPattern,
    "/implementation",
    "invalid_implementation",
    "implementation must reference a built-in artifact digest",
    issues,
  );
  validatePattern(
    artifactDigest,
    sha256DigestPattern,
    "/artifactDigest",
    "invalid_digest",
    "artifactDigest must be sha256:<64 lowercase hex>",
    issues,
  );
  if (risk !== "low" && risk !== "medium" && risk !== "high") {
    issues.push(
      issue("/risk", "invalid_risk", "risk must be low, medium, or high"),
    );
  }
  for (const key of ["configSchemaRef", "inputSchemaRef", "outputSchemaRef"]) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      issues.push(
        issue(pointer("", key), "invalid_type", `${key} must be a string`),
      );
    }
  }
  requires.forEach((dependency, index) =>
    validatePattern(
      dependency,
      exactDependencyPattern,
      pointer("/requires", index),
      "floating_dependency",
      "requires entries must use exact id@x.y.z references",
      issues,
    ),
  );
  conflicts.forEach((conflict, index) => {
    if (conflict.trim().length === 0) {
      issues.push(
        issue(
          pointer("/conflicts", index),
          "invalid_conflict",
          "conflict cannot be empty",
        ),
      );
    }
  });
  permissions.forEach((permission, index) =>
    validatePattern(
      permission,
      permissionPattern,
      pointer("/permissions", index),
      "invalid_permission",
      "permission is outside the reviewed P0 module permission set",
      issues,
    ),
  );
  validateProvidesByType(
    moduleTypes.includes(type as ModuleType) ? (type as ModuleType) : undefined,
    provides,
    issues,
  );
  validateLimits(input.limits, issues);
  validateSignature(input.signature, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: normalizeManifest(input as unknown as ModuleManifest),
  };
}

export function loadModuleManifest(
  input: unknown,
): ValidationResult<LoadedModuleManifest> {
  const validated = validateModuleManifest(input);
  if (!validated.ok) {
    return validated;
  }
  const canonicalJson = canonicalizeJson(validated.value);
  return {
    ok: true,
    value: {
      manifest: validated.value,
      canonicalJson,
      registryKey: moduleRegistryKey(
        validated.value.id,
        validated.value.version,
      ),
    },
  };
}

export function assertCompatibleApiVersion(apiVersion: string): void {
  if (apiVersion !== moduleApiVersion) {
    throw new Error(
      `module apiVersion ${apiVersion} is not compatible with ${moduleApiVersion}`,
    );
  }
}

export function validateProductionModuleReference(
  reference: ProductionModuleReference,
): ValidationResult<ProductionModuleReference> {
  const issues: ValidationIssue[] = [];
  validatePattern(
    reference.moduleId,
    manifestIdPattern,
    "/moduleId",
    "invalid_id",
    "moduleId must match ModuleManifestV1",
    issues,
  );
  validatePattern(
    reference.exactVersion,
    exactSemverPattern,
    "/exactVersion",
    "floating_version",
    "production module references must use exact SemVer",
    issues,
  );
  validatePattern(
    reference.artifactDigest,
    sha256DigestPattern,
    "/artifactDigest",
    "missing_or_invalid_digest",
    "production module references must include artifactDigest",
    issues,
  );
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: reference };
}

export function validateModuleConfig(
  manifest: ModuleManifest,
  config: unknown,
  resolver: ModuleConfigSchemaResolver,
): ValidationResult<Record<string, unknown>> {
  if (manifest.configSchemaRef === undefined) {
    if (isRecord(config) && Object.keys(config).length === 0) {
      return { ok: true, value: {} };
    }
    return {
      ok: false,
      issues: [
        issue(
          "",
          "config_not_allowed",
          "module does not declare a configSchemaRef",
        ),
      ],
    };
  }
  const schema = resolver.resolveConfigSchema(manifest.configSchemaRef);
  if (schema === undefined) {
    return {
      ok: false,
      issues: [
        issue(
          "",
          "config_schema_not_found",
          `config schema ${manifest.configSchemaRef} was not found`,
        ),
      ],
    };
  }
  const issues = validateJsonSchema(config, schema, "");
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (!isRecord(config)) {
    return {
      ok: false,
      issues: [issue("", "invalid_type", "config must be an object")],
    };
  }
  return { ok: true, value: sortJsonValue(config) as Record<string, unknown> };
}

export function createModuleRegistry(
  manifests: readonly unknown[],
): ValidationResult<ModuleRegistry> {
  const records = new Map<string, RegisteredModule>();
  const issues: ValidationIssue[] = [];

  manifests.forEach((candidate, index) => {
    const loaded = loadModuleManifest(candidate);
    if (!loaded.ok) {
      issues.push(
        ...loaded.issues.map((entry) => ({
          ...entry,
          pointer: pointer(
            pointer("", index),
            entry.pointer === "" ? "" : entry.pointer.slice(1),
          ),
        })),
      );
      return;
    }
    const key = loaded.value.registryKey;
    if (records.has(key)) {
      issues.push(
        issue(
          pointer("", index),
          "duplicate_module",
          `${key} is already registered`,
        ),
      );
      return;
    }
    records.set(key, loaded.value);
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      list() {
        return [...records.values()].sort((left, right) =>
          left.registryKey.localeCompare(right.registryKey),
        );
      },
      get(reference) {
        const validated = validateProductionModuleReference(reference);
        if (!validated.ok) {
          return undefined;
        }
        const record = records.get(
          moduleRegistryKey(reference.moduleId, reference.exactVersion),
        );
        if (record?.manifest.artifactDigest !== reference.artifactDigest) {
          return undefined;
        }
        return record;
      },
      require(reference) {
        const record = this.get(reference);
        if (record === undefined) {
          throw new Error(
            `approved module ${reference.moduleId}@${reference.exactVersion} with matching artifactDigest was not registered`,
          );
        }
        return record;
      },
      validateReference(reference) {
        const validated = validateProductionModuleReference(reference);
        if (!validated.ok) {
          return validated;
        }
        return this.get(reference) === undefined
          ? {
              ok: false,
              issues: [
                issue(
                  "",
                  "module_not_registered",
                  "module reference does not match a registered built-in module",
                ),
              ],
            }
          : validated;
      },
    },
  };
}

export function resolveModuleGraph(
  input: ResolveModuleGraphInput,
): ModuleGraphResolution {
  return resolveModuleGraphCore(input, { buildProposals: true }).resolution;
}

export function recommendModuleSelection(
  input: RecommendModuleSelectionInput,
): ModuleRecommendation {
  const registryResult = createModuleRegistry(input.knownManifests);
  if (!registryResult.ok) {
    return {
      selections: [],
      reasons: [],
      issues: registryResult.issues.map((entry) =>
        resolverIssue(
          "invalid_manifest",
          `/knownManifests${entry.pointer}`,
          entry.message,
          [],
        ),
      ),
    };
  }

  const known = registryResult.value.list();
  const desiredProvides = [...new Set(input.desiredProvides)].sort();
  const candidateSets = desiredProvides.map((provide) => ({
    provide,
    inputIndex: input.desiredProvides.indexOf(provide),
    candidates: known
      .filter((record) => record.manifest.provides.includes(provide))
      .sort(compareRecommendationCandidates),
  }));
  const missing = candidateSets.filter(
    (entry) => entry.candidates.length === 0,
  );
  if (missing.length > 0) {
    return {
      selections: [],
      reasons: [],
      issues: missing.map((entry) =>
        resolverIssue(
          "missing_dependency",
          `/desiredProvides/${entry.inputIndex}`,
          `${entry.provide} is not provided by a known module`,
          [entry.provide],
        ),
      ),
    };
  }

  const search = searchRecommendationAttempts(
    candidateSets,
    input.knownManifests,
  );

  if (search.limitExceeded) {
    return {
      selections: [],
      reasons: [],
      issues: [
        resolverIssue(
          "recommendation_search_limit_exceeded",
          "",
          `recommendation search exceeded ${maxRecommendationEvaluations} evaluated combinations`,
          desiredProvides,
        ),
      ],
    };
  }

  if (search.best === undefined) {
    return {
      selections: [],
      reasons: [],
      issues: [
        ...(search.firstFailure ?? [
          resolverIssue(
            "missing_dependency",
            "",
            "no safe executable module recommendation exists",
            desiredProvides,
          ),
        ]),
      ].sort(compareResolverIssues),
    };
  }

  return {
    selections: search.best.selected,
    reasons: search.best.reasons,
    issues: [],
  };
}

export async function validateNewProductionPublishModules(
  input: ValidateProductionModulesInput,
): Promise<ProductionModuleValidationResult> {
  return validateProductionModulesForUseCase(input, "new_publish");
}

export async function validateHistoricalRuntimeModules(
  input: ValidateProductionModulesInput,
): Promise<ProductionModuleValidationResult> {
  return validateProductionModulesForUseCase(input, "historical_runtime");
}

async function validateProductionModulesForUseCase(
  input: ValidateProductionModulesInput,
  useCase: "new_publish" | "historical_runtime",
): Promise<ProductionModuleValidationResult> {
  const registryResult = createModuleRegistry(input.knownManifests);
  if (!registryResult.ok) {
    return {
      ok: false,
      issues: registryResult.issues.map((entry) => ({
        pointer: `/knownManifests${entry.pointer}`,
        code: "invalid_manifest",
        message: entry.message,
        relationshipPath: [],
      })),
    };
  }

  const approved: ApprovedProductionModule[] = [];
  const issues: ProductionModuleIssue[] = [];
  const byKey = new Map(
    registryResult.value
      .list()
      .map((record) => [record.registryKey, record] as const),
  );

  for (const [index, reference] of input.references.entries()) {
    const pointerValue = `/references/${index}`;
    const relationshipPath = [
      moduleRegistryKey(reference.moduleId, reference.exactVersion),
    ];
    const validated = validateProductionModuleReference(reference);
    if (!validated.ok) {
      issues.push(
        ...validated.issues.map((entry) =>
          productionIssue(
            "invalid_reference",
            `${pointerValue}${entry.pointer}`,
            entry.message,
            relationshipPath,
          ),
        ),
      );
      continue;
    }

    const registryKey = moduleRegistryKey(
      reference.moduleId,
      reference.exactVersion,
    );
    const record = byKey.get(registryKey);
    if (record === undefined) {
      issues.push(
        productionIssue(
          "module_not_registered",
          pointerValue,
          `${registryKey} is not registered as a known module`,
          relationshipPath,
        ),
      );
      continue;
    }
    if (record.manifest.artifactDigest !== reference.artifactDigest) {
      issues.push(
        productionIssue(
          "artifact_digest_mismatch",
          `${pointerValue}/artifactDigest`,
          `${registryKey} artifactDigest does not match the registered manifest`,
          relationshipPath,
        ),
      );
      continue;
    }

    const implementationDigest = implementationArtifactDigest(
      record.manifest.implementation,
    );
    if (implementationDigest !== record.manifest.artifactDigest) {
      issues.push(
        productionIssue(
          "module_implementation_digest_mismatch",
          "/implementation",
          `${registryKey} implementation digest does not match artifactDigest`,
          relationshipPath,
        ),
      );
      continue;
    }

    const catalogRecord = await input.catalog.findExact(reference);
    if (catalogRecord === null) {
      issues.push(
        productionIssue(
          "module_catalog_not_found",
          pointerValue,
          `${registryKey} is not present in the module catalog`,
          relationshipPath,
        ),
      );
      continue;
    }
    const catalogValidation = validateCatalogRecord(
      catalogRecord,
      reference,
      record.manifest,
      pointerValue,
      relationshipPath,
    );
    if (!catalogValidation.ok) {
      issues.push(catalogValidation.issue);
      continue;
    }
    const verifiedCatalogRecord = catalogValidation.value;
    const reviewIssue = reviewStatusIssue(
      verifiedCatalogRecord,
      useCase,
      pointerValue,
      relationshipPath,
    );
    if (reviewIssue !== undefined) {
      issues.push(reviewIssue);
      continue;
    }

    const signatureDigest = moduleSignatureDigest(
      record.manifest.signature.value,
    );
    if (signatureDigest !== verifiedCatalogRecord.signatureDigest) {
      issues.push(
        productionIssue(
          "module_signature_digest_mismatch",
          `${pointerValue}/signature`,
          `${registryKey} signature digest does not match the module catalog`,
          relationshipPath,
        ),
      );
      continue;
    }
    const signatureResult = safeVerifyModuleSignature(
      input.signatureVerifier,
      record.manifest,
    );
    if (!signatureResult.ok) {
      issues.push(
        ...signatureResult.issues.map((entry) =>
          productionIssue(
            "module_signature_invalid",
            `${pointerValue}${entry.pointer}`,
            entry.message,
            relationshipPath,
          ),
        ),
      );
      continue;
    }
    const artifactResult = await safeVerifyModuleArtifact(
      input.artifactVerifier,
      record.manifest,
      reference,
      verifiedCatalogRecord,
    );
    if (!artifactResult.ok) {
      issues.push(
        ...artifactResult.issues.map((entry) =>
          productionIssue(
            "module_artifact_verification_failed",
            `${pointerValue}${entry.pointer}`,
            entry.message,
            relationshipPath,
          ),
        ),
      );
      continue;
    }

    approved.push({
      reference: cloneProductionReference(reference),
      registryKey,
      manifest: deepFreeze(cloneManifest(record.manifest)),
      catalog: deepFreeze({ ...verifiedCatalogRecord }),
    });
  }

  return issues.length === 0
    ? { ok: true, value: deepFreeze([...approved]) }
    : { ok: false, issues: issues.sort(compareProductionIssues) };
}

export function moduleRegistryKey(
  moduleId: string,
  exactVersion: string,
): string {
  return `${moduleId}@${exactVersion}`;
}

export function catalogModuleNameForManifestId(moduleId: string): string {
  if (!manifestIdPattern.test(moduleId)) {
    throw new Error(
      "moduleId must match ModuleManifestV1 before catalog mapping",
    );
  }
  return moduleId.replaceAll(".", "_").replaceAll("-", "_");
}

export function catalogVersionForDatabase(version: string): string {
  if (!coreSemverPattern.test(version)) {
    throw new Error(
      "module catalog database versions must use core x.y.z SemVer",
    );
  }
  return version;
}

export function moduleSignaturePayload(manifest: TypedModuleManifest): string {
  return canonicalizeJson(
    normalizeManifest({
      ...manifest,
      signature: { keyId: manifest.signature.keyId, value: "" },
    }),
  );
}

export function moduleSignatureDigest(signatureValue: string): string {
  return `sha256:${createHash("sha256").update(signatureValue, "utf8").digest("hex")}`;
}

function decodeCanonicalEd25519Signature(
  value: string,
): ValidationResult<Buffer> {
  if (
    value.length === 0 ||
    value.includes("=") ||
    value.trim() !== value ||
    !base64UrlPattern.test(value)
  ) {
    return {
      ok: false,
      issues: [
        issue(
          "/signature/value",
          "invalid_signature_encoding",
          "signature value must be canonical unpadded base64url",
        ),
      ],
    };
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== 64 || decoded.toString("base64url") !== value) {
    return {
      ok: false,
      issues: [
        issue(
          "/signature/value",
          "invalid_signature_encoding",
          "signature value must decode to one 64-byte Ed25519 signature",
        ),
      ],
    };
  }
  return { ok: true, value: decoded };
}

function normalizeEd25519PublicKey(publicKey: string | KeyObject): KeyObject {
  let key: KeyObject;
  try {
    key =
      typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  } catch {
    throw new Error("module signature trust root publicKey is not parseable");
  }
  if (key.type !== "public") {
    throw new Error("module signature trust root must be a public key");
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("module signature trust root must be an Ed25519 key");
  }
  return key;
}

export function createEd25519ModuleSignatureVerifier(
  trustRoots: readonly ModuleSignatureTrustRoot[],
): ModuleSignatureVerifier {
  const roots = new Map<string, KeyObject>();
  for (const entry of trustRoots) {
    const rootKey = `${entry.keyId}:${entry.algorithm}`;
    if (roots.has(rootKey)) {
      throw new Error(`duplicate module signature trust root: ${rootKey}`);
    }
    const publicKey = normalizeEd25519PublicKey(entry.publicKey);
    roots.set(rootKey, publicKey);
  }
  return {
    verifyModuleSignature(input) {
      const signature = decodeCanonicalEd25519Signature(
        input.manifest.signature.value,
      );
      if (!signature.ok) {
        return signature;
      }
      const root = roots.get(`${input.manifest.signature.keyId}:ed25519`);
      if (root === undefined) {
        return {
          ok: false,
          issues: [
            issue(
              "/signature/keyId",
              "untrusted_key",
              "module signature keyId is not trusted",
            ),
          ],
        };
      }
      try {
        const ok = verifySignature(
          null,
          Buffer.from(moduleSignaturePayload(input.manifest), "utf8"),
          root,
          signature.value,
        );
        return ok
          ? { ok: true, value: true }
          : {
              ok: false,
              issues: [
                issue(
                  "/signature/value",
                  "invalid_signature",
                  "module signature verification failed",
                ),
              ],
            };
      } catch {
        return {
          ok: false,
          issues: [
            issue(
              "/signature/value",
              "invalid_signature",
              "module signature verification failed",
            ),
          ],
        };
      }
    },
  };
}

export function createInMemoryModuleArtifactVerifier(
  artifacts: Readonly<Record<string, string | Uint8Array>>,
): ModuleArtifactVerifier {
  const byDigest = new Map(
    Object.entries(artifacts).map(([digest, bytes]) => [
      digest,
      typeof bytes === "string"
        ? Buffer.from(bytes, "utf8")
        : Buffer.from(bytes),
    ]),
  );
  return {
    verifyModuleArtifact(input) {
      const expected = input.manifest.artifactDigest;
      const bytes = byDigest.get(expected);
      if (bytes === undefined) {
        return {
          ok: false,
          issues: [
            issue(
              "/artifactDigest",
              "artifact_not_found",
              "module artifact bytes were not available for digest verification",
            ),
          ],
        };
      }
      const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      return actual === expected
        ? { ok: true, value: true }
        : {
            ok: false,
            issues: [
              issue(
                "/artifactDigest",
                "artifact_digest_mismatch",
                "module artifact bytes do not match the expected digest",
              ),
            ],
          };
    },
  };
}

interface ResolverCoreResult {
  readonly resolution: ModuleGraphResolution;
  readonly selected: readonly ModuleGraphSelection[];
  readonly selectedKeys: ReadonlySet<string>;
  readonly nodeOwners: ReadonlyMap<string, readonly string[]>;
  readonly byKey: ReadonlyMap<string, RegisteredModule>;
  readonly metadata: ResolverInputMetadata;
}

interface ResolverInputMetadata {
  readonly manifests: ReadonlyMap<string, ManifestInputMetadata>;
}

interface ManifestInputMetadata {
  readonly pointer: string;
  readonly requires: TokenOccurrenceIndexes;
  readonly conflicts: TokenOccurrenceIndexes;
}

type TokenOccurrenceIndexes = ReadonlyMap<string, readonly number[]>;

interface ResolverCoreOptions {
  readonly buildProposals: boolean;
}

function resolveModuleGraphCore(
  input: ResolveModuleGraphInput,
  options: ResolverCoreOptions,
): ResolverCoreResult {
  const registryResult = createModuleRegistry(input.knownManifests);
  const emptyMetadata: ResolverInputMetadata = { manifests: new Map() };
  if (!registryResult.ok) {
    return {
      resolution: {
        orderedModules: [],
        additions: [],
        issues: registryResult.issues.map((entry) =>
          resolverIssue(
            "invalid_manifest",
            `/knownManifests${entry.pointer}`,
            entry.message,
            [],
          ),
        ),
        proposals: [],
      },
      selected: [],
      selectedKeys: new Set(),
      nodeOwners: new Map(),
      byKey: new Map(),
      metadata: emptyMetadata,
    };
  }

  const known = registryResult.value.list();
  const byKey = new Map(known.map((record) => [record.registryKey, record]));
  const metadata = collectResolverInputMetadata(input.knownManifests);
  const selectedKeys = new Set<string>();
  const selected = [...input.selected]
    .map((selection, index) => ({ selection, index }))
    .sort((left, right) =>
      moduleRegistryKey(
        left.selection.moduleId,
        left.selection.exactVersion,
      ).localeCompare(
        moduleRegistryKey(
          right.selection.moduleId,
          right.selection.exactVersion,
        ),
      ),
    );
  const issues: ModuleResolverIssue[] = [];
  const pendingAdditions = new Map<string, ModuleGraphAddition>();
  const ordered = new Map<string, ResolvedModuleNode>();
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const requestedVersions = new Map<string, Set<string>>();

  for (const { selection, index } of selected) {
    const key = moduleRegistryKey(selection.moduleId, selection.exactVersion);
    selectedKeys.add(key);
    const versions =
      requestedVersions.get(selection.moduleId) ?? new Set<string>();
    versions.add(selection.exactVersion);
    requestedVersions.set(selection.moduleId, versions);
  }

  for (const [moduleId, versions] of requestedVersions) {
    if (versions.size > 1) {
      issues.push(
        resolverIssue(
          "multi_version_conflict",
          `/selected`,
          `${moduleId} is selected with multiple exact versions`,
          [...versions]
            .sort()
            .map((version) => moduleRegistryKey(moduleId, version)),
        ),
      );
    }
  }

  const visit = (
    key: string,
    path: readonly string[],
    reason: ResolvedModuleNode["reason"],
    sourcePointer: string,
  ): void => {
    const existingPath = path.includes(key) ? [...path, key] : path;
    if (visiting.has(key)) {
      issues.push(
        resolverIssue(
          "cycle_detected",
          sourcePointer,
          `module dependency cycle detected at ${key}`,
          existingPath,
        ),
      );
      return;
    }
    if (visited.has(key)) {
      return;
    }
    const record = byKey.get(key);
    if (record === undefined) {
      issues.push(
        resolverIssue(
          reason === "selected" ? "unknown_module" : "missing_dependency",
          sourcePointer,
          `${key} is not available in the module registry`,
          existingPath,
        ),
      );
      return;
    }

    visiting.add(key);
    const manifest = record.manifest;
    const dependencyOccurrences = new Map<string, number>();
    const dependencyRefs = manifest.requires
      .map((ref) => {
        const occurrence = dependencyOccurrences.get(ref) ?? 0;
        dependencyOccurrences.set(ref, occurrence + 1);
        return { ref, occurrence, parsed: parseDependencyRef(ref) };
      })
      .sort((left, right) =>
        `${left.ref}:${left.occurrence}`.localeCompare(
          `${right.ref}:${right.occurrence}`,
        ),
      );

    for (const dependency of dependencyRefs) {
      const dependencyKey =
        dependency.parsed === undefined
          ? dependency.ref
          : dependency.parsed.key;
      const dependencyPointer = tokenPointer(
        metadata,
        key,
        "requires",
        dependency.ref,
        dependency.occurrence,
      );
      if (dependency.parsed === undefined) {
        issues.push(
          resolverIssue(
            "incompatible_dependency",
            dependencyPointer,
            `${dependency.ref} is not an exact dependency reference`,
            [...path, key, dependency.ref],
          ),
        );
        continue;
      }
      const dependencyRecord = byKey.get(dependencyKey);
      if (dependencyRecord === undefined) {
        const hasOtherVersion = known.some(
          (candidate) => candidate.manifest.id === dependency.parsed?.moduleId,
        );
        issues.push(
          resolverIssue(
            hasOtherVersion ? "incompatible_dependency" : "missing_dependency",
            dependencyPointer,
            hasOtherVersion
              ? `${dependencyKey} is required but only a different exact version is known`
              : `${dependencyKey} is required but not known`,
            [...path, key, dependencyKey],
          ),
        );
        continue;
      }
      if (!selectedKeys.has(dependencyKey)) {
        if (dependencyRecord.manifest.risk === "high") {
          issues.push(
            resolverIssue(
              "high_risk_autofill_blocked",
              dependencyPointer,
              `${dependencyKey} is high risk and cannot be added by one-click autofill`,
              [...path, key, dependencyKey],
            ),
          );
          continue;
        }
        pendingAdditions.set(dependencyKey, {
          moduleId: dependencyRecord.manifest.id,
          exactVersion: dependencyRecord.manifest.version,
          artifactDigest: dependencyRecord.manifest.artifactDigest,
          registryKey: dependencyKey,
          reason: "required_dependency",
          requiredBy: key,
          relationshipPath: [...path, key, dependencyKey],
        });
      }
      visit(dependencyKey, [...path, key], "dependency", dependencyPointer);
    }

    visiting.delete(key);
    visited.add(key);
    ordered.set(key, {
      moduleId: manifest.id,
      exactVersion: manifest.version,
      artifactDigest: manifest.artifactDigest,
      registryKey: key,
      type: manifest.type,
      risk: manifest.risk,
      reason: selectedKeys.has(key) ? "selected" : reason,
      relationshipPath: existingPath,
    });
  };

  for (const { selection, index } of selected) {
    const key = moduleRegistryKey(selection.moduleId, selection.exactVersion);
    const record = byKey.get(key);
    if (record === undefined) {
      const hasOtherVersion = known.some(
        (candidate) => candidate.manifest.id === selection.moduleId,
      );
      issues.push(
        resolverIssue(
          hasOtherVersion ? "incompatible_dependency" : "unknown_module",
          `/selected/${index}`,
          hasOtherVersion
            ? `${key} was selected but only a different exact version is known`
            : `${key} is not known`,
          [key],
        ),
      );
      continue;
    }
    if (
      selection.artifactDigest !== undefined &&
      selection.artifactDigest !== record.manifest.artifactDigest
    ) {
      issues.push(
        resolverIssue(
          "artifact_digest_mismatch",
          `/selected/${index}/artifactDigest`,
          `${key} artifactDigest does not match the registered manifest`,
          [key],
        ),
      );
      continue;
    }
    visit(key, [], "selected", `/selected/${index}`);
  }

  issues.push(
    ...detectClosureConflicts([...ordered.values()], byKey, metadata),
    ...detectClosureVersionConflicts([...ordered.values()]),
  );

  const sortedIssues = issues.sort(compareResolverIssues);
  const sortedAdditions =
    sortedIssues.length === 0
      ? [...pendingAdditions.values()].sort((left, right) =>
          left.registryKey.localeCompare(right.registryKey),
        )
      : [];
  const orderedModules = [...ordered.values()];
  const selectedSelections = selected.map(({ selection }) => selection);
  const nodeOwners = collectSelectedRootOwners(
    selectedSelections,
    byKey,
    new Set(orderedModules.map((node) => node.registryKey)),
  );
  const coreResult: Omit<ResolverCoreResult, "resolution"> = {
    selected: selectedSelections,
    selectedKeys,
    nodeOwners,
    byKey,
    metadata,
  };
  const proposals = options.buildProposals
    ? buildResolverProposals(sortedAdditions, sortedIssues, orderedModules, {
        ...coreResult,
        knownManifests: input.knownManifests,
      })
    : [];

  return {
    resolution: {
      orderedModules,
      additions: sortedAdditions,
      issues: sortedIssues,
      proposals,
    },
    ...coreResult,
  };
}

function resolverIssue(
  code: ModuleResolverIssueCode,
  pointerValue: string,
  message: string,
  relationshipPath: readonly string[],
): ModuleResolverIssue {
  return { code, pointer: pointerValue, message, relationshipPath };
}

function productionIssue(
  code: ProductionModuleIssueCode,
  pointerValue: string,
  message: string,
  relationshipPath: readonly string[],
): ProductionModuleIssue {
  return { code, pointer: pointerValue, message, relationshipPath };
}

function reviewStatusIssue(
  catalogRecord: ReviewedModuleCatalogRecord,
  useCase: "new_publish" | "historical_runtime",
  pointerValue: string,
  relationshipPath: readonly string[],
): ProductionModuleIssue | undefined {
  if (catalogRecord.status === "approved") {
    return undefined;
  }
  if (
    catalogRecord.status === "deprecated" &&
    useCase === "historical_runtime"
  ) {
    return undefined;
  }
  if (catalogRecord.status === "blocked") {
    return productionIssue(
      "module_blocked",
      pointerValue,
      `${catalogRecord.moduleId}@${catalogRecord.exactVersion} is blocked and cannot be selected or published`,
      relationshipPath,
    );
  }
  if (catalogRecord.status === "deprecated") {
    return productionIssue(
      "module_deprecated",
      pointerValue,
      `${catalogRecord.moduleId}@${catalogRecord.exactVersion} is deprecated for new publish validation`,
      relationshipPath,
    );
  }
  return productionIssue(
    "module_not_approved",
    pointerValue,
    `${catalogRecord.moduleId}@${catalogRecord.exactVersion} is ${catalogRecord.status}, not approved`,
    relationshipPath,
  );
}

function implementationArtifactDigest(
  implementation: string,
): string | undefined {
  return /@(?<digest>sha256:[a-f0-9]{64})$/.exec(implementation)?.groups
    ?.digest;
}

function validateCatalogRecord(
  value: unknown,
  reference: ProductionModuleReference,
  manifest: TypedModuleManifest,
  pointerValue: string,
  relationshipPath: readonly string[],
):
  | { readonly ok: true; readonly value: ReviewedModuleCatalogRecord }
  | { readonly ok: false; readonly issue: ProductionModuleIssue } {
  const fail = (
    message: string,
  ): { readonly ok: false; readonly issue: ProductionModuleIssue } => ({
    ok: false,
    issue: productionIssue(
      "module_catalog_mismatch",
      pointerValue,
      message,
      relationshipPath,
    ),
  });
  if (!isRecord(value)) {
    return fail("module catalog record must be an object");
  }
  const expectedModuleName = catalogModuleNameForManifestId(manifest.id);
  const status = value.status;
  const moduleVersionId = value.moduleVersionId;
  const signatureDigest = value.signatureDigest;
  if (
    value.moduleId !== reference.moduleId ||
    value.exactVersion !== reference.exactVersion ||
    value.artifactDigest !== reference.artifactDigest
  ) {
    return fail(
      "module catalog record identity does not match the requested reference",
    );
  }
  if (value.moduleName !== expectedModuleName) {
    return fail("module catalog record moduleName does not match the manifest");
  }
  if (value.moduleKind !== manifest.type) {
    return fail("module catalog record moduleKind does not match the manifest");
  }
  if (!isModuleReviewStatus(status)) {
    return fail("module catalog record status is not a known review status");
  }
  if (
    typeof signatureDigest !== "string" ||
    !sha256DigestPattern.test(signatureDigest)
  ) {
    return fail("module catalog record signatureDigest is invalid");
  }
  if (
    typeof moduleVersionId !== "string" ||
    !uuidV7Pattern.test(moduleVersionId)
  ) {
    return fail("module catalog record moduleVersionId is invalid");
  }
  return {
    ok: true,
    value: {
      moduleId: reference.moduleId,
      exactVersion: reference.exactVersion,
      artifactDigest: reference.artifactDigest,
      moduleVersionId,
      moduleName: expectedModuleName,
      moduleKind: manifest.type,
      status,
      signatureDigest,
    },
  };
}

function isModuleReviewStatus(value: unknown): value is ModuleReviewStatus {
  return (
    value === "draft" ||
    value === "testing" ||
    value === "submitted" ||
    value === "approved" ||
    value === "deprecated" ||
    value === "blocked"
  );
}

function safeVerifyModuleSignature(
  verifier: ModuleSignatureVerifier,
  manifest: TypedModuleManifest,
): ValidationResult<true> {
  try {
    return verifier.verifyModuleSignature({ manifest });
  } catch {
    return {
      ok: false,
      issues: [
        issue(
          "/signature/value",
          "signature_verifier_failed",
          "module signature verifier failed closed",
        ),
      ],
    };
  }
}

async function safeVerifyModuleArtifact(
  verifier: ModuleArtifactVerifier,
  manifest: TypedModuleManifest,
  reference: ProductionModuleReference,
  catalog: ReviewedModuleCatalogRecord,
): Promise<ValidationResult<true>> {
  try {
    return await verifier.verifyModuleArtifact({
      manifest,
      reference,
      catalog,
    });
  } catch {
    return {
      ok: false,
      issues: [
        issue(
          "/artifactDigest",
          "artifact_verifier_failed",
          "module artifact verifier failed closed",
        ),
      ],
    };
  }
}

function cloneProductionReference(
  reference: ProductionModuleReference,
): ProductionModuleReference {
  return {
    moduleId: reference.moduleId,
    exactVersion: reference.exactVersion,
    artifactDigest: reference.artifactDigest,
  };
}

function cloneManifest(manifest: TypedModuleManifest): TypedModuleManifest {
  return {
    ...manifest,
    requires: [...manifest.requires],
    conflicts: [...manifest.conflicts],
    provides: [...manifest.provides],
    permissions: [...manifest.permissions],
    limits: { ...manifest.limits },
    signature: { ...manifest.signature },
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  Object.freeze(value);
  for (const property of Object.values(value as Record<string, unknown>)) {
    deepFreeze(property);
  }
  return value;
}

function compareProductionIssues(
  left: ProductionModuleIssue,
  right: ProductionModuleIssue,
): number {
  return `${left.code}:${left.pointer}:${left.relationshipPath.join(">")}`.localeCompare(
    `${right.code}:${right.pointer}:${right.relationshipPath.join(">")}`,
  );
}

function parseDependencyRef(ref: string):
  | {
      readonly moduleId: string;
      readonly exactVersion: string;
      readonly key: string;
    }
  | undefined {
  const separator = ref.lastIndexOf("@");
  if (separator < 1) {
    return undefined;
  }
  const moduleId = ref.slice(0, separator);
  const exactVersion = ref.slice(separator + 1);
  if (
    !manifestIdPattern.test(moduleId) ||
    !exactSemverPattern.test(exactVersion)
  ) {
    return undefined;
  }
  return {
    moduleId,
    exactVersion,
    key: moduleRegistryKey(moduleId, exactVersion),
  };
}

function detectClosureConflicts(
  nodes: readonly ResolvedModuleNode[],
  byKey: ReadonlyMap<string, RegisteredModule>,
  metadata: ResolverInputMetadata,
): readonly ModuleResolverIssue[] {
  const issues: ModuleResolverIssue[] = [];
  const sorted = [...nodes].sort((left, right) =>
    left.registryKey.localeCompare(right.registryKey),
  );
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sorted.length;
      rightIndex += 1
    ) {
      const left = sorted[leftIndex];
      const right = sorted[rightIndex];
      if (left === undefined || right === undefined) {
        continue;
      }
      const leftRecord = byKey.get(left.registryKey);
      const rightRecord = byKey.get(right.registryKey);
      if (leftRecord === undefined || rightRecord === undefined) {
        continue;
      }
      const leftConflict = conflictTokenIndex(leftRecord.manifest, rightRecord);
      const rightConflict = conflictTokenIndex(
        rightRecord.manifest,
        leftRecord,
      );
      if (leftConflict === undefined && rightConflict === undefined) {
        continue;
      }
      const source =
        leftConflict === undefined
          ? { key: right.registryKey, match: rightConflict }
          : { key: left.registryKey, match: leftConflict };
      if (source.match === undefined) {
        continue;
      }
      issues.push(
        resolverIssue(
          "module_conflict",
          tokenPointer(
            metadata,
            source.key,
            "conflicts",
            source.match.token,
            source.match.occurrence,
          ),
          `${left.registryKey} conflicts with ${right.registryKey}`,
          [left.registryKey, right.registryKey],
        ),
      );
    }
  }
  return issues;
}

function conflictTokenIndex(
  manifest: ModuleManifest,
  target: RegisteredModule,
): { readonly token: string; readonly occurrence: number } | undefined {
  const targetTokens = new Set([
    target.manifest.id,
    target.registryKey,
    ...target.manifest.provides,
  ]);
  const seen = new Map<string, number>();
  for (const token of manifest.conflicts) {
    const occurrence = seen.get(token) ?? 0;
    seen.set(token, occurrence + 1);
    if (targetTokens.has(token)) {
      return { token, occurrence };
    }
  }
  return undefined;
}

function detectClosureVersionConflicts(
  nodes: readonly ResolvedModuleNode[],
): readonly ModuleResolverIssue[] {
  const byModule = new Map<string, Set<string>>();
  for (const node of nodes) {
    const versions = byModule.get(node.moduleId) ?? new Set<string>();
    versions.add(node.exactVersion);
    byModule.set(node.moduleId, versions);
  }
  return [...byModule.entries()]
    .filter(([, versions]) => versions.size > 1)
    .map(([moduleId, versions]) =>
      resolverIssue(
        "multi_version_conflict",
        "",
        `${moduleId} appears in the closure with multiple exact versions`,
        [...versions]
          .sort()
          .map((version) => moduleRegistryKey(moduleId, version)),
      ),
    );
}

function buildResolverProposals(
  additions: readonly ModuleGraphAddition[],
  issues: readonly ModuleResolverIssue[],
  orderedModules: readonly ResolvedModuleNode[],
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): readonly ModuleGraphProposal[] {
  const proposals: ModuleGraphProposal[] = [];
  if (additions.length > 0 && issues.length === 0) {
    const proposal: ModuleGraphProposal = {
      code: "autofill_dependencies",
      message: `Add ${additions.length} required module dependency entries before applying changes`,
      changeSet: { additions, removals: [] },
    };
    if (proposalIsExecutable(proposal, context)) {
      proposals.push(proposal);
    }
  }

  const conflictIssues = issues
    .filter((entry) => entry.code === "module_conflict")
    .sort(compareResolverIssues);
  if (conflictIssues.length > 0) {
    proposals.push(
      ...searchConflictResolutionPlans(conflictIssues, orderedModules, context),
    );
  }

  return [...uniqueProposals(proposals)].sort((left, right) =>
    `${left.code}:${left.message}`.localeCompare(
      `${right.code}:${right.message}`,
    ),
  );
}

interface ConflictAtomicAction {
  readonly code: "remove_conflicting_module" | "replace_with_alternative";
  readonly message: string;
  readonly changeSet: ModuleGraphChangeSet;
  readonly covers: ReadonlySet<string>;
  readonly sortKey: string;
}

function searchConflictResolutionPlans(
  conflictIssues: readonly ModuleResolverIssue[],
  orderedModules: readonly ResolvedModuleNode[],
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): readonly ModuleGraphProposal[] {
  const conflicts = conflictIssues.map((entry) => ({
    issue: entry,
    key: conflictKey(entry),
  }));
  const actionsByConflict = new Map<string, readonly ConflictAtomicAction[]>();
  for (const conflict of conflicts) {
    actionsByConflict.set(
      conflict.key,
      conflictAtomicActions(
        conflict.issue,
        conflictIssues,
        orderedModules,
        context,
      ),
    );
  }

  const proposals: ModuleGraphProposal[] = [];
  let evaluations = 0;
  const walk = (
    index: number,
    actions: readonly ConflictAtomicAction[],
    covered: ReadonlySet<string>,
  ): void => {
    if (evaluations >= maxConflictPlanEvaluations) {
      return;
    }
    const current = conflicts[index];
    if (current === undefined) {
      evaluations += 1;
      const proposal = proposalFromAtomicActions(actions);
      if (proposal !== undefined) {
        const completed = completeExecutableProposal(proposal, context);
        if (completed !== undefined) {
          proposals.push(completed);
        }
      }
      return;
    }
    if (covered.has(current.key)) {
      walk(index + 1, actions, covered);
      return;
    }
    for (const action of actionsByConflict.get(current.key) ?? []) {
      walk(index + 1, [...actions, action], unionSets(covered, action.covers));
    }
  };
  walk(0, [], new Set());
  const unique = [...uniqueProposals(proposals)];
  if (unique.length > 0 || evaluations < maxConflictPlanEvaluations) {
    return unique;
  }
  const fallback = completeExecutableProposal(
    {
      code: "resolve_conflicts",
      message: "Remove all selected modules to clear unresolved conflicts",
      changeSet: {
        additions: [],
        removals: [...context.selectedKeys]
          .sort()
          .map((key) => context.byKey.get(key))
          .filter((record): record is RegisteredModule => record !== undefined)
          .map((record) => removalFromRecord(record, "resolve_conflict")),
      },
    },
    context,
  );
  return fallback === undefined ? [] : [fallback];
}

function conflictAtomicActions(
  conflict: ModuleResolverIssue,
  allConflicts: readonly ModuleResolverIssue[],
  orderedModules: readonly ResolvedModuleNode[],
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): readonly ConflictAtomicAction[] {
  const [leftKey, rightKey] = conflict.relationshipPath;
  if (leftKey === undefined || rightKey === undefined) {
    return [];
  }
  const actions: ConflictAtomicAction[] = [];
  for (const key of [leftKey, rightKey].sort()) {
    const ownerKeys = selectedOwnersForNode(key, context);
    if (ownerKeys.length === 0) {
      continue;
    }
    const ownerRecords = ownerKeys
      .map((ownerKey) => context.byKey.get(ownerKey))
      .filter((record): record is RegisteredModule => record !== undefined);
    if (ownerRecords.length === 0) {
      continue;
    }
    const changeSet: ModuleGraphChangeSet = {
      additions: [],
      removals: ownerRecords.map((record) =>
        removalFromRecord(record, "resolve_conflict"),
      ),
    };
    actions.push({
      code: "remove_conflicting_module",
      message:
        ownerKeys.length === 1
          ? `Remove ${ownerKeys[0]}`
          : `Remove ${ownerKeys.join(", ")} to deactivate ${key}`,
      changeSet,
      covers: conflictsCoveredByRemovalOwners(ownerKeys, allConflicts, context),
      sortKey: `remove:${key}:${ownerKeys.join("|")}`,
    });

    if (ownerRecords.length === 1) {
      const ownerRecord = ownerRecords[0];
      if (ownerRecord !== undefined) {
        for (const replacement of replacementChangeSets(
          ownerRecord,
          orderedModules,
          context,
        )) {
          actions.push({
            code: "replace_with_alternative",
            message: `Replace ${ownerRecord.registryKey} with ${replacement.alternative.registryKey}`,
            changeSet: replacement.changeSet,
            covers: conflictsCoveredByRemovalOwners(
              ownerKeys,
              allConflicts,
              context,
            ),
            sortKey: `replace:${key}:${ownerRecord.registryKey}:${replacement.alternative.registryKey}`,
          });
        }
      }
    }
  }
  return [...uniqueConflictActions(actions)].sort((left, right) =>
    left.sortKey.localeCompare(right.sortKey),
  );
}

function replacementChangeSets(
  target: RegisteredModule,
  orderedModules: readonly ResolvedModuleNode[],
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): readonly {
  readonly alternative: RegisteredModule;
  readonly changeSet: ModuleGraphChangeSet;
}[] {
  const activeKeys = new Set(orderedModules.map((node) => node.registryKey));
  const targetProvides = new Set(target.manifest.provides);
  const retainedActiveRecords = [...activeKeys]
    .filter((key) => key !== target.registryKey)
    .map((key) => context.byKey.get(key))
    .filter((record): record is RegisteredModule => record !== undefined);

  return [...context.byKey.values()]
    .filter((candidate) => candidate.registryKey !== target.registryKey)
    .filter((candidate) => !activeKeys.has(candidate.registryKey))
    .filter((candidate) => candidate.manifest.type === target.manifest.type)
    .filter((candidate) => candidate.manifest.risk !== "high")
    .filter((candidate) =>
      [...targetProvides].every((provided) =>
        candidate.manifest.provides.includes(provided),
      ),
    )
    .filter((candidate) =>
      retainedActiveRecords.every(
        (record) => !modulesConflict(candidate, record),
      ),
    )
    .map((alternative) => ({
      alternative,
      dependencyClosure: resolveModuleGraphCore(
        {
          knownManifests: context.knownManifests,
          selected: [selectionFromRecord(alternative)],
        },
        { buildProposals: false },
      ).resolution,
    }))
    .filter(({ dependencyClosure }) => dependencyClosure.issues.length === 0)
    .map(({ alternative, dependencyClosure }) => {
      const replacementAddition = additionFromRecord(
        alternative,
        target.registryKey,
        "replacement_alternative",
      );
      const additions = dedupeAdditions([
        replacementAddition,
        ...dependencyClosure.additions,
      ]);
      return {
        alternative,
        changeSet: {
          additions,
          removals: [removalFromRecord(target, "replace_with_alternative")],
        },
      };
    })
    .sort((left, right) =>
      compareAlternativeCandidates(left.alternative, right.alternative),
    );
}

function proposalFromAtomicActions(
  actions: readonly ConflictAtomicAction[],
): ModuleGraphProposal | undefined {
  if (actions.length === 0) {
    return undefined;
  }
  const changeSet = mergeChangeSets(actions.map((entry) => entry.changeSet));
  const onlyCode = new Set(actions.map((entry) => entry.code));
  const code =
    actions.length === 1 && onlyCode.size === 1
      ? actions[0]?.code
      : "resolve_conflicts";
  if (code === undefined) {
    return undefined;
  }
  return {
    code,
    message: actions
      .map((entry) => entry.message)
      .sort()
      .join("; "),
    changeSet,
  };
}

function mergeChangeSets(
  changeSets: readonly ModuleGraphChangeSet[],
): ModuleGraphChangeSet {
  const additions = new Map<string, ModuleGraphAddition>();
  const removals = new Map<string, ModuleGraphRemoval>();
  for (const changeSet of changeSets) {
    for (const removal of changeSet.removals) {
      removals.set(removal.registryKey, removal);
    }
    for (const addition of changeSet.additions) {
      if (!removals.has(addition.registryKey)) {
        additions.set(addition.registryKey, addition);
      }
    }
  }
  return {
    additions: [...additions.values()].sort((left, right) =>
      left.registryKey.localeCompare(right.registryKey),
    ),
    removals: [...removals.values()].sort((left, right) =>
      left.registryKey.localeCompare(right.registryKey),
    ),
  };
}

function conflictsCoveredByRemovalOwners(
  ownerKeys: readonly string[],
  conflicts: readonly ModuleResolverIssue[],
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): ReadonlySet<string> {
  const removed = new Set(ownerKeys);
  return new Set(
    conflicts
      .filter((entry) =>
        entry.relationshipPath.some((nodeKey) => {
          const owners = selectedOwnersForNode(nodeKey, context);
          return (
            owners.length > 0 && owners.every((owner) => removed.has(owner))
          );
        }),
      )
      .map((entry) => conflictKey(entry)),
  );
}

function conflictKey(conflict: ModuleResolverIssue): string {
  return conflict.relationshipPath.join("<->");
}

function selectedOwnersForNode(
  registryKey: string,
  context: Pick<ResolverCoreResult, "nodeOwners" | "selectedKeys">,
): readonly string[] {
  return [
    ...(context.nodeOwners.get(registryKey) ??
      (context.selectedKeys.has(registryKey) ? [registryKey] : [])),
  ].sort();
}

function uniqueConflictActions(
  actions: readonly ConflictAtomicAction[],
): readonly ConflictAtomicAction[] {
  const byKey = new Map<string, ConflictAtomicAction>();
  for (const action of actions) {
    byKey.set(
      `${action.sortKey}:${canonicalizeJson(action.changeSet)}`,
      action,
    );
  }
  return [...byKey.values()];
}

function unionSets<T>(
  left: ReadonlySet<T>,
  right: ReadonlySet<T>,
): ReadonlySet<T> {
  return new Set([...left, ...right]);
}

function dedupeAdditions(
  additions: readonly ModuleGraphAddition[],
): readonly ModuleGraphAddition[] {
  const byKey = new Map<string, ModuleGraphAddition>();
  for (const addition of additions) {
    byKey.set(addition.registryKey, addition);
  }
  return [...byKey.values()].sort((left, right) =>
    left.registryKey.localeCompare(right.registryKey),
  );
}

function modulesConflict(
  left: RegisteredModule,
  right: RegisteredModule,
): boolean {
  return (
    conflictTokenIndex(left.manifest, right) !== undefined ||
    conflictTokenIndex(right.manifest, left) !== undefined
  );
}

function compareResolverIssues(
  left: ModuleResolverIssue,
  right: ModuleResolverIssue,
): number {
  return `${left.code}:${left.pointer}:${left.relationshipPath.join(">")}`.localeCompare(
    `${right.code}:${right.pointer}:${right.relationshipPath.join(">")}`,
  );
}

function compareRecommendationCandidates(
  left: RegisteredModule,
  right: RegisteredModule,
): number {
  const riskOrder = { low: 0, medium: 1, high: 2 } as const;
  const riskDelta =
    riskOrder[left.manifest.risk] - riskOrder[right.manifest.risk];
  return riskDelta === 0
    ? left.registryKey.localeCompare(right.registryKey)
    : riskDelta;
}

function uniqueProposals(
  proposals: readonly ModuleGraphProposal[],
): readonly ModuleGraphProposal[] {
  const byKey = new Map<string, ModuleGraphProposal>();
  for (const proposal of proposals) {
    byKey.set(canonicalizeJson(proposal), proposal);
  }
  return [...byKey.values()];
}

function collectResolverInputMetadata(
  knownManifests: readonly unknown[],
): ResolverInputMetadata {
  const manifests = new Map<string, ManifestInputMetadata>();
  knownManifests.forEach((candidate, index) => {
    const loaded = loadModuleManifest(candidate);
    if (!loaded.ok || manifests.has(loaded.value.registryKey)) {
      return;
    }
    manifests.set(loaded.value.registryKey, {
      pointer: `/knownManifests/${index}`,
      requires: collectTokenOccurrences(candidate, "requires"),
      conflicts: collectTokenOccurrences(candidate, "conflicts"),
    });
  });
  return { manifests };
}

function collectTokenOccurrences(
  candidate: unknown,
  key: "requires" | "conflicts",
): TokenOccurrenceIndexes {
  if (!isRecord(candidate) || !Array.isArray(candidate[key])) {
    return new Map();
  }
  const occurrences = new Map<string, number[]>();
  candidate[key].forEach((token, index) => {
    if (typeof token !== "string") {
      return;
    }
    const indexes = occurrences.get(token) ?? [];
    indexes.push(index);
    occurrences.set(token, indexes);
  });
  return occurrences;
}

function tokenPointer(
  metadata: ResolverInputMetadata,
  registryKey: string,
  key: "requires" | "conflicts",
  token: string,
  occurrence: number,
): string {
  const manifest = metadata.manifests.get(registryKey);
  const index = manifest?.[key].get(token)?.[occurrence];
  return `${manifest?.pointer ?? ""}/${key}/${index ?? 0}`;
}

function collectSelectedRootOwners(
  selected: readonly ModuleGraphSelection[],
  byKey: ReadonlyMap<string, RegisteredModule>,
  activeKeys: ReadonlySet<string>,
): ReadonlyMap<string, readonly string[]> {
  const owners = new Map<string, Set<string>>();
  const addOwner = (nodeKey: string, ownerKey: string): void => {
    const existing = owners.get(nodeKey) ?? new Set<string>();
    existing.add(ownerKey);
    owners.set(nodeKey, existing);
  };

  const walk = (nodeKey: string, ownerKey: string, seen: Set<string>): void => {
    if (seen.has(nodeKey) || !activeKeys.has(nodeKey)) {
      return;
    }
    seen.add(nodeKey);
    addOwner(nodeKey, ownerKey);
    const record = byKey.get(nodeKey);
    if (record === undefined) {
      return;
    }
    const dependencyOccurrences = new Map<string, number>();
    const dependencyKeys = record.manifest.requires
      .map((ref) => {
        const occurrence = dependencyOccurrences.get(ref) ?? 0;
        dependencyOccurrences.set(ref, occurrence + 1);
        return { ref, occurrence, parsed: parseDependencyRef(ref) };
      })
      .sort((left, right) =>
        `${left.ref}:${left.occurrence}`.localeCompare(
          `${right.ref}:${right.occurrence}`,
        ),
      )
      .map((entry) => entry.parsed?.key)
      .filter((key): key is string => key !== undefined);
    for (const dependencyKey of dependencyKeys) {
      walk(dependencyKey, ownerKey, seen);
    }
  };

  for (const entry of selected) {
    const ownerKey = moduleRegistryKey(entry.moduleId, entry.exactVersion);
    walk(ownerKey, ownerKey, new Set());
  }

  return new Map(
    [...owners.entries()].map(([key, value]) => [key, [...value].sort()]),
  );
}

function completeExecutableProposal(
  proposal: ModuleGraphProposal,
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): ModuleGraphProposal | undefined {
  const selected = applyChangeSet(context.selected, proposal.changeSet);
  const validation = resolveModuleGraphCore(
    { knownManifests: context.knownManifests, selected },
    { buildProposals: false },
  ).resolution;
  if (validation.issues.length > 0) {
    return undefined;
  }
  const completed =
    validation.additions.length === 0
      ? proposal
      : {
          ...proposal,
          changeSet: mergeChangeSets([
            proposal.changeSet,
            { additions: validation.additions, removals: [] },
          ]),
        };
  return proposalIsExecutable(completed, context) ? completed : undefined;
}

function proposalIsExecutable(
  proposal: ModuleGraphProposal,
  context: Omit<ResolverCoreResult, "resolution"> & {
    readonly knownManifests: readonly unknown[];
  },
): boolean {
  const selected = applyChangeSet(context.selected, proposal.changeSet);
  const validation = resolveModuleGraphCore(
    { knownManifests: context.knownManifests, selected },
    { buildProposals: false },
  ).resolution;
  return validation.issues.length === 0 && validation.additions.length === 0;
}

function applyChangeSet(
  selected: readonly ModuleGraphSelection[],
  changeSet: ModuleGraphChangeSet,
): readonly ModuleGraphSelection[] {
  const removals = new Set(
    changeSet.removals.map((entry) => entry.registryKey),
  );
  const next = new Map<string, ModuleGraphSelection>();
  for (const entry of selected) {
    const key = moduleRegistryKey(entry.moduleId, entry.exactVersion);
    if (!removals.has(key)) {
      next.set(key, entry);
    }
  }
  for (const addition of changeSet.additions) {
    next.set(addition.registryKey, {
      moduleId: addition.moduleId,
      exactVersion: addition.exactVersion,
      artifactDigest: addition.artifactDigest,
    });
  }
  return [...next.values()].sort((left, right) =>
    moduleRegistryKey(left.moduleId, left.exactVersion).localeCompare(
      moduleRegistryKey(right.moduleId, right.exactVersion),
    ),
  );
}

function selectionFromRecord(record: RegisteredModule): ModuleGraphSelection {
  return {
    moduleId: record.manifest.id,
    exactVersion: record.manifest.version,
    artifactDigest: record.manifest.artifactDigest,
  };
}

function additionFromRecord(
  record: RegisteredModule,
  requiredBy: string,
  reason: ModuleGraphAddition["reason"] = "required_dependency",
): ModuleGraphAddition {
  return {
    moduleId: record.manifest.id,
    exactVersion: record.manifest.version,
    artifactDigest: record.manifest.artifactDigest,
    registryKey: record.registryKey,
    reason,
    requiredBy,
    relationshipPath: [requiredBy, record.registryKey],
  };
}

function removalFromRecord(
  record: RegisteredModule,
  reason: ModuleGraphRemoval["reason"],
): ModuleGraphRemoval {
  return {
    moduleId: record.manifest.id,
    exactVersion: record.manifest.version,
    registryKey: record.registryKey,
    reason,
  };
}

function dedupeSelections(
  selections: readonly ModuleGraphSelection[],
): readonly ModuleGraphSelection[] {
  const byKey = new Map<string, ModuleGraphSelection>();
  for (const selection of selections) {
    byKey.set(
      moduleRegistryKey(selection.moduleId, selection.exactVersion),
      selection,
    );
  }
  return [...byKey.values()].sort((left, right) =>
    moduleRegistryKey(left.moduleId, left.exactVersion).localeCompare(
      moduleRegistryKey(right.moduleId, right.exactVersion),
    ),
  );
}

interface RecommendationCandidateSet {
  readonly provide: string;
  readonly candidates: readonly RegisteredModule[];
}

interface RecommendationAttempt {
  readonly records: readonly RegisteredModule[];
  readonly reasons: readonly ModuleRecommendation["reasons"][number][];
  readonly selected: readonly ModuleGraphSelection[];
  readonly resolution: ModuleGraphResolution;
  readonly score: RecommendationScore;
}

interface RecommendationSearchResult {
  readonly best?: RecommendationAttempt;
  readonly firstFailure?: readonly ModuleResolverIssue[];
  readonly limitExceeded: boolean;
}

function searchRecommendationAttempts(
  candidateSets: readonly RecommendationCandidateSet[],
  knownManifests: readonly unknown[],
): RecommendationSearchResult {
  let evaluations = 0;
  let best: RecommendationAttempt | undefined;
  let firstFailure: readonly ModuleResolverIssue[] | undefined;
  let limitExceeded = false;

  const walk = (
    index: number,
    records: readonly RegisteredModule[],
    reasons: readonly ModuleRecommendation["reasons"][number][],
  ): void => {
    if (limitExceeded) {
      return;
    }
    if (best !== undefined) {
      const lowerBound = recommendationLowerBound(records);
      if (compareRecommendationScores(lowerBound, best.score) > 0) {
        return;
      }
    }
    const current = candidateSets[index];
    if (current === undefined) {
      evaluations += 1;
      if (evaluations > maxRecommendationEvaluations) {
        limitExceeded = true;
        return;
      }
      const highRiskIssues = records
        .filter((record) => record.manifest.risk === "high")
        .map((record) =>
          resolverIssue(
            "high_risk_autofill_blocked",
            "",
            `${record.registryKey} is high risk and cannot be recommended automatically`,
            [record.registryKey],
          ),
        );
      if (highRiskIssues.length > 0) {
        firstFailure ??= highRiskIssues.sort(compareResolverIssues);
        return;
      }
      const selected = dedupeSelections(
        records.map((record) => selectionFromRecord(record)),
      );
      const resolution = resolveModuleGraphCore(
        { knownManifests, selected },
        { buildProposals: false },
      ).resolution;
      const issues = [...resolution.issues].sort(compareResolverIssues);
      if (issues.length > 0) {
        firstFailure ??= issues;
        return;
      }
      const attempt: RecommendationAttempt = {
        records,
        reasons,
        selected,
        resolution,
        score: recommendationScore(resolution),
      };
      if (
        best === undefined ||
        compareRecommendationAttempts(attempt, best) < 0
      ) {
        best = attempt;
      }
      return;
    }
    for (const candidate of current.candidates) {
      walk(
        index + 1,
        [...records, candidate],
        [
          ...reasons,
          {
            provide: current.provide,
            registryKey: candidate.registryKey,
            message: `${candidate.registryKey} provides ${current.provide}`,
          },
        ],
      );
    }
  };
  walk(0, [], []);
  return {
    ...(best === undefined ? {} : { best }),
    ...(firstFailure === undefined ? {} : { firstFailure }),
    limitExceeded,
  };
}

interface RecommendationScore {
  readonly risk: number;
  readonly count: number;
  readonly key: string;
}

function recommendationScore(
  resolution: ModuleGraphResolution,
): RecommendationScore {
  const uniqueNodes = new Map(
    resolution.orderedModules.map((node) => [node.registryKey, node]),
  );
  return {
    risk: [...uniqueNodes.values()].reduce(
      (sum, node) => sum + riskScore(node.risk),
      0,
    ),
    count: uniqueNodes.size,
    key: [...uniqueNodes.keys()].sort().join("|"),
  };
}

function compareRecommendationAttempts(
  left: RecommendationAttempt & { readonly score: RecommendationScore },
  right: RecommendationAttempt & { readonly score: RecommendationScore },
): number {
  return (
    left.score.risk - right.score.risk ||
    left.score.count - right.score.count ||
    left.score.key.localeCompare(right.score.key)
  );
}

function compareRecommendationScores(
  left: RecommendationScore,
  right: RecommendationScore,
): number {
  return (
    left.risk - right.risk ||
    left.count - right.count ||
    left.key.localeCompare(right.key)
  );
}

function recommendationLowerBound(
  records: readonly RegisteredModule[],
): RecommendationScore {
  const unique = new Map(records.map((record) => [record.registryKey, record]));
  return {
    risk: [...unique.values()].reduce(
      (sum, record) => sum + riskScore(record.manifest.risk),
      0,
    ),
    count: unique.size,
    key: [...unique.keys()].sort().join("|"),
  };
}

function riskScore(risk: ModuleManifest["risk"]): number {
  return risk === "low" ? 0 : risk === "medium" ? 1 : 100;
}

function compareAlternativeCandidates(
  left: RegisteredModule,
  right: RegisteredModule,
): number {
  return (
    riskScore(left.manifest.risk) - riskScore(right.manifest.risk) ||
    left.registryKey.localeCompare(right.registryKey)
  );
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function normalizeManifest(manifest: ModuleManifest): TypedModuleManifest {
  const normalized: ModuleManifest = {
    id: manifest.id,
    version: manifest.version,
    type: manifest.type,
    apiVersion: manifest.apiVersion,
    implementation: manifest.implementation,
    requires: [...manifest.requires].sort(),
    conflicts: [...manifest.conflicts].sort(),
    provides: [...manifest.provides].sort(),
    ...(manifest.configSchemaRef === undefined
      ? {}
      : { configSchemaRef: manifest.configSchemaRef }),
    ...(manifest.inputSchemaRef === undefined
      ? {}
      : { inputSchemaRef: manifest.inputSchemaRef }),
    ...(manifest.outputSchemaRef === undefined
      ? {}
      : { outputSchemaRef: manifest.outputSchemaRef }),
    permissions: [...manifest.permissions].sort(),
    risk: manifest.risk,
    limits: {
      requestsPerMinute: manifest.limits.requestsPerMinute,
      maxConcurrency: manifest.limits.maxConcurrency,
      timeoutMs: manifest.limits.timeoutMs,
      maxResults: manifest.limits.maxResults,
      maxSections: manifest.limits.maxSections,
      maxResponseBytes: manifest.limits.maxResponseBytes,
    },
    artifactDigest: manifest.artifactDigest,
    signature: {
      keyId: manifest.signature.keyId,
      value: manifest.signature.value,
    },
  };
  return normalized as TypedModuleManifest;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

function validateJsonSchema(
  value: unknown,
  schema: JsonSchema,
  at: string,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (
    schema.enum !== undefined &&
    !schema.enum.some((entry) => entry === value)
  ) {
    issues.push(
      issue(at, "invalid_enum", "value is not one of the allowed options"),
    );
  }
  if (schema.type !== undefined) {
    const typeIssue = validateJsonType(value, schema.type, at);
    if (typeIssue !== undefined) {
      issues.push(typeIssue);
      return issues;
    }
  }
  if (schema.type === "object" && isRecord(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        issues.push(issue(pointer(at, key), "required", `${key} is required`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          issues.push(
            issue(
              pointer(at, key),
              "additional_property",
              `${key} is not allowed`,
            ),
          );
        }
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (value[key] !== undefined) {
        issues.push(
          ...validateJsonSchema(value[key], childSchema, pointer(at, key)),
        );
      }
    }
  }
  if (
    schema.type === "array" &&
    Array.isArray(value) &&
    schema.items !== undefined
  ) {
    value.forEach((item, index) => {
      issues.push(
        ...validateJsonSchema(
          item,
          schema.items as JsonSchema,
          pointer(at, index),
        ),
      );
    });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(
        issue(at, "min_length", `string length must be >= ${schema.minLength}`),
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push(
        issue(at, "max_length", `string length must be <= ${schema.maxLength}`),
      );
    }
    if (
      schema.pattern !== undefined &&
      !new RegExp(schema.pattern).test(value)
    ) {
      issues.push(
        issue(at, "pattern", "string does not match required pattern"),
      );
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(issue(at, "minimum", `number must be >= ${schema.minimum}`));
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(issue(at, "maximum", `number must be <= ${schema.maximum}`));
    }
  }
  return issues;
}

function validateJsonType(
  value: unknown,
  type: NonNullable<JsonSchema["type"]>,
  at: string,
): ValidationIssue | undefined {
  if (type === "object") {
    return isRecord(value)
      ? undefined
      : issue(at, "invalid_type", "value must be an object");
  }
  if (type === "array") {
    return Array.isArray(value)
      ? undefined
      : issue(at, "invalid_type", "value must be an array");
  }
  if (type === "integer") {
    return Number.isInteger(value)
      ? undefined
      : issue(at, "invalid_type", "value must be an integer");
  }
  if (type === "number") {
    return typeof value === "number" && Number.isFinite(value)
      ? undefined
      : issue(at, "invalid_type", "value must be a number");
  }
  if (type === "boolean") {
    return typeof value === "boolean"
      ? undefined
      : issue(at, "invalid_type", "value must be a boolean");
  }
  return typeof value === "string"
    ? undefined
    : issue(at, "invalid_type", "value must be a string");
}
