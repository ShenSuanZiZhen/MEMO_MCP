export type DomainErrorCode =
  | "ACTOR_NOT_ALLOWED"
  | "IMPACT_SCOPE_REQUIRED"
  | "INVALID_STATE_PRECONDITION"
  | "INVALID_STATE_TRANSITION"
  | "INVALID_VALUE"
  | "MISSING_CAPABILITY"
  | "MISSING_REASON"
  | "RESOURCE_NOT_IN_SCOPE"
  | "REVISION_CONFLICT"
  | "REVISION_OVERFLOW"
  | "SCOPE_MISMATCH";

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export type DomainResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

export function ok<T>(value: T): DomainResult<T> {
  return { ok: true, value };
}

export function err(
  code: DomainErrorCode,
  message: string,
  details?: Readonly<Record<string, string | number | boolean>>,
): DomainResult<never> {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}
