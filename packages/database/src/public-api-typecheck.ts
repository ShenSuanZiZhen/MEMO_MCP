import { withTenantTransaction } from "./index.js";
import type { TransactionConnectionProvider } from "./index.js";

declare const provider: TransactionConnectionProvider;

void withTenantTransaction(
  provider,
  {
    scope: {
      workspaceId: "018f0000-0000-7000-8000-000000000001",
      projectId: "018f0000-0000-7000-8000-000000000201",
      environment: "production",
    },
    actorId: "018f0000-0000-7000-8000-000000000101",
  },
  async () => undefined,
);

void withTenantTransaction(
  provider,
  {
    // @ts-expect-error project/environment scope is required for repository support transactions.
    scope: {
      workspaceId: "018f0000-0000-7000-8000-000000000001",
    },
    actorId: "018f0000-0000-7000-8000-000000000101",
  },
  async () => undefined,
);
