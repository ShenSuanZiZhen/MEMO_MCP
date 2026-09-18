CREATE SCHEMA app;

CREATE TYPE app.environment AS ENUM ('development', 'test', 'production');
CREATE TYPE app.workspace_kind AS ENUM ('personal', 'team');
CREATE TYPE app.workspace_status AS ENUM ('active', 'archived');
CREATE TYPE app.project_status AS ENUM ('active', 'archived');
CREATE TYPE app.member_role AS ENUM ('owner', 'admin', 'developer', 'viewer');
CREATE TYPE app.member_status AS ENUM ('active', 'invited', 'removed');
CREATE TYPE app.data_source_kind AS ENUM (
  'file_upload',
  'http_api',
  'object_storage',
  'readonly_database'
);
CREATE TYPE app.data_source_state AS ENUM ('active', 'archived');
CREATE TYPE app.sensitivity AS ENUM ('public', 'internal', 'confidential');
CREATE TYPE app.version_strategy AS ENUM (
  'fixed',
  'manual_confirm_before_publish',
  'controlled_follow'
);
CREATE TYPE app.data_version_status AS ENUM (
  'created',
  'uploading',
  'uploaded',
  'processing',
  'completed',
  'partial',
  'failed',
  'cancelled',
  'expired'
);
CREATE TYPE app.processing_stage AS ENUM (
  'upload',
  'security_scan',
  'format_detect',
  'parse',
  'normalize',
  'chunk',
  'index',
  'completed'
);
CREATE TYPE app.draft_state AS ENUM (
  'editing',
  'validating',
  'ready',
  'building',
  'built',
  'submitted'
);
CREATE TYPE app.wizard_step AS ENUM (
  'goal',
  'data',
  'modules',
  'configuration',
  'preview',
  'test',
  'publish'
);
CREATE TYPE app.draft_creation_mode AS ENUM ('blank', 'template', 'copy_version');

CREATE TABLE app.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE FUNCTION app.current_workspace_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

CREATE FUNCTION app.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid
$$;

CREATE FUNCTION app.is_uuid_v7(value uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT substring(value::text from 15 for 1) = '7'
    AND lower(substring(value::text from 20 for 1)) IN ('8', '9', 'a', 'b')
$$;

CREATE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.require_revision_increment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'revision must increment by exactly 1';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_draft_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'submitted' THEN
    RAISE EXCEPTION 'submitted draft is immutable';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.creation_mode IS DISTINCT FROM OLD.creation_mode
    OR NEW.template_id IS DISTINCT FROM OLD.template_id
    OR NEW.source_version_id IS DISTINCT FROM OLD.source_version_id
  THEN
    RAISE EXCEPTION 'draft identity and creation source fields are immutable';
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state
    AND NOT (
      (OLD.state = 'editing' AND NEW.state = 'validating')
      OR (OLD.state = 'validating' AND NEW.state = 'ready')
      OR (OLD.state = 'ready' AND NEW.state = 'building')
      OR (OLD.state = 'building' AND NEW.state = 'built')
      OR (OLD.state = 'built' AND NEW.state = 'submitted')
    )
  THEN
    RAISE EXCEPTION 'invalid draft state transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_data_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'data version updated_at is trigger maintained';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.data_source_id IS DISTINCT FROM OLD.data_source_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'data version identity and provenance fields are immutable';
  END IF;

  IF OLD.status IN ('completed', 'partial', 'failed', 'cancelled', 'expired')
    AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.processing_stage IS DISTINCT FROM OLD.processing_stage
      OR NEW.revision IS DISTINCT FROM OLD.revision
      OR NEW.content_digest IS DISTINCT FROM OLD.content_digest
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    )
  THEN
    RAISE EXCEPTION 'terminal data version is immutable';
  END IF;

  IF OLD.content_digest IS NOT NULL
    AND NEW.content_digest IS DISTINCT FROM OLD.content_digest
  THEN
    RAISE EXCEPTION 'data version content_digest is immutable once set';
  END IF;

  IF OLD.completed_at IS NOT NULL
    AND NEW.completed_at IS DISTINCT FROM OLD.completed_at
  THEN
    RAISE EXCEPTION 'data version completed_at is immutable once set';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IN ('completed', 'partial', 'failed', 'cancelled', 'expired') THEN
      RAISE EXCEPTION 'terminal data version status cannot transition';
    END IF;

    IF NOT (
      (OLD.status = 'created' AND NEW.status IN ('uploading', 'cancelled', 'expired'))
      OR (OLD.status = 'uploading' AND NEW.status IN ('uploaded', 'failed', 'cancelled', 'expired'))
      OR (OLD.status = 'uploaded' AND NEW.status IN ('processing', 'failed', 'cancelled', 'expired'))
      OR (OLD.status = 'processing' AND NEW.status IN ('completed', 'partial', 'failed'))
    ) THEN
      RAISE EXCEPTION 'invalid data version status transition';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_draft_revision_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_draft record;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'draft revisions are append-only';
  END IF;

  SELECT *
  INTO current_draft
  FROM app.drafts
  WHERE workspace_id = NEW.workspace_id
    AND project_id = NEW.project_id
    AND environment = NEW.environment
    AND id = NEW.draft_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft revision must reference an existing draft';
  END IF;

  IF NEW.revision <> current_draft.revision THEN
    RAISE EXCEPTION 'draft revision must equal current draft revision';
  END IF;

  IF NEW.document IS DISTINCT FROM current_draft.document THEN
    RAISE EXCEPTION 'draft revision document must match draft document';
  END IF;

  IF NEW.changed_by IS DISTINCT FROM current_draft.updated_by THEN
    RAISE EXCEPTION 'draft revision changed_by must match draft updated_by';
  END IF;

  IF NEW.revision > 1 AND NOT EXISTS (
    SELECT 1
    FROM app.draft_revisions previous
    WHERE previous.workspace_id = NEW.workspace_id
      AND previous.project_id = NEW.project_id
      AND previous.environment = NEW.environment
      AND previous.draft_id = NEW.draft_id
      AND previous.revision = NEW.revision - 1
  ) THEN
    RAISE EXCEPTION 'draft revision cannot skip a revision';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.require_matching_draft_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app.draft_revisions current_revision
    WHERE current_revision.workspace_id = NEW.workspace_id
      AND current_revision.project_id = NEW.project_id
      AND current_revision.environment = NEW.environment
      AND current_revision.draft_id = NEW.id
      AND current_revision.revision = NEW.revision
      AND current_revision.document = NEW.document
      AND current_revision.changed_by = NEW.updated_by
  ) THEN
    RAISE EXCEPTION 'draft must have matching draft revision before commit';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE app.workspaces (
  id uuid PRIMARY KEY CHECK (app.is_uuid_v7(id)),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  kind app.workspace_kind NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  region text NOT NULL CHECK (length(region) BETWEEN 1 AND 64),
  status app.workspace_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (slug)
);

CREATE TABLE app.workspace_members (
  workspace_id uuid NOT NULL,
  actor_id uuid NOT NULL CHECK (app.is_uuid_v7(actor_id)),
  role app.member_role NOT NULL,
  status app.member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, actor_id),
  FOREIGN KEY (workspace_id) REFERENCES app.workspaces(id) ON DELETE CASCADE
);

CREATE TABLE app.projects (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  default_region text NOT NULL CHECK (length(default_region) BETWEEN 2 AND 32),
  default_environment app.environment NOT NULL,
  status app.project_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, slug),
  FOREIGN KEY (workspace_id) REFERENCES app.workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, created_by)
    REFERENCES app.workspace_members(workspace_id, actor_id)
);

CREATE TABLE app.project_members (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  actor_id uuid NOT NULL CHECK (app.is_uuid_v7(actor_id)),
  role app.member_role NOT NULL,
  status app.member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, project_id, actor_id),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES app.projects(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, actor_id)
    REFERENCES app.workspace_members(workspace_id, actor_id)
    ON DELETE CASCADE
);

CREATE TABLE app.data_sources (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  kind app.data_source_kind NOT NULL,
  sensitivity app.sensitivity NOT NULL,
  rights text NOT NULL CHECK (length(rights) BETWEEN 1 AND 120),
  version_strategy app.version_strategy NOT NULL,
  state app.data_source_state NOT NULL DEFAULT 'active',
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
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

CREATE TABLE app.data_versions (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  data_source_id uuid NOT NULL,
  status app.data_version_status NOT NULL,
  processing_stage app.processing_stage NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  content_digest text CHECK (content_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  CHECK (
    (status IN ('created', 'uploading', 'uploaded')
      AND processing_stage = 'upload'
      AND completed_at IS NULL)
    OR (status = 'processing'
      AND processing_stage <> 'completed'
      AND completed_at IS NULL)
    OR (status IN ('completed', 'partial')
      AND processing_stage = 'completed'
      AND content_digest IS NOT NULL
      AND completed_at IS NOT NULL)
    OR (status IN ('failed', 'cancelled', 'expired')
      AND processing_stage <> 'completed'
      AND completed_at IS NULL)
  ),
  FOREIGN KEY (workspace_id, project_id, environment, data_source_id)
    REFERENCES app.data_sources(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.drafts (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  state app.draft_state NOT NULL,
  current_step app.wizard_step NOT NULL,
  creation_mode app.draft_creation_mode NOT NULL,
  template_id text CHECK (template_id ~ '^tpl_[a-z0-9_]+_v[0-9]+$'),
  source_version_id uuid CHECK (source_version_id IS NULL OR app.is_uuid_v7(source_version_id)),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  updated_by uuid NOT NULL CHECK (app.is_uuid_v7(updated_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  CHECK (
    (creation_mode = 'blank' AND template_id IS NULL AND source_version_id IS NULL)
    OR (creation_mode = 'template' AND template_id IS NOT NULL AND source_version_id IS NULL)
    OR (creation_mode = 'copy_version' AND template_id IS NULL AND source_version_id IS NOT NULL)
  ),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES app.projects(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id),
  FOREIGN KEY (workspace_id, project_id, updated_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.draft_revisions (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  draft_id uuid NOT NULL,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  document jsonb NOT NULL,
  changed_by uuid NOT NULL CHECK (app.is_uuid_v7(changed_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, project_id, environment, draft_id, revision),
  FOREIGN KEY (workspace_id, project_id, environment, draft_id)
    REFERENCES app.drafts(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, changed_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TRIGGER workspaces_touch_updated_at
BEFORE UPDATE ON app.workspaces
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER workspaces_require_revision_increment
BEFORE UPDATE ON app.workspaces
FOR EACH ROW EXECUTE FUNCTION app.require_revision_increment();

CREATE TRIGGER workspace_members_touch_updated_at
BEFORE UPDATE ON app.workspace_members
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER projects_touch_updated_at
BEFORE UPDATE ON app.projects
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER projects_require_revision_increment
BEFORE UPDATE ON app.projects
FOR EACH ROW EXECUTE FUNCTION app.require_revision_increment();

CREATE TRIGGER project_members_touch_updated_at
BEFORE UPDATE ON app.project_members
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER data_sources_require_revision_increment
BEFORE UPDATE ON app.data_sources
FOR EACH ROW EXECUTE FUNCTION app.require_revision_increment();

CREATE TRIGGER data_sources_touch_updated_at
BEFORE UPDATE ON app.data_sources
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER data_versions_protect_update
BEFORE UPDATE ON app.data_versions
FOR EACH ROW EXECUTE FUNCTION app.protect_data_version_update();

CREATE TRIGGER data_versions_require_revision_increment
BEFORE UPDATE ON app.data_versions
FOR EACH ROW EXECUTE FUNCTION app.require_revision_increment();

CREATE TRIGGER data_versions_touch_updated_at
BEFORE UPDATE ON app.data_versions
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER drafts_protect_update
BEFORE UPDATE ON app.drafts
FOR EACH ROW EXECUTE FUNCTION app.protect_draft_update();

CREATE TRIGGER drafts_require_revision_increment
BEFORE UPDATE ON app.drafts
FOR EACH ROW EXECUTE FUNCTION app.require_revision_increment();

CREATE TRIGGER drafts_touch_updated_at
BEFORE UPDATE ON app.drafts
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE CONSTRAINT TRIGGER drafts_require_matching_revision
AFTER INSERT OR UPDATE ON app.drafts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.require_matching_draft_revision();

CREATE TRIGGER draft_revisions_append_only
BEFORE INSERT OR UPDATE OR DELETE ON app.draft_revisions
FOR EACH ROW EXECUTE FUNCTION app.protect_draft_revision_row();

CREATE INDEX idx_workspace_members_workspace_role
  ON app.workspace_members (workspace_id, role, status);
CREATE INDEX idx_projects_workspace_status
  ON app.projects (workspace_id, status, updated_at DESC);
CREATE INDEX idx_project_members_project_actor
  ON app.project_members (workspace_id, project_id, actor_id, status);
CREATE INDEX idx_data_sources_owner_state
  ON app.data_sources (workspace_id, project_id, environment, state, updated_at DESC);
CREATE INDEX idx_data_sources_owner_slug
  ON app.data_sources (workspace_id, project_id, environment, slug);
CREATE INDEX idx_data_versions_owner_status
  ON app.data_versions (workspace_id, project_id, environment, status, updated_at DESC);
CREATE INDEX idx_data_versions_source_status
  ON app.data_versions (data_source_id, status, workspace_id, project_id, environment);
CREATE INDEX idx_drafts_owner_state
  ON app.drafts (workspace_id, project_id, environment, state, updated_at DESC);
CREATE INDEX idx_draft_revisions_scope_revision
  ON app.draft_revisions (workspace_id, project_id, environment, draft_id, revision DESC);

ALTER TABLE app.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_tenant_isolation ON app.workspaces
  USING (id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_members_tenant_isolation ON app.workspace_members
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY projects_tenant_isolation ON app.projects
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.project_members FORCE ROW LEVEL SECURITY;
CREATE POLICY project_members_tenant_isolation ON app.project_members
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.data_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY data_sources_tenant_isolation ON app.data_sources
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.data_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.data_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY data_versions_tenant_isolation ON app.data_versions
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY drafts_tenant_isolation ON app.drafts
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.draft_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.draft_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY draft_revisions_tenant_isolation ON app.draft_revisions
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

INSERT INTO app.schema_migrations (version) VALUES ('0001_tenant_core');
