import type { PageStateProps } from "../../packages/ui/src/index.js";

const partialValid: PageStateProps = {
  id: "partial-valid",
  kind: "partial",
  title: "Partial",
  description: "Partial state.",
  counts: { succeeded: 1, failed: 0, impact: "No impact." },
};

const degradedValid: PageStateProps = {
  id: "degraded-valid",
  kind: "degraded",
  title: "Degraded",
  description: "Degraded state.",
  capabilities: { available: ["search"], unavailable: ["citations"] },
};

const permissionValid: PageStateProps = {
  kind: "permission",
  action: "contactAdmin",
};

void partialValid;
void degradedValid;
void permissionValid;

// @ts-expect-error partial states must carry structured counts.
const partialMissingCounts: PageStateProps = {
  id: "partial-missing",
  kind: "partial",
  title: "Partial",
  description: "Missing counts.",
};

// @ts-expect-error degraded states must carry capability summary.
const degradedMissingCapabilities: PageStateProps = {
  id: "degraded-missing",
  kind: "degraded",
  title: "Degraded",
  description: "Missing capabilities.",
};

// @ts-expect-error permission states must not accept caller details.
const permissionWithDetails: PageStateProps = {
  kind: "permission",
  details: "Sensitive resource detail.",
};

// @ts-expect-error permission states must not accept caller counts.
const permissionWithCounts: PageStateProps = {
  kind: "permission",
  counts: { succeeded: 1, failed: 1, impact: "Sensitive impact." },
};

// @ts-expect-error permission states must not accept caller capabilities.
const permissionWithCapabilities: PageStateProps = {
  kind: "permission",
  capabilities: { available: ["secret"], unavailable: [] },
};

void partialMissingCounts;
void degradedMissingCapabilities;
void permissionWithDetails;
void permissionWithCounts;
void permissionWithCapabilities;
