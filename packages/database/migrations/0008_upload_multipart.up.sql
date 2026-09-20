CREATE TABLE app.multipart_uploads (
  id uuid NOT NULL CHECK (app.is_uuid_v7(id)),
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  draft_id uuid NOT NULL,
  data_source_id uuid NOT NULL,
  data_version_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('uploading', 'uploaded', 'cancelled')),
  object_key text NOT NULL CHECK (
    length(object_key) BETWEEN 1 AND 1024
    AND object_key NOT LIKE '/%'
    AND object_key NOT LIKE '%..%'
  ),
  storage_upload_id text NOT NULL CHECK (length(storage_upload_id) BETWEEN 1 AND 1024),
  declared_file_name text NOT NULL CHECK (length(declared_file_name) BETWEEN 1 AND 255),
  declared_content_type text NOT NULL CHECK (length(declared_content_type) BETWEEN 1 AND 160),
  declared_size_bytes bigint NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 9007199254740991),
  server_size_bytes bigint CHECK (server_size_bytes BETWEEN 1 AND 9007199254740991),
  server_checksum_sha256 text CHECK (server_checksum_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_by uuid NOT NULL CHECK (app.is_uuid_v7(created_by)),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  cancelled_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (workspace_id, project_id, environment, id),
  UNIQUE (workspace_id, project_id, environment, object_key),
  UNIQUE (workspace_id, project_id, environment, data_version_id),
  CHECK (
    (status = 'uploading'
      AND server_size_bytes IS NULL
      AND server_checksum_sha256 IS NULL
      AND completed_at IS NULL
      AND cancelled_at IS NULL)
    OR (status = 'uploaded'
      AND server_size_bytes IS NOT NULL
      AND server_checksum_sha256 IS NOT NULL
      AND completed_at IS NOT NULL
      AND cancelled_at IS NULL)
    OR (status = 'cancelled'
      AND server_size_bytes IS NULL
      AND server_checksum_sha256 IS NULL
      AND completed_at IS NULL
      AND cancelled_at IS NOT NULL)
  ),
  FOREIGN KEY (workspace_id, project_id, environment, draft_id)
    REFERENCES app.drafts(workspace_id, project_id, environment, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, project_id, environment, data_source_id)
    REFERENCES app.data_sources(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, environment, data_version_id)
    REFERENCES app.data_versions(workspace_id, project_id, environment, id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, project_id, created_by)
    REFERENCES app.project_members(workspace_id, project_id, actor_id)
);

CREATE TABLE app.multipart_upload_parts (
  workspace_id uuid NOT NULL,
  project_id uuid NOT NULL,
  environment app.environment NOT NULL,
  upload_id uuid NOT NULL,
  part_number integer NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 9007199254740991),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^sha256:[a-f0-9]{64}$'),
  etag text NOT NULL CHECK (length(etag) BETWEEN 1 AND 256),
  confirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, project_id, environment, upload_id, part_number),
  FOREIGN KEY (workspace_id, project_id, environment, upload_id)
    REFERENCES app.multipart_uploads(workspace_id, project_id, environment, id)
    ON DELETE CASCADE
);

CREATE FUNCTION app.protect_multipart_upload_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'multipart upload updated_at is trigger maintained';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.environment IS DISTINCT FROM OLD.environment
    OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
    OR NEW.data_source_id IS DISTINCT FROM OLD.data_source_id
    OR NEW.data_version_id IS DISTINCT FROM OLD.data_version_id
    OR NEW.object_key IS DISTINCT FROM OLD.object_key
    OR NEW.storage_upload_id IS DISTINCT FROM OLD.storage_upload_id
    OR NEW.declared_file_name IS DISTINCT FROM OLD.declared_file_name
    OR NEW.declared_content_type IS DISTINCT FROM OLD.declared_content_type
    OR NEW.declared_size_bytes IS DISTINCT FROM OLD.declared_size_bytes
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'multipart upload identity and declaration fields are immutable';
  END IF;

  IF OLD.status IN ('uploaded', 'cancelled')
    AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'terminal multipart upload status cannot transition';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NOT (
      OLD.status = 'uploading' AND NEW.status IN ('uploaded', 'cancelled')
    )
  THEN
    RAISE EXCEPTION 'invalid multipart upload status transition';
  END IF;

  IF OLD.status = 'uploaded'
    AND (
      NEW.server_size_bytes IS DISTINCT FROM OLD.server_size_bytes
      OR NEW.server_checksum_sha256 IS DISTINCT FROM OLD.server_checksum_sha256
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    )
  THEN
    RAISE EXCEPTION 'completed multipart upload is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION app.protect_multipart_upload_part_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'multipart upload parts are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER multipart_uploads_protect_update
BEFORE UPDATE ON app.multipart_uploads
FOR EACH ROW EXECUTE FUNCTION app.protect_multipart_upload_update();

CREATE TRIGGER multipart_uploads_require_revision_increment
BEFORE UPDATE ON app.multipart_uploads
FOR EACH ROW EXECUTE FUNCTION app.require_revision_increment();

CREATE TRIGGER multipart_uploads_touch_updated_at
BEFORE UPDATE ON app.multipart_uploads
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TRIGGER multipart_upload_parts_append_only
BEFORE UPDATE OR DELETE ON app.multipart_upload_parts
FOR EACH ROW EXECUTE FUNCTION app.protect_multipart_upload_part_row();

CREATE INDEX idx_multipart_uploads_draft_status
  ON app.multipart_uploads (workspace_id, project_id, environment, draft_id, status, created_at DESC);
CREATE INDEX idx_multipart_upload_parts_upload
  ON app.multipart_upload_parts (workspace_id, project_id, environment, upload_id, part_number);

ALTER TABLE app.multipart_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.multipart_uploads FORCE ROW LEVEL SECURITY;
CREATE POLICY multipart_uploads_tenant_isolation ON app.multipart_uploads
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

ALTER TABLE app.multipart_upload_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.multipart_upload_parts FORCE ROW LEVEL SECURITY;
CREATE POLICY multipart_upload_parts_tenant_isolation ON app.multipart_upload_parts
  USING (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL)
  WITH CHECK (workspace_id = app.current_workspace_id() AND app.current_actor_id() IS NOT NULL);

INSERT INTO app.schema_migrations (version) VALUES ('0008_upload_multipart');
