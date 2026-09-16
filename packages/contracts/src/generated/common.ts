/* eslint-disable */
// Generated from packages/contracts/openapi/common.v1.json. Do not edit by hand.

export type OpaqueId = string;

export type UtcDateTime = string;

export type RequestId = OpaqueId;

export type TraceId = string;

export type Cursor = string;

export interface CursorPaginationRequest {
  cursor?: Cursor;
  limit?: number;
}

export interface PageInfo {
  hasMore: boolean;
  nextCursor?: Cursor;
}

export interface CursorPage {
  items: Array<Record<string, unknown>>;
  pageInfo: PageInfo;
}

export type JobStatus =
  | "accepted"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AcceptedJobResponse {
  jobId: OpaqueId;
  status: JobStatus;
  statusUrl: string;
}

export interface Job {
  jobId: OpaqueId;
  requestId: RequestId;
  status: JobStatus;
  createdAt: UtcDateTime;
  updatedAt: UtcDateTime;
  retryable?: boolean;
  resultUrl?: string;
  error?: ErrorEnvelope;
}

export type ErrorCode =
  | "AUTHN_SESSION_EXPIRED"
  | "AUTHZ_NOT_FOUND_OR_DENIED"
  | "DATA_UPLOAD_INTERRUPTED"
  | "DATA_FILE_QUARANTINED"
  | "DATA_PARSE_PARTIAL"
  | "DATA_CONNECTION_FAILED"
  | "MODULE_DEPENDENCY_MISSING"
  | "MODULE_CONFLICT"
  | "DEFINITION_LIMIT_EXCEEDED"
  | "DEFINITION_INVALID_REQUEST"
  | "TEST_RUN_FAILED"
  | "DEPLOY_DEFINITION_MISMATCH"
  | "QUOTA_EXCEEDED"
  | "DEPENDENCY_UNAVAILABLE";

export type ErrorCategory =
  | "AUTHN"
  | "AUTHZ"
  | "DATA"
  | "MODULE"
  | "DEFINITION"
  | "TEST"
  | "DEPLOY"
  | "QUOTA"
  | "DEPENDENCY";

export type ErrorDetails = Record<string, unknown>;

export interface Error {
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  requestId: RequestId;
  retryable: boolean;
  nextAction: string;
  details?: ErrorDetails;
}

export interface ErrorEnvelope {
  error: Error;
}

export interface DomainEventEnvelope {
  eventId: OpaqueId;
  eventType: string;
  occurredAt: UtcDateTime;
  workspaceId: OpaqueId;
  projectId: OpaqueId;
  aggregateId: OpaqueId;
  aggregateVersion: number;
  traceId: TraceId;
  idempotencyKey: string;
  data: Record<string, unknown>;
}
