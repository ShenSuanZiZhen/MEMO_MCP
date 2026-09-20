ALTER TABLE app.workspace_members
  ADD COLUMN revision bigint NOT NULL DEFAULT 1
  CHECK (revision BETWEEN 1 AND 9007199254740991);

ALTER TABLE app.project_members
  ADD COLUMN revision bigint NOT NULL DEFAULT 1
  CHECK (revision BETWEEN 1 AND 9007199254740991);

CREATE TYPE app.member_role_change_scope AS ENUM ('workspace', 'project');

CREATE TABLE app.member_role_audit_events (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid,
  scope app.member_role_change_scope NOT NULL,
  actor_id uuid NOT NULL CHECK (app.is_uuid_v7(actor_id)),
  target_actor_id uuid NOT NULL CHECK (app.is_uuid_v7(target_actor_id)),
  previous_role app.member_role NOT NULL,
  next_role app.member_role NOT NULL,
  membership_revision bigint NOT NULL CHECK (membership_revision BETWEEN 1 AND 9007199254740991),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, id),
  CONSTRAINT member_role_audit_scope_shape CHECK (
    (scope = 'workspace' AND project_id IS NULL)
    OR (scope = 'project' AND project_id IS NOT NULL)
  ),
  FOREIGN KEY (workspace_id)
    REFERENCES app.workspaces(id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES app.projects(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, actor_id)
    REFERENCES app.workspace_members(workspace_id, actor_id),
  FOREIGN KEY (workspace_id, target_actor_id)
    REFERENCES app.workspace_members(workspace_id, actor_id),
  FOREIGN KEY (workspace_id, project_id, target_actor_id)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE UNIQUE INDEX ux_member_role_audit_workspace_revision
  ON app.member_role_audit_events (workspace_id, target_actor_id, membership_revision)
  WHERE scope = 'workspace';

CREATE UNIQUE INDEX ux_member_role_audit_project_revision
  ON app.member_role_audit_events (workspace_id, project_id, target_actor_id, membership_revision)
  WHERE scope = 'project';

CREATE FUNCTION app.require_workspace_member_initial_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision <> 1 THEN
    RAISE EXCEPTION 'member initial revision must be 1';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.require_project_member_initial_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.revision <> 1 THEN
    RAISE EXCEPTION 'member initial revision must be 1';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_workspace_member_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'member identity fields are immutable';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'member revision must increment by exactly 1';
    END IF;
  ELSIF NEW.revision IS DISTINCT FROM OLD.revision THEN
    RAISE EXCEPTION 'member revision cannot change without role or status change';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_project_member_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'member identity fields are immutable';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
    OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF NEW.revision <> OLD.revision + 1 THEN
      RAISE EXCEPTION 'member revision must increment by exactly 1';
    END IF;
  ELSIF NEW.revision IS DISTINCT FROM OLD.revision THEN
    RAISE EXCEPTION 'member revision cannot change without role or status change';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.validate_member_role_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $$
DECLARE
  v_writer text;
  v_current_role app.member_role;
  v_current_revision bigint;
  v_requirement_key text;
BEGIN
  v_writer := current_setting('app.member_role_audit_writer', true);
  IF v_writer IS DISTINCT FROM 'change_member_role_and_record_audit' THEN
    RAISE EXCEPTION 'member role audit must be written by controlled function';
  END IF;

  IF NEW.previous_role = NEW.next_role THEN
    RAISE EXCEPTION 'member role audit must describe a role change';
  END IF;

  IF NEW.actor_id IS DISTINCT FROM app.current_actor_id() THEN
    RAISE EXCEPTION 'member role audit actor must match current actor';
  END IF;

  IF NEW.scope = 'workspace' THEN
    SELECT role, revision
    INTO v_current_role, v_current_revision
    FROM app.workspace_members
    WHERE workspace_id = NEW.workspace_id
      AND actor_id = NEW.target_actor_id;
  ELSE
    SELECT role, revision
    INTO v_current_role, v_current_revision
    FROM app.project_members
    WHERE workspace_id = NEW.workspace_id
      AND project_id = NEW.project_id
      AND actor_id = NEW.target_actor_id;
  END IF;

  IF v_current_role IS DISTINCT FROM NEW.next_role
    OR v_current_revision IS DISTINCT FROM NEW.membership_revision
  THEN
    RAISE EXCEPTION 'member role audit does not match current membership';
  END IF;

  v_requirement_key := app.member_role_change_requirement_key(
    NEW.scope::text,
    NEW.workspace_id,
    NEW.project_id,
    NEW.target_actor_id,
    NEW.previous_role::text,
    NEW.next_role::text,
    NEW.membership_revision
  );

  IF current_setting(v_requirement_key, true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'member role audit does not correspond to a role change in this transaction';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.member_role_change_requirement_key(
  p_scope text,
  p_workspace_id uuid,
  p_project_id uuid,
  p_target_actor_id uuid,
  p_previous_role text,
  p_next_role text,
  p_membership_revision bigint
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'app.member_role_change.k'
    || md5(
      p_scope
      || '|'
      || p_workspace_id::text
      || '|'
      || coalesce(p_project_id::text, '')
      || '|'
      || p_target_actor_id::text
      || '|'
      || p_previous_role
      || '|'
      || p_next_role
      || '|'
      || p_membership_revision::text
    )
$$;

CREATE FUNCTION app.record_workspace_member_role_change_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $$
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  PERFORM set_config(
    app.member_role_change_requirement_key(
    'workspace',
    NEW.workspace_id,
    NULL,
    NEW.actor_id,
    OLD.role::text,
    NEW.role::text,
    NEW.revision
    ),
    '1',
    true
  );

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.record_project_member_role_change_requirement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = app, pg_temp
AS $$
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  PERFORM set_config(
    app.member_role_change_requirement_key(
    'project',
    NEW.workspace_id,
    NEW.project_id,
    NEW.actor_id,
    OLD.role::text,
    NEW.role::text,
    NEW.revision
    ),
    '1',
    true
  );

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.require_workspace_member_role_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_audit_count bigint;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO v_audit_count
  FROM app.member_role_audit_events audit
  WHERE audit.scope = 'workspace'
    AND audit.workspace_id = NEW.workspace_id
    AND audit.project_id IS NULL
    AND audit.target_actor_id = NEW.actor_id
    AND audit.previous_role = OLD.role
    AND audit.next_role = NEW.role
    AND audit.membership_revision = NEW.revision;

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'workspace member role change requires exactly one matching audit event';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.require_project_member_role_audit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_audit_count bigint;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO v_audit_count
  FROM app.member_role_audit_events audit
  WHERE audit.scope = 'project'
    AND audit.workspace_id = NEW.workspace_id
    AND audit.project_id = NEW.project_id
    AND audit.target_actor_id = NEW.actor_id
    AND audit.previous_role = OLD.role
    AND audit.next_role = NEW.role
    AND audit.membership_revision = NEW.revision;

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'project member role change requires exactly one matching audit event';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_members_require_initial_revision
BEFORE INSERT ON app.workspace_members
FOR EACH ROW EXECUTE FUNCTION app.require_workspace_member_initial_revision();

CREATE TRIGGER project_members_require_initial_revision
BEFORE INSERT ON app.project_members
FOR EACH ROW EXECUTE FUNCTION app.require_project_member_initial_revision();

CREATE TRIGGER workspace_members_require_revision_increment
BEFORE UPDATE ON app.workspace_members
FOR EACH ROW EXECUTE FUNCTION app.protect_workspace_member_update();

CREATE TRIGGER project_members_require_revision_increment
BEFORE UPDATE ON app.project_members
FOR EACH ROW EXECUTE FUNCTION app.protect_project_member_update();

CREATE TRIGGER workspace_members_record_role_change_requirement
AFTER UPDATE OF role ON app.workspace_members
FOR EACH ROW EXECUTE FUNCTION app.record_workspace_member_role_change_requirement();

CREATE TRIGGER project_members_record_role_change_requirement
AFTER UPDATE OF role ON app.project_members
FOR EACH ROW EXECUTE FUNCTION app.record_project_member_role_change_requirement();

CREATE TRIGGER member_role_audit_events_append_only
BEFORE UPDATE OR DELETE ON app.member_role_audit_events
FOR EACH ROW EXECUTE FUNCTION app.reject_audit_event_change();

CREATE CONSTRAINT TRIGGER workspace_member_role_change_requires_audit
AFTER UPDATE OF role ON app.workspace_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.require_workspace_member_role_audit();

CREATE CONSTRAINT TRIGGER project_member_role_change_requires_audit
AFTER UPDATE OF role ON app.project_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.require_project_member_role_audit();

CREATE CONSTRAINT TRIGGER member_role_audit_insert_matches_membership
AFTER INSERT ON app.member_role_audit_events
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION app.validate_member_role_audit_insert();

CREATE FUNCTION app.change_member_role_and_record_audit(
  p_scope app.member_role_change_scope,
  p_workspace_id uuid,
  p_project_id uuid,
  p_actor_id uuid,
  p_target_actor_id uuid,
  p_next_role app.member_role,
  p_manage_existing_owner boolean,
  p_occurred_at timestamptz,
  p_audit_id uuid
)
RETURNS TABLE (
  kind text,
  previous_role app.member_role,
  next_role app.member_role,
  revision bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_previous_role app.member_role;
  v_previous_revision bigint;
  v_next_revision bigint;
  v_owner_count bigint;
  v_caller_workspace_role app.member_role;
  v_caller_project_role app.member_role;
BEGIN
  IF app.current_workspace_id() IS DISTINCT FROM p_workspace_id
    OR app.current_actor_id() IS DISTINCT FROM p_actor_id
  THEN
    RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
    RETURN;
  END IF;

  IF p_scope = 'workspace' THEN
    IF p_project_id IS NOT NULL THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    PERFORM 1
    FROM app.workspaces
    WHERE id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    SELECT workspace_member.role
    INTO v_caller_workspace_role
    FROM app.workspace_members workspace_member
    WHERE workspace_member.workspace_id = p_workspace_id
      AND workspace_member.actor_id = p_actor_id
      AND workspace_member.status = 'active'
    FOR UPDATE;

    IF v_caller_workspace_role IS NULL
      OR v_caller_workspace_role NOT IN ('owner'::app.member_role, 'admin'::app.member_role)
    THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    SELECT workspace_member.role, workspace_member.revision
    INTO v_previous_role, v_previous_revision
    FROM app.workspace_members workspace_member
    WHERE workspace_member.workspace_id = p_workspace_id
      AND workspace_member.actor_id = p_target_actor_id
      AND workspace_member.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    IF (v_previous_role = 'owner'::app.member_role OR p_next_role = 'owner'::app.member_role)
      AND (p_manage_existing_owner IS NOT TRUE OR v_caller_workspace_role <> 'owner'::app.member_role)
    THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    IF v_previous_role = 'owner'::app.member_role
      AND p_next_role <> 'owner'::app.member_role
    THEN
      SELECT count(*)
      INTO v_owner_count
      FROM app.workspace_members
      WHERE workspace_id = p_workspace_id
        AND role = 'owner'::app.member_role
        AND status = 'active';

      IF v_owner_count <= 1 THEN
        RETURN QUERY SELECT 'last_owner_conflict'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
        RETURN;
      END IF;
    END IF;

    UPDATE app.workspace_members AS workspace_member
    SET role = p_next_role,
      revision = v_previous_revision + 1
    WHERE workspace_member.workspace_id = p_workspace_id
      AND workspace_member.actor_id = p_target_actor_id
      AND workspace_member.revision = v_previous_revision
    RETURNING workspace_member.revision INTO v_next_revision;
  ELSE
    IF p_project_id IS NULL THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    PERFORM 1
    FROM app.projects
    WHERE workspace_id = p_workspace_id
      AND id = p_project_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    SELECT workspace_member.role
    INTO v_caller_workspace_role
    FROM app.workspace_members workspace_member
    WHERE workspace_member.workspace_id = p_workspace_id
      AND workspace_member.actor_id = p_actor_id
      AND workspace_member.status = 'active'
    FOR UPDATE;

    SELECT project_member.role
    INTO v_caller_project_role
    FROM app.project_members project_member
    WHERE project_member.workspace_id = p_workspace_id
      AND project_member.project_id = p_project_id
      AND project_member.actor_id = p_actor_id
      AND project_member.status = 'active'
    FOR UPDATE;

    IF v_caller_workspace_role IS NULL
      OR v_caller_project_role IS NULL
      OR v_caller_workspace_role NOT IN ('owner'::app.member_role, 'admin'::app.member_role)
      OR v_caller_project_role NOT IN ('owner'::app.member_role, 'admin'::app.member_role)
    THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    SELECT project_member.role, project_member.revision
    INTO v_previous_role, v_previous_revision
    FROM app.project_members project_member
    WHERE project_member.workspace_id = p_workspace_id
      AND project_member.project_id = p_project_id
      AND project_member.actor_id = p_target_actor_id
      AND project_member.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    IF (v_previous_role = 'owner'::app.member_role OR p_next_role = 'owner'::app.member_role)
      AND (
        p_manage_existing_owner IS NOT TRUE
        OR v_caller_workspace_role <> 'owner'::app.member_role
        OR v_caller_project_role <> 'owner'::app.member_role
      )
    THEN
      RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
      RETURN;
    END IF;

    IF v_previous_role = 'owner'::app.member_role
      AND p_next_role <> 'owner'::app.member_role
    THEN
      SELECT count(*)
      INTO v_owner_count
      FROM app.project_members
      WHERE workspace_id = p_workspace_id
        AND project_id = p_project_id
        AND role = 'owner'::app.member_role
        AND status = 'active';

      IF v_owner_count <= 1 THEN
        RETURN QUERY SELECT 'last_owner_conflict'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
        RETURN;
      END IF;
    END IF;

    UPDATE app.project_members AS project_member
    SET role = p_next_role,
      revision = v_previous_revision + 1
    WHERE project_member.workspace_id = p_workspace_id
      AND project_member.project_id = p_project_id
      AND project_member.actor_id = p_target_actor_id
      AND project_member.revision = v_previous_revision
    RETURNING project_member.revision INTO v_next_revision;
  END IF;

  IF v_next_revision IS NULL THEN
    RETURN QUERY SELECT 'not_found_or_forbidden'::text, NULL::app.member_role, NULL::app.member_role, NULL::bigint;
    RETURN;
  END IF;

  PERFORM set_config('app.member_role_audit_writer', 'change_member_role_and_record_audit', true);

  INSERT INTO app.member_role_audit_events (
    id,
    workspace_id,
    project_id,
    scope,
    actor_id,
    target_actor_id,
    previous_role,
    next_role,
    membership_revision,
    occurred_at
  )
  VALUES (
    p_audit_id,
    p_workspace_id,
    p_project_id,
    p_scope,
    p_actor_id,
    p_target_actor_id,
    v_previous_role,
    p_next_role,
    v_next_revision,
    p_occurred_at
  );

  RETURN QUERY SELECT 'changed'::text, v_previous_role, p_next_role, v_next_revision;
END;
$$;

REVOKE ALL ON FUNCTION app.change_member_role_and_record_audit(
  app.member_role_change_scope,
  uuid,
  uuid,
  uuid,
  uuid,
  app.member_role,
  boolean,
  timestamptz,
  uuid
) FROM PUBLIC;

CREATE INDEX idx_workspace_members_workspace_revision
  ON app.workspace_members (workspace_id, actor_id, revision);
CREATE INDEX idx_project_members_project_revision
  ON app.project_members (workspace_id, project_id, actor_id, revision);
CREATE INDEX idx_member_role_audit_workspace_time
  ON app.member_role_audit_events (workspace_id, occurred_at DESC);
CREATE INDEX idx_member_role_audit_project_time
  ON app.member_role_audit_events (workspace_id, project_id, occurred_at DESC)
  WHERE scope = 'project';

ALTER TABLE app.member_role_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.member_role_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY member_role_audit_events_tenant_isolation ON app.member_role_audit_events
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND actor_id = app.current_actor_id());

INSERT INTO app.schema_migrations (version) VALUES ('0007_member_role_repository');
