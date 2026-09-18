CREATE TYPE app.idempotency_record_status AS ENUM (
  'started',
  'completed'
);

CREATE TABLE app.idempotency_records (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  operation text NOT NULL CHECK (operation ~ '^[a-z][a-z0-9_.]{1,120}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 12 AND 200),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256:[a-f0-9]{64}$'),
  status app.idempotency_record_status NOT NULL DEFAULT 'started',
  response_digest text CHECK (response_digest IS NULL OR response_digest ~ '^sha256:[a-f0-9]{64}$'),
  resource_type text CHECK (resource_type IS NULL OR length(resource_type) BETWEEN 1 AND 80),
  resource_id uuid CHECK (resource_id IS NULL OR app.is_uuid_v7(resource_id)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  PRIMARY KEY (workspace_id, project_id, environment, operation, idempotency_key),
  CONSTRAINT idempotency_resource_pair_check CHECK (
    (resource_type IS NULL AND resource_id IS NULL)
    OR (resource_type IS NOT NULL AND resource_id IS NOT NULL)
  ),
  CONSTRAINT idempotency_completion_shape_check CHECK (
    (
      status = 'started'
      AND response_digest IS NULL
      AND resource_type IS NULL
      AND resource_id IS NULL
      AND completed_at IS NULL
    )
    OR (status = 'completed' AND completed_at IS NOT NULL AND response_digest IS NOT NULL)
  ),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES app.projects(workspace_id, id)
    ON DELETE CASCADE
);

CREATE TABLE app.outbox_events (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  aggregate_type text NOT NULL CHECK (length(aggregate_type) BETWEEN 1 AND 80),
  aggregate_id uuid NOT NULL CHECK (app.is_uuid_v7(aggregate_id)),
  aggregate_revision bigint NOT NULL CHECK (aggregate_revision BETWEEN 1 AND 9007199254740991),
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{1,120}$'),
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version >= 1),
  logical_event_key text NOT NULL CHECK (length(logical_event_key) BETWEEN 1 AND 300),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  idempotency_key text CHECK (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 12 AND 200),
  request_digest text CHECK (request_digest IS NULL OR request_digest ~ '^sha256:[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  publish_attempts integer NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
  last_attempt_at timestamptz,
  claim_token uuid,
  claimed_by text CHECK (claimed_by IS NULL OR length(claimed_by) BETWEEN 1 AND 120),
  claim_expires_at timestamptz,
  published_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, logical_event_key),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES app.projects(workspace_id, id)
    ON DELETE CASCADE,
  CONSTRAINT outbox_idempotency_pair_check CHECK (
    (idempotency_key IS NULL AND request_digest IS NULL)
    OR (idempotency_key IS NOT NULL AND request_digest IS NOT NULL)
  ),
  CONSTRAINT outbox_claim_pair_check CHECK (
    (claim_token IS NULL AND claimed_by IS NULL AND claim_expires_at IS NULL)
    OR (claim_token IS NOT NULL AND claimed_by IS NOT NULL AND claim_expires_at IS NOT NULL)
  ),
  CONSTRAINT outbox_attempt_time_check CHECK (
    (publish_attempts = 0 AND last_attempt_at IS NULL)
    OR (publish_attempts > 0 AND last_attempt_at IS NOT NULL)
  ),
  CONSTRAINT outbox_logical_event_key_check CHECK (
    logical_event_key = (
      aggregate_type || ':' || aggregate_id::text || ':' ||
      aggregate_revision::text || ':' || event_type
    )
  )
);

CREATE TABLE app.outbox_consumptions (
  consumer_name text NOT NULL CHECK (consumer_name ~ '^[a-z][a-z0-9_.-]{1,120}$'),
  event_id uuid NOT NULL CHECK (app.is_uuid_v7(event_id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (consumer_name, event_id),
  FOREIGN KEY (workspace_id, project_id, environment, event_id)
    REFERENCES app.outbox_events(workspace_id, project_id, environment, id)
    ON DELETE CASCADE
);

CREATE FUNCTION app.protect_idempotency_record_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'started'
      OR NEW.response_digest IS NOT NULL
      OR NEW.resource_type IS NOT NULL
      OR NEW.resource_id IS NOT NULL
      OR NEW.completed_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'idempotency records must start as started';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'idempotency records are append-only';
  END IF;

  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.operation IS DISTINCT FROM OLD.operation
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_digest IS DISTINCT FROM OLD.request_digest
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'idempotency identity is immutable';
  END IF;

  IF OLD.status = 'completed' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.response_digest IS DISTINCT FROM OLD.response_digest
      OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
      OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    THEN
      RAISE EXCEPTION 'completed idempotency record is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'started' AND NEW.status = 'started' THEN
    IF NEW.response_digest IS DISTINCT FROM OLD.response_digest
      OR NEW.resource_type IS DISTINCT FROM OLD.resource_type
      OR NEW.resource_id IS DISTINCT FROM OLD.resource_id
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    THEN
      RAISE EXCEPTION 'started idempotency completion fields are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'started' AND NEW.status = 'completed' THEN
    IF NEW.response_digest IS NULL
      OR NEW.completed_at IS NULL
      OR (
        (NEW.resource_type IS NULL AND NEW.resource_id IS NOT NULL)
        OR (NEW.resource_type IS NOT NULL AND NEW.resource_id IS NULL)
      )
    THEN
      RAISE EXCEPTION 'invalid idempotency completion';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid idempotency status transition';
END;
$$;

CREATE FUNCTION app.protect_outbox_event_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.logical_event_key <> (
      NEW.aggregate_type || ':' || NEW.aggregate_id::text || ':' ||
      NEW.aggregate_revision::text || ':' || NEW.event_type
    ) THEN
      RAISE EXCEPTION 'outbox logical event key must match aggregate identity';
    END IF;
    IF NEW.publish_attempts <> 0
      OR NEW.last_attempt_at IS NOT NULL
      OR NEW.claim_token IS NOT NULL
      OR NEW.claimed_by IS NOT NULL
      OR NEW.claim_expires_at IS NOT NULL
      OR NEW.published_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'outbox events must start unclaimed and unpublished';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outbox events are append-only';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
    OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
    OR NEW.aggregate_revision IS DISTINCT FROM OLD.aggregate_revision
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.event_version IS DISTINCT FROM OLD.event_version
    OR NEW.logical_event_key IS DISTINCT FROM OLD.logical_event_key
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.request_digest IS DISTINCT FROM OLD.request_digest
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at
  THEN
    RAISE EXCEPTION 'outbox event content is immutable';
  END IF;

  IF OLD.published_at IS NOT NULL THEN
    IF NEW.published_at IS DISTINCT FROM OLD.published_at
      OR NEW.publish_attempts IS DISTINCT FROM OLD.publish_attempts
      OR NEW.last_attempt_at IS DISTINCT FROM OLD.last_attempt_at
      OR NEW.claim_token IS DISTINCT FROM OLD.claim_token
      OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by
      OR NEW.claim_expires_at IS DISTINCT FROM OLD.claim_expires_at
      OR NEW.available_at IS DISTINCT FROM OLD.available_at
    THEN
      RAISE EXCEPTION 'published outbox event is immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.publish_attempts NOT IN (OLD.publish_attempts, OLD.publish_attempts + 1) THEN
    RAISE EXCEPTION 'invalid outbox publish attempt transition';
  END IF;

  IF NEW.published_at IS NOT NULL THEN
    IF OLD.claim_token IS NULL OR NEW.claim_token IS DISTINCT FROM OLD.claim_token THEN
      RAISE EXCEPTION 'outbox publish requires a current claim';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.ensure_idempotency_key(
  p_workspace_id uuid,
  p_project_id uuid,
  p_environment app.environment,
  p_operation text,
  p_idempotency_key text,
  p_request_digest text
)
RETURNS TABLE (
  kind text,
  response_digest text,
  resource_type text,
  resource_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
  inserted boolean := false;
  current_record app.idempotency_records%ROWTYPE;
BEGIN
  INSERT INTO app.idempotency_records (
    workspace_id,
    project_id,
    environment,
    operation,
    idempotency_key,
    request_digest
  )
  VALUES (
    p_workspace_id,
    p_project_id,
    p_environment,
    p_operation,
    p_idempotency_key,
    p_request_digest
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;

  SELECT *
    INTO current_record
  FROM app.idempotency_records record
  WHERE record.workspace_id = p_workspace_id
    AND record.project_id = p_project_id
    AND record.environment = p_environment
    AND record.operation = p_operation
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF current_record.request_digest IS NULL THEN
    RAISE EXCEPTION 'idempotency key is not visible in current scope';
  END IF;

  IF current_record.request_digest <> p_request_digest THEN
    RAISE EXCEPTION 'idempotency key reused with different request digest';
  END IF;

  IF inserted OR current_record.status = 'started' THEN
    RETURN QUERY SELECT 'acquired'::text, NULL::text, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'completed'::text,
    current_record.response_digest,
    current_record.resource_type,
    current_record.resource_id;
END;
$$;

CREATE FUNCTION app.complete_idempotency_key(
  p_workspace_id uuid,
  p_project_id uuid,
  p_environment app.environment,
  p_operation text,
  p_idempotency_key text,
  p_request_digest text,
  p_response_digest text,
  p_resource_type text,
  p_resource_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_record app.idempotency_records%ROWTYPE;
BEGIN
  SELECT *
    INTO current_record
  FROM app.idempotency_records record
  WHERE record.workspace_id = p_workspace_id
    AND record.project_id = p_project_id
    AND record.environment = p_environment
    AND record.operation = p_operation
    AND record.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF current_record.request_digest IS NULL THEN
    RAISE EXCEPTION 'idempotency record not found for completion';
  END IF;

  IF current_record.request_digest <> p_request_digest THEN
    RAISE EXCEPTION 'idempotency key reused with different request digest';
  END IF;

  IF current_record.status = 'completed' THEN
    IF current_record.response_digest = p_response_digest
      AND current_record.resource_type IS NOT DISTINCT FROM p_resource_type
      AND current_record.resource_id IS NOT DISTINCT FROM p_resource_id
    THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'completed idempotency record result mismatch';
  END IF;

  UPDATE app.idempotency_records
  SET status = 'completed',
      response_digest = p_response_digest,
      resource_type = p_resource_type,
      resource_id = p_resource_id,
      completed_at = CURRENT_TIMESTAMP
  WHERE workspace_id = p_workspace_id
    AND project_id = p_project_id
    AND environment = p_environment
    AND operation = p_operation
    AND idempotency_key = p_idempotency_key
    AND request_digest = p_request_digest
    AND status = 'started';
END;
$$;

CREATE FUNCTION app.claim_outbox_events(
  p_project_id uuid,
  p_environment app.environment,
  p_batch_size integer,
  p_publisher_id text,
  p_lease_seconds integer
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  project_id uuid,
  environment app.environment,
  aggregate_type text,
  aggregate_id uuid,
  aggregate_revision bigint,
  event_type text,
  event_version integer,
  logical_event_key text,
  payload jsonb,
  publish_attempts integer,
  claim_token uuid,
  claimed_by text,
  claim_expires_at timestamptz
)
LANGUAGE sql
AS $$
  WITH selected AS (
    SELECT candidate.id
    FROM app.outbox_events candidate
    WHERE candidate.workspace_id = app.current_workspace_id()
      AND candidate.project_id = p_project_id
      AND candidate.environment = p_environment
      AND app.current_actor_id() IS NOT NULL
      AND candidate.published_at IS NULL
      AND candidate.available_at <= CURRENT_TIMESTAMP
      AND (
        candidate.claim_token IS NULL
        OR candidate.claim_expires_at <= CURRENT_TIMESTAMP
      )
    ORDER BY candidate.occurred_at, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_batch_size, 0), 100)
  ),
  updated AS (
    UPDATE app.outbox_events event
    SET publish_attempts = event.publish_attempts + 1,
        last_attempt_at = CURRENT_TIMESTAMP,
        claim_token = md5(random()::text || clock_timestamp()::text || event.id::text)::uuid,
        claimed_by = p_publisher_id,
        claim_expires_at = CURRENT_TIMESTAMP + make_interval(secs => GREATEST(p_lease_seconds, 1))
    FROM selected
    WHERE event.id = selected.id
    RETURNING event.*
  )
  SELECT
    updated.id,
    updated.workspace_id,
    updated.project_id,
    updated.environment,
    updated.aggregate_type,
    updated.aggregate_id,
    updated.aggregate_revision,
    updated.event_type,
    updated.event_version,
    updated.logical_event_key,
    updated.payload,
    updated.publish_attempts,
    updated.claim_token,
    updated.claimed_by,
    updated.claim_expires_at
  FROM updated
  ORDER BY updated.occurred_at, updated.id;
$$;

CREATE FUNCTION app.mark_outbox_published(
  p_project_id uuid,
  p_environment app.environment,
  p_event_id uuid,
  p_claim_token uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_event app.outbox_events%ROWTYPE;
BEGIN
  SELECT *
    INTO current_event
  FROM app.outbox_events event
  WHERE event.workspace_id = app.current_workspace_id()
    AND event.project_id = p_project_id
    AND event.environment = p_environment
    AND event.id = p_event_id
    AND app.current_actor_id() IS NOT NULL
  FOR UPDATE;

  IF current_event.id IS NULL THEN
    RAISE EXCEPTION 'outbox event not found in current scope';
  END IF;

  IF current_event.claim_token IS NULL THEN
    RAISE EXCEPTION 'outbox event must be claimed before publish';
  END IF;

  IF current_event.claim_token <> p_claim_token THEN
    RAISE EXCEPTION 'outbox claim token does not match';
  END IF;

  IF current_event.published_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE app.outbox_events
  SET published_at = CURRENT_TIMESTAMP
  WHERE workspace_id = current_event.workspace_id
    AND project_id = current_event.project_id
    AND environment = current_event.environment
    AND id = current_event.id
    AND claim_token = p_claim_token
    AND published_at IS NULL;
END;
$$;

CREATE FUNCTION app.release_or_retry_outbox_event(
  p_project_id uuid,
  p_environment app.environment,
  p_event_id uuid,
  p_claim_token uuid,
  p_available_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE app.outbox_events
  SET claim_token = NULL,
      claimed_by = NULL,
      claim_expires_at = NULL,
      available_at = p_available_at
  WHERE workspace_id = app.current_workspace_id()
    AND project_id = p_project_id
    AND environment = p_environment
    AND id = p_event_id
    AND claim_token = p_claim_token
    AND published_at IS NULL
    AND app.current_actor_id() IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox event not found for retry in current scope';
  END IF;
END;
$$;

CREATE FUNCTION app.consume_outbox_event(
  p_consumer_name text,
  p_event_id uuid,
  p_project_id uuid,
  p_environment app.environment
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  inserted boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app.outbox_events event
    WHERE event.workspace_id = app.current_workspace_id()
      AND event.project_id = p_project_id
      AND event.environment = p_environment
      AND event.id = p_event_id
  ) THEN
    RAISE EXCEPTION 'outbox event not found in current scope';
  END IF;

  INSERT INTO app.outbox_consumptions (
    consumer_name,
    event_id,
    workspace_id,
    project_id,
    environment
  )
  VALUES (
    p_consumer_name,
    p_event_id,
    app.current_workspace_id(),
    p_project_id,
    p_environment
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

CREATE TRIGGER idempotency_records_protect_insert_update_delete
BEFORE INSERT OR UPDATE OR DELETE ON app.idempotency_records
FOR EACH ROW EXECUTE FUNCTION app.protect_idempotency_record_change();

CREATE TRIGGER idempotency_records_touch_updated_at
BEFORE UPDATE ON app.idempotency_records
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER outbox_events_protect_insert_update_delete
BEFORE INSERT OR UPDATE OR DELETE ON app.outbox_events
FOR EACH ROW EXECUTE FUNCTION app.protect_outbox_event_change();

CREATE TRIGGER outbox_consumptions_immutable
BEFORE UPDATE OR DELETE ON app.outbox_consumptions
FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_row_change();

CREATE INDEX idx_idempotency_records_created
  ON app.idempotency_records (workspace_id, project_id, environment, created_at DESC);

CREATE INDEX idx_outbox_events_pending
  ON app.outbox_events (workspace_id, project_id, environment, published_at, available_at, claim_expires_at, occurred_at, id);

CREATE INDEX idx_outbox_events_aggregate
  ON app.outbox_events (workspace_id, project_id, environment, aggregate_type, aggregate_id);

ALTER TABLE app.idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency_records FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_records_tenant_isolation ON app.idempotency_records
USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_tenant_isolation ON app.outbox_events
USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.outbox_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_consumptions FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_consumptions_tenant_isolation ON app.outbox_consumptions
USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

INSERT INTO app.schema_migrations (version) VALUES ('0003_repository_outbox');
