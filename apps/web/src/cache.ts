import type { Environment } from "@modular-mcp/contracts";

export interface TenantScope {
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly environment?: Environment;
}

export type QueryKeyPart =
  | string
  | number
  | boolean
  | null
  | readonly QueryKeyPart[];

export type QueryKey = readonly QueryKeyPart[];

export function tenantScopeKey(scope: TenantScope): string {
  const project = scope.projectId ?? "_";
  const environment = scope.environment ?? "_";
  return `tenant:${scope.workspaceId}:${project}:${environment}`;
}

export function createQueryKey(
  scope: TenantScope,
  operation: string,
  parts: QueryKey = [],
): QueryKey {
  return [tenantScopeKey(scope), operation, ...parts];
}

export interface TenantQueryCache {
  readonly size: number;
  get<T>(key: QueryKey): T | undefined;
  set<T>(key: QueryKey, value: T): void;
  clearEnvironment(
    workspaceId: string,
    projectId: string,
    environment: Environment,
  ): void;
  clearProject(workspaceId: string, projectId: string): void;
  clearWorkspace(workspaceId: string): void;
  clearScope(scope: TenantScope): void;
  clearAll(): void;
  keys(): readonly string[];
}

export function createTenantQueryCache(): TenantQueryCache {
  const entries = new Map<
    string,
    { readonly scope: TenantScope | undefined; readonly value: unknown }
  >();

  return {
    get size() {
      return entries.size;
    },
    get<T>(key: QueryKey): T | undefined {
      return typed<T>(entries.get(serializeQueryKey(key))?.value);
    },
    set<T>(key: QueryKey, value: T): void {
      entries.set(serializeQueryKey(key), {
        scope: scopeFromQueryKey(key),
        value,
      });
    },
    clearEnvironment(
      workspaceId: string,
      projectId: string,
      environment: Environment,
    ): void {
      deleteWhere(
        entries,
        (scope) =>
          scope?.workspaceId === workspaceId &&
          scope.projectId === projectId &&
          scope.environment === environment,
      );
    },
    clearProject(workspaceId: string, projectId: string): void {
      deleteWhere(
        entries,
        (scope) =>
          scope?.workspaceId === workspaceId && scope.projectId === projectId,
      );
    },
    clearWorkspace(workspaceId: string): void {
      deleteWhere(entries, (scope) => scope?.workspaceId === workspaceId);
    },
    clearScope(scope: TenantScope): void {
      if (scope.projectId && scope.environment) {
        this.clearEnvironment(
          scope.workspaceId,
          scope.projectId,
          scope.environment,
        );
      } else if (scope.projectId) {
        this.clearProject(scope.workspaceId, scope.projectId);
      } else {
        this.clearWorkspace(scope.workspaceId);
      }
    },
    clearAll(): void {
      entries.clear();
    },
    keys(): readonly string[] {
      return [...entries.keys()].sort();
    },
  };
}

function serializeQueryKey(key: QueryKey): string {
  return JSON.stringify(key);
}

function typed<Value>(value: unknown): Value | undefined {
  return value as Value | undefined;
}

function scopeFromQueryKey(key: QueryKey): TenantScope | undefined {
  const first = key[0];
  if (typeof first !== "string" || !first.startsWith("tenant:")) {
    return undefined;
  }
  const parts = first.slice("tenant:".length).split(":");
  const [workspaceId, projectId, environment] = parts;
  if (!workspaceId || parts.length !== 3) {
    return undefined;
  }
  const scope: TenantScope = { workspaceId };
  if (projectId && projectId !== "_") {
    return {
      ...scope,
      projectId,
      ...(isEnvironment(environment) ? { environment } : {}),
    };
  }
  return scope;
}

function isEnvironment(value: string | undefined): value is Environment {
  return value === "development" || value === "test" || value === "production";
}

function deleteWhere(
  entries: Map<
    string,
    { readonly scope: TenantScope | undefined; readonly value: unknown }
  >,
  predicate: (scope: TenantScope | undefined) => boolean,
): void {
  for (const [key, entry] of entries) {
    if (predicate(entry.scope)) {
      entries.delete(key);
    }
  }
}
