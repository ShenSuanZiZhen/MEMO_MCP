CREATE TYPE app.module_kind AS ENUM (
  'source',
  'capability',
  'output',
  'prompt'
);
CREATE TYPE app.module_version_status AS ENUM (
  'draft',
  'testing',
  'submitted',
  'approved',
  'deprecated',
  'blocked'
);
CREATE TYPE app.candidate_status AS ENUM (
  'submitted',
  'changes_requested',
  'materials_required',
  'rejected',
  'approved',
  'withdrawn'
);
CREATE TYPE app.test_run_status AS ENUM (
  'queued',
  'running',
  'passed',
  'failed',
  'cancelled'
);
CREATE TYPE app.test_case_status AS ENUM (
  'passed',
  'failed',
  'skipped'
);
CREATE TYPE app.service_version_status AS ENUM (
  'approved',
  'deploying',
  'published',
  'suspended',
  'retired'
);
CREATE TYPE app.deployment_status AS ENUM (
  'provisioning',
  'healthy',
  'degraded',
  'draining',
  'suspended',
  'stopped',
  'blocked'
);
CREATE TYPE app.policy_version_status AS ENUM (
  'draft',
  'active',
  'retired'
);
CREATE TYPE app.credential_kind AS ENUM (
  'api_key',
  'oauth_client'
);
CREATE TYPE app.credential_status AS ENUM (
  'active',
  'rotating',
  'revoked',
  'expired'
);
CREATE TYPE app.rotation_status AS ENUM (
  'scheduled',
  'active',
  'completed',
  'cancelled'
);
CREATE TYPE app.request_trace_status AS ENUM (
  'allowed',
  'denied',
  'errored'
);
CREATE TYPE app.usage_unit AS ENUM (
  'request',
  'token',
  'byte',
  'millisecond'
);

CREATE FUNCTION app.reject_immutable_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
END;
$$;

CREATE FUNCTION app.reject_audit_event_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only';
END;
$$;

CREATE FUNCTION app.is_valid_deployment_transition(
  from_status app.deployment_status,
  to_status app.deployment_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    (from_status = 'provisioning' AND to_status IN ('healthy', 'blocked'))
    OR (from_status = 'healthy' AND to_status IN ('degraded', 'draining'))
    OR (from_status = 'degraded' AND to_status IN ('healthy', 'draining', 'blocked'))
    OR (from_status = 'draining' AND to_status IN ('suspended', 'stopped'))
    OR (from_status = 'suspended' AND to_status IN ('healthy', 'stopped'));
$$;

CREATE FUNCTION app.protect_module_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'module version initial status must be draft with revision 1';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.module_id IS DISTINCT FROM OLD.module_id
    OR NEW.module_name IS DISTINCT FROM OLD.module_name
    OR NEW.module_kind IS DISTINCT FROM OLD.module_kind
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
    OR NEW.signature_digest IS DISTINCT FROM OLD.signature_digest
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'module version content is immutable';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;

  IF OLD.status IN ('deprecated', 'blocked') THEN
    RAISE EXCEPTION 'terminal module version status is immutable';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'module version status update requires a status change';
  END IF;

  IF NOT (
      (OLD.status = 'draft' AND NEW.status = 'testing')
      OR (OLD.status = 'testing' AND NEW.status = 'submitted')
      OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'blocked'))
      OR (OLD.status = 'approved' AND NEW.status IN ('deprecated', 'blocked'))
    )
  THEN
    RAISE EXCEPTION 'invalid module version status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_candidate_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'submitted' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'candidate initial status must be submitted with revision 1';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
    OR NEW.definition_digest IS DISTINCT FROM OLD.definition_digest
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.frozen IS DISTINCT FROM OLD.frozen
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'candidate content is immutable';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;

  IF OLD.status <> 'submitted' THEN
    RAISE EXCEPTION 'terminal candidate status is immutable';
  END IF;

  IF NEW.status NOT IN (
    'changes_requested',
    'materials_required',
    'rejected',
    'approved',
    'withdrawn'
  ) THEN
    RAISE EXCEPTION 'invalid candidate status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_service_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'approved' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'service version initial status must be approved with revision 1';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.definition_digest IS DISTINCT FROM OLD.definition_digest
    OR NEW.artifact_digest IS DISTINCT FROM OLD.artifact_digest
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'service version content is immutable';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;

  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION 'retired service version is immutable';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'service version status update requires a status change';
  END IF;

  IF NOT (
      (OLD.status = 'approved' AND NEW.status = 'deploying')
      OR (OLD.status = 'deploying' AND NEW.status = 'published')
      OR (OLD.status = 'published' AND NEW.status = 'suspended')
      OR (OLD.status = 'suspended' AND NEW.status IN ('published', 'retired'))
    )
  THEN
    RAISE EXCEPTION 'invalid service version status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_credential_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'credential initial status must be active with revision 1';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('revoked', 'expired') THEN
    RAISE EXCEPTION 'terminal credential status is immutable';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.access_policy_id IS DISTINCT FROM OLD.access_policy_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
    OR NEW.public_digest IS DISTINCT FROM OLD.public_digest
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'credential content is immutable';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.expires_at IS NOT DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'credential update requires status or expires_at change';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NOT (
      (OLD.status = 'active' AND NEW.status IN ('rotating', 'revoked', 'expired'))
      OR (OLD.status = 'rotating' AND NEW.status IN ('revoked', 'expired'))
    )
  THEN
    RAISE EXCEPTION 'invalid credential status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_deployment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'provisioning' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'deployment initial status must be provisioning with revision 1';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.service_version_id IS DISTINCT FROM OLD.service_version_id
    OR NEW.definition_digest IS DISTINCT FROM OLD.definition_digest
    OR NEW.deployed_at IS DISTINCT FROM OLD.deployed_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'deployment content is immutable';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'deployment status update requires a status change';
  END IF;

  IF NOT app.is_valid_deployment_transition(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'invalid deployment status transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.require_matching_deployment_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
    AND NOT EXISTS (
      SELECT 1
      FROM app.deployment_events event
      WHERE event.workspace_id = NEW.workspace_id
        AND event.project_id = NEW.project_id
        AND event.environment = NEW.environment
        AND event.deployment_id = NEW.id
        AND event.from_status = OLD.status
        AND event.to_status = NEW.status
        AND event.deployment_revision = NEW.revision
    )
  THEN
    RAISE EXCEPTION 'deployment status update requires matching deployment event';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_deployment_event_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.deployment_revision = 1 THEN
    IF NEW.from_status IS NOT NULL OR NEW.to_status <> 'provisioning' THEN
      RAISE EXCEPTION 'initial deployment event must record provisioning revision 1';
    END IF;
  ELSIF NEW.from_status IS NULL THEN
    RAISE EXCEPTION 'deployment event from_status is required';
  ELSIF NOT app.is_valid_deployment_transition(NEW.from_status, NEW.to_status) THEN
    RAISE EXCEPTION 'invalid deployment event status transition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM app.deployments deployment
    WHERE deployment.workspace_id = NEW.workspace_id
      AND deployment.project_id = NEW.project_id
      AND deployment.environment = NEW.environment
      AND deployment.id = NEW.deployment_id
      AND deployment.revision = NEW.deployment_revision
      AND deployment.status = NEW.to_status
  ) THEN
    RAISE EXCEPTION 'deployment event must match deployment state';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_test_run_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.revision <> 1 THEN
      RAISE EXCEPTION 'test run initial status must be queued with revision 1';
    END IF;
    IF NEW.completed_at IS NOT NULL OR NEW.report_digest IS NOT NULL THEN
      RAISE EXCEPTION 'queued test run cannot have completion facts';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
    OR NEW.definition_digest IS DISTINCT FROM OLD.definition_digest
    OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN
    RAISE EXCEPTION 'test run input is immutable';
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;

  IF OLD.status IN ('passed', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'terminal test run status is immutable';
  END IF;

  IF NEW.status IN ('queued', 'running') THEN
    IF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'non-terminal test run cannot have completed_at';
    END IF;
    IF NEW.report_digest IS NOT NULL THEN
      RAISE EXCEPTION 'non-terminal test run cannot have report digest';
    END IF;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'test run status update requires a status change';
  END IF;

  IF NOT (
    (OLD.status = 'queued' AND NEW.status IN ('running', 'cancelled'))
    OR (OLD.status = 'running' AND NEW.status IN ('passed', 'failed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'invalid test run status transition';
  END IF;

  IF NEW.status IN ('queued', 'running') THEN
    IF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'non-terminal test run cannot have completed_at';
    END IF;
    IF NEW.report_digest IS NOT NULL THEN
      RAISE EXCEPTION 'non-terminal test run cannot have report digest';
    END IF;
  ELSIF NEW.status IN ('passed', 'failed') THEN
    IF NEW.completed_at IS NULL OR NEW.report_digest IS NULL THEN
      RAISE EXCEPTION 'passed or failed test run requires report digest and completed_at';
    END IF;
  ELSIF NEW.status = 'cancelled' THEN
    IF NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'cancelled test run requires completed_at';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE app.modules (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  module_name text NOT NULL CHECK (module_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  module_kind app.module_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (id, module_name, module_kind),
  UNIQUE (module_name)
);

CREATE TABLE app.module_versions (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  module_id uuid NOT NULL,
  module_name text NOT NULL CHECK (module_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  module_kind app.module_kind NOT NULL,
  version text NOT NULL CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  status app.module_version_status NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[a-f0-9]{64}$'),
  signature_digest text NOT NULL CHECK (signature_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (id, module_name, version, artifact_digest),
  UNIQUE (module_name, version),
  UNIQUE (artifact_digest),
  FOREIGN KEY (module_id, module_name, module_kind)
    REFERENCES app.modules(id, module_name, module_kind)
    ON DELETE CASCADE
);

CREATE TABLE app.services (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, slug),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES app.projects(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.service_definitions (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  version text NOT NULL CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  digest text NOT NULL CHECK (digest ~ '^sha256:[a-f0-9]{64}$'),
  canonical_json jsonb NOT NULL,
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, id, digest),
  UNIQUE (workspace_id, project_id, environment, id, digest, service_id),
  UNIQUE (workspace_id, project_id, environment, service_id, version),
  UNIQUE (workspace_id, project_id, environment, digest),
  FOREIGN KEY (workspace_id, project_id, environment, service_id)
    REFERENCES app.services(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.definition_modules (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  definition_id uuid NOT NULL,
  module_version_id uuid NOT NULL,
  module_name text NOT NULL CHECK (module_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  exact_version text NOT NULL CHECK (exact_version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY (workspace_id, project_id, environment, definition_id, module_version_id),
  FOREIGN KEY (workspace_id, project_id, environment, definition_id)
    REFERENCES app.service_definitions(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (module_version_id, module_name, exact_version, artifact_digest)
    REFERENCES app.module_versions(id, module_name, version, artifact_digest)
    ON DELETE RESTRICT
);

CREATE TABLE app.candidates (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  definition_id uuid NOT NULL,
  definition_digest text NOT NULL CHECK (definition_digest ~ '^sha256:[a-f0-9]{64}$'),
  version text NOT NULL CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  status app.candidate_status NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  frozen boolean NOT NULL DEFAULT true CHECK (frozen),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, id, definition_id, definition_digest),
  UNIQUE (workspace_id, project_id, environment, id, definition_id, definition_digest, status),
  UNIQUE (workspace_id, project_id, environment, id, definition_id, definition_digest, status, version),
  UNIQUE (workspace_id, project_id, environment, definition_id),
  FOREIGN KEY (workspace_id, project_id, environment, definition_id, definition_digest)
    REFERENCES app.service_definitions(workspace_id, project_id, environment, id, digest)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.test_runs (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  definition_id uuid NOT NULL,
  definition_digest text NOT NULL CHECK (definition_digest ~ '^sha256:[a-f0-9]{64}$'),
  candidate_id uuid,
  status app.test_run_status NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  report_digest text CHECK (report_digest IS NULL OR report_digest ~ '^sha256:[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, report_digest),
  CHECK (
    (status IN ('queued', 'running') AND completed_at IS NULL AND report_digest IS NULL)
    OR (status IN ('passed', 'failed') AND completed_at IS NOT NULL AND report_digest IS NOT NULL)
    OR (status = 'cancelled' AND completed_at IS NOT NULL)
  ),
  FOREIGN KEY (workspace_id, project_id, environment, definition_id, definition_digest)
    REFERENCES app.service_definitions(workspace_id, project_id, environment, id, digest)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, candidate_id, definition_id, definition_digest)
    REFERENCES app.candidates(workspace_id, project_id, environment, id, definition_id, definition_digest)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.test_cases (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  test_run_id uuid NOT NULL,
  case_key text NOT NULL CHECK (length(case_key) BETWEEN 1 AND 120),
  status app.test_case_status NOT NULL,
  assertion_digest text NOT NULL CHECK (assertion_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, test_run_id, case_key),
  FOREIGN KEY (workspace_id, project_id, environment, test_run_id)
    REFERENCES app.test_runs(workspace_id, project_id, environment, id)
    ON DELETE CASCADE
);

CREATE TABLE app.service_versions (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  version text NOT NULL CHECK (version ~ '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'),
  definition_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  candidate_status app.candidate_status NOT NULL DEFAULT 'approved' CHECK (candidate_status = 'approved'),
  definition_digest text NOT NULL CHECK (definition_digest ~ '^sha256:[a-f0-9]{64}$'),
  artifact_digest text NOT NULL CHECK (artifact_digest ~ '^sha256:[a-f0-9]{64}$'),
  status app.service_version_status NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, id, definition_digest),
  UNIQUE (workspace_id, project_id, environment, id, service_id),
  UNIQUE (workspace_id, project_id, environment, id, service_id, definition_digest),
  UNIQUE (workspace_id, project_id, environment, service_id, version),
  UNIQUE (workspace_id, project_id, environment, definition_digest),
  FOREIGN KEY (workspace_id, project_id, environment, service_id)
    REFERENCES app.services(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, definition_id, definition_digest, service_id)
    REFERENCES app.service_definitions(workspace_id, project_id, environment, id, digest, service_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, candidate_id, definition_id, definition_digest, candidate_status, version)
    REFERENCES app.candidates(workspace_id, project_id, environment, id, definition_id, definition_digest, status, version)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.deployments (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  service_version_id uuid NOT NULL,
  definition_digest text NOT NULL CHECK (definition_digest ~ '^sha256:[a-f0-9]{64}$'),
  status app.deployment_status NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  deployed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, service_id, service_version_id),
  FOREIGN KEY (workspace_id, project_id, environment, service_id)
    REFERENCES app.services(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, service_version_id, service_id, definition_digest)
    REFERENCES app.service_versions(workspace_id, project_id, environment, id, service_id, definition_digest)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.deployment_events (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  deployment_id uuid NOT NULL,
  deployment_revision bigint NOT NULL CHECK (deployment_revision BETWEEN 1 AND 9007199254740991),
  from_status app.deployment_status,
  to_status app.deployment_status NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id uuid NOT NULL CHECK (app.is_uuid_v7(actor_id)),
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, deployment_id, deployment_revision),
  FOREIGN KEY (workspace_id, project_id, environment, deployment_id)
    REFERENCES app.deployments(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, actor_id)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.access_policies (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  policy_name text NOT NULL CHECK (policy_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, id, service_id),
  UNIQUE (workspace_id, project_id, environment, service_id, policy_name),
  FOREIGN KEY (workspace_id, project_id, environment, service_id)
    REFERENCES app.services(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.policy_versions (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  access_policy_id uuid NOT NULL,
  version_id text NOT NULL CHECK (version_id ~ '^[a-z][a-z0-9]*_[A-Za-z0-9_-]{8,128}$'),
  status app.policy_version_status NOT NULL,
  policy_digest text NOT NULL CHECK (policy_digest ~ '^sha256:[a-f0-9]{64}$'),
  document jsonb NOT NULL,
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, access_policy_id, version_id),
  UNIQUE (workspace_id, project_id, environment, policy_digest),
  FOREIGN KEY (workspace_id, project_id, environment, access_policy_id)
    REFERENCES app.access_policies(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.credentials (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  access_policy_id uuid NOT NULL,
  kind app.credential_kind NOT NULL,
  status app.credential_status NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 160),
  public_digest text NOT NULL CHECK (public_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, id, service_id),
  UNIQUE (workspace_id, project_id, environment, id, service_id, access_policy_id, subject_id),
  UNIQUE (workspace_id, project_id, environment, public_digest),
  FOREIGN KEY (workspace_id, project_id, environment, service_id)
    REFERENCES app.services(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, access_policy_id, service_id)
    REFERENCES app.access_policies(workspace_id, project_id, environment, id, service_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.credential_secrets (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  credential_id uuid NOT NULL,
  secret_hash text NOT NULL CHECK (secret_hash ~ '^sha256:[a-f0-9]{64}$'),
  secret_digest text NOT NULL CHECK (secret_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, credential_id),
  UNIQUE (workspace_id, project_id, environment, secret_digest),
  FOREIGN KEY (workspace_id, project_id, environment, credential_id)
    REFERENCES app.credentials(workspace_id, project_id, environment, id)
    ON DELETE CASCADE
);

CREATE TABLE app.credential_rotations (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  access_policy_id uuid NOT NULL,
  subject_id text NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 160),
  old_credential_id uuid NOT NULL,
  new_credential_id uuid NOT NULL,
  status app.rotation_status NOT NULL,
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  FOREIGN KEY (workspace_id, project_id, environment, old_credential_id, service_id, access_policy_id, subject_id)
    REFERENCES app.credentials(workspace_id, project_id, environment, id, service_id, access_policy_id, subject_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, new_credential_id, service_id, access_policy_id, subject_id)
    REFERENCES app.credentials(workspace_id, project_id, environment, id, service_id, access_policy_id, subject_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id),
  CHECK (old_credential_id <> new_credential_id)
);

CREATE TABLE app.request_traces (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  service_version_id uuid NOT NULL,
  credential_id uuid,
  trace_id text NOT NULL CHECK (length(trace_id) BETWEEN 8 AND 160),
  status app.request_trace_status NOT NULL,
  started_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  policy_decision_id text CHECK (policy_decision_id IS NULL OR length(policy_decision_id) BETWEEN 8 AND 160),
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, trace_id),
  FOREIGN KEY (workspace_id, project_id, environment, service_version_id, service_id)
    REFERENCES app.service_versions(workspace_id, project_id, environment, id, service_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, credential_id, service_id)
    REFERENCES app.credentials(workspace_id, project_id, environment, id, service_id)
    ON DELETE RESTRICT
);

CREATE TABLE app.usage_events (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  service_version_id uuid NOT NULL,
  credential_id uuid,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 12 AND 160),
  metric_key text NOT NULL CHECK (length(metric_key) BETWEEN 1 AND 120),
  unit app.usage_unit NOT NULL,
  quantity bigint NOT NULL CHECK (quantity >= 0),
  event_time timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, idempotency_key),
  FOREIGN KEY (workspace_id, project_id, environment, service_version_id, service_id)
    REFERENCES app.service_versions(workspace_id, project_id, environment, id, service_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, credential_id, service_id)
    REFERENCES app.credentials(workspace_id, project_id, environment, id, service_id)
    ON DELETE RESTRICT
);

CREATE TABLE app.quota_buckets (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  service_id uuid NOT NULL,
  credential_id uuid,
  bucket_key text NOT NULL CHECK (length(bucket_key) BETWEEN 1 AND 160),
  window_start timestamptz NOT NULL,
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, project_id, environment, service_id, bucket_key, window_start),
  FOREIGN KEY (workspace_id, project_id, environment, service_id)
    REFERENCES app.services(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, environment, credential_id, service_id)
    REFERENCES app.credentials(workspace_id, project_id, environment, id, service_id)
    ON DELETE RESTRICT
);

CREATE TABLE app.audit_events (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  actor_id uuid NOT NULL CHECK (app.is_uuid_v7(actor_id)),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{1,120}$'),
  resource_type text NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 80),
  resource_id uuid CHECK (resource_id IS NULL OR app.is_uuid_v7(resource_id)),
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  FOREIGN KEY (workspace_id, project_id, actor_id)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TRIGGER modules_immutable
BEFORE UPDATE OR DELETE ON app.modules
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER module_versions_protect_insert_update
BEFORE INSERT OR UPDATE ON app.module_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_module_version_update();

CREATE TRIGGER module_versions_delete_immutable
BEFORE DELETE ON app.module_versions
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER service_definitions_immutable
BEFORE UPDATE OR DELETE ON app.service_definitions
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER definition_modules_immutable
BEFORE UPDATE OR DELETE ON app.definition_modules
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER candidates_protect_insert_update
BEFORE INSERT OR UPDATE ON app.candidates
FOR EACH ROW EXECUTE FUNCTION app.protect_candidate_update();

CREATE TRIGGER candidates_delete_immutable
BEFORE DELETE ON app.candidates
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER test_runs_protect_insert_update
BEFORE INSERT OR UPDATE ON app.test_runs
FOR EACH ROW EXECUTE FUNCTION app.protect_test_run_update();

CREATE TRIGGER test_runs_delete_immutable
BEFORE DELETE ON app.test_runs
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER test_cases_immutable
BEFORE UPDATE OR DELETE ON app.test_cases
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER service_versions_protect_insert_update
BEFORE INSERT OR UPDATE ON app.service_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_service_version_update();

CREATE TRIGGER service_versions_delete_immutable
BEFORE DELETE ON app.service_versions
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER deployments_protect_insert_update
BEFORE INSERT OR UPDATE ON app.deployments
FOR EACH ROW EXECUTE FUNCTION app.protect_deployment_update();

CREATE CONSTRAINT TRIGGER deployments_require_matching_event
AFTER UPDATE ON app.deployments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.require_matching_deployment_event();

CREATE TRIGGER deployments_delete_immutable
BEFORE DELETE ON app.deployments
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER credentials_protect_insert_update
BEFORE INSERT OR UPDATE ON app.credentials
FOR EACH ROW EXECUTE FUNCTION app.protect_credential_update();

CREATE TRIGGER credentials_delete_immutable
BEFORE DELETE ON app.credentials
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER credential_secrets_immutable
BEFORE UPDATE OR DELETE ON app.credential_secrets
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER deployment_events_immutable
BEFORE UPDATE OR DELETE ON app.deployment_events
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE CONSTRAINT TRIGGER deployment_events_match_state
AFTER INSERT ON app.deployment_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.protect_deployment_event_insert();

CREATE TRIGGER policy_versions_immutable
BEFORE UPDATE OR DELETE ON app.policy_versions
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER usage_events_immutable
BEFORE UPDATE OR DELETE ON app.usage_events
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER request_traces_immutable
BEFORE UPDATE OR DELETE ON app.request_traces
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON app.audit_events
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_event_change();

CREATE TRIGGER services_touch_updated_at
BEFORE UPDATE ON app.services
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER deployments_touch_updated_at
BEFORE UPDATE ON app.deployments
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER access_policies_touch_updated_at
BEFORE UPDATE ON app.access_policies
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER quota_buckets_touch_updated_at
BEFORE UPDATE ON app.quota_buckets
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE INDEX idx_module_versions_status
  ON app.module_versions (status, module_name, version);
CREATE INDEX idx_service_definitions_digest
  ON app.service_definitions (workspace_id, project_id, environment, digest);
CREATE INDEX idx_candidates_definition_status
  ON app.candidates (workspace_id, project_id, environment, definition_id, status);
CREATE INDEX idx_test_runs_definition_status
  ON app.test_runs (workspace_id, project_id, environment, definition_id, status, started_at DESC);
CREATE INDEX idx_service_versions_status
  ON app.service_versions (workspace_id, project_id, environment, service_id, status, created_at DESC);
CREATE INDEX idx_deployments_status
  ON app.deployments (workspace_id, project_id, environment, service_id, status, updated_at DESC);
CREATE INDEX idx_policy_versions_policy_status
  ON app.policy_versions (workspace_id, project_id, environment, access_policy_id, status, created_at DESC);
CREATE INDEX idx_credentials_service_status
  ON app.credentials (workspace_id, project_id, environment, service_id, status, created_at DESC);
CREATE INDEX idx_request_traces_trace
  ON app.request_traces (workspace_id, project_id, environment, trace_id);
CREATE INDEX idx_usage_events_service_time
  ON app.usage_events (workspace_id, project_id, environment, service_version_id, event_time DESC);
CREATE INDEX idx_audit_events_resource_time
  ON app.audit_events (workspace_id, project_id, environment, resource_type, resource_id, occurred_at DESC);

ALTER TABLE app.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.modules FORCE ROW LEVEL SECURITY;
CREATE POLICY modules_platform_read ON app.modules
  FOR SELECT USING (app.current_actor_id() IS NOT NULL);

ALTER TABLE app.module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.module_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY module_versions_platform_read ON app.module_versions
  FOR SELECT USING (app.current_actor_id() IS NOT NULL);

ALTER TABLE app.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.services FORCE ROW LEVEL SECURITY;
CREATE POLICY services_tenant_isolation ON app.services
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.service_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY service_definitions_tenant_isolation ON app.service_definitions
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.definition_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.definition_modules FORCE ROW LEVEL SECURITY;
CREATE POLICY definition_modules_tenant_isolation ON app.definition_modules
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY candidates_tenant_isolation ON app.candidates
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.test_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY test_runs_tenant_isolation ON app.test_runs
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.test_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY test_cases_tenant_isolation ON app.test_cases
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.service_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY service_versions_tenant_isolation ON app.service_versions
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.deployments FORCE ROW LEVEL SECURITY;
CREATE POLICY deployments_tenant_isolation ON app.deployments
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.deployment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.deployment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY deployment_events_tenant_isolation ON app.deployment_events
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.access_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.access_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY access_policies_tenant_isolation ON app.access_policies
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.policy_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY policy_versions_tenant_isolation ON app.policy_versions
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY credentials_tenant_isolation ON app.credentials
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.credential_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.credential_secrets FORCE ROW LEVEL SECURITY;
CREATE POLICY credential_secrets_tenant_isolation ON app.credential_secrets
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.credential_rotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.credential_rotations FORCE ROW LEVEL SECURITY;
CREATE POLICY credential_rotations_tenant_isolation ON app.credential_rotations
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.request_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.request_traces FORCE ROW LEVEL SECURITY;
CREATE POLICY request_traces_tenant_isolation ON app.request_traces
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_events_tenant_isolation ON app.usage_events
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.quota_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.quota_buckets FORCE ROW LEVEL SECURITY;
CREATE POLICY quota_buckets_tenant_isolation ON app.quota_buckets
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_isolation ON app.audit_events
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

INSERT INTO app.schema_migrations (version) VALUES ('0002_release_ops');
