DROP POLICY IF EXISTS multipart_upload_parts_tenant_isolation ON app.multipart_upload_parts;
ALTER TABLE app.multipart_upload_parts DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS multipart_uploads_tenant_isolation ON app.multipart_uploads;
ALTER TABLE app.multipart_uploads DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS app.idx_multipart_upload_parts_upload;
DROP INDEX IF EXISTS app.idx_multipart_uploads_draft_status;

DROP TRIGGER IF EXISTS multipart_upload_parts_append_only ON app.multipart_upload_parts;
DROP TRIGGER IF EXISTS multipart_uploads_touch_updated_at ON app.multipart_uploads;
DROP TRIGGER IF EXISTS multipart_uploads_require_revision_increment ON app.multipart_uploads;
DROP TRIGGER IF EXISTS multipart_uploads_protect_update ON app.multipart_uploads;

DROP FUNCTION IF EXISTS app.protect_multipart_upload_part_row();
DROP FUNCTION IF EXISTS app.protect_multipart_upload_update();

DROP TABLE IF EXISTS app.multipart_upload_parts;
DROP TABLE IF EXISTS app.multipart_uploads;

DELETE FROM app.schema_migrations WHERE version = '0008_upload_multipart';
