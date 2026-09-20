DELETE FROM app.schema_migrations WHERE version = '0007_member_role_repository';

DROP FUNCTION IF EXISTS app.change_member_role_and_record_audit(
  app.member_role_change_scope,
  uuid,
  uuid,
  uuid,
  uuid,
  app.member_role,
  boolean,
  timestamptz,
  uuid
);

DROP TRIGGER IF EXISTS member_role_audit_insert_matches_membership ON app.member_role_audit_events;
DROP TRIGGER IF EXISTS workspace_members_record_role_change_requirement ON app.workspace_members;
DROP TRIGGER IF EXISTS project_members_record_role_change_requirement ON app.project_members;
DROP TRIGGER IF EXISTS workspace_member_role_change_requires_audit ON app.workspace_members;
DROP TRIGGER IF EXISTS project_member_role_change_requires_audit ON app.project_members;
DROP TRIGGER IF EXISTS member_role_audit_events_append_only ON app.member_role_audit_events;
DROP FUNCTION IF EXISTS app.validate_member_role_audit_insert();
DROP FUNCTION IF EXISTS app.record_workspace_member_role_change_requirement();
DROP FUNCTION IF EXISTS app.record_project_member_role_change_requirement();
DROP FUNCTION IF EXISTS app.member_role_change_requirement_key(
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  bigint
);
DROP FUNCTION IF EXISTS app.require_workspace_member_role_audit();
DROP FUNCTION IF EXISTS app.require_project_member_role_audit();
DROP TABLE IF EXISTS app.member_role_audit_events;
DROP TYPE IF EXISTS app.member_role_change_scope;

DROP TRIGGER IF EXISTS workspace_members_require_initial_revision ON app.workspace_members;
DROP TRIGGER IF EXISTS project_members_require_initial_revision ON app.project_members;
DROP TRIGGER IF EXISTS workspace_members_require_revision_increment ON app.workspace_members;
DROP TRIGGER IF EXISTS project_members_require_revision_increment ON app.project_members;
DROP FUNCTION IF EXISTS app.require_workspace_member_initial_revision();
DROP FUNCTION IF EXISTS app.require_project_member_initial_revision();
DROP FUNCTION IF EXISTS app.protect_workspace_member_update();
DROP FUNCTION IF EXISTS app.protect_project_member_update();
DROP FUNCTION IF EXISTS app.protect_member_revision_update();

DROP INDEX IF EXISTS app.idx_workspace_members_workspace_revision;
DROP INDEX IF EXISTS app.idx_project_members_project_revision;

ALTER TABLE app.workspace_members
  DROP COLUMN IF EXISTS revision;

ALTER TABLE app.project_members
  DROP COLUMN IF EXISTS revision;
