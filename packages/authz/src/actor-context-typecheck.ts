import type { ActorContext } from "./index.js";

type ManualActorContext = {
  readonly schemaVersion: "authz.actor-context.v1";
  readonly actorId: string;
  readonly identity: {
    readonly issuer: string;
    readonly subject: string;
  };
  readonly environment: "development";
  readonly workspaces: readonly {
    readonly workspaceId: string;
    readonly roles: readonly ["reviewer"];
    readonly capabilities: readonly ["draft.read"];
  }[];
};

type ManualContextIsAssignable = ManualActorContext extends ActorContext
  ? true
  : false;

// @ts-expect-error ActorContext must retain its private nominal brand.
const manualActorContextCanBeAssigned: ManualContextIsAssignable = true;

void manualActorContextCanBeAssigned;
