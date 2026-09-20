CREATE TYPE app.member_role_expanded AS ENUM (
  'owner',
  'admin',
  'developer',
  'viewer',
  'editor',
  'publisher',
  'reviewer',
  'observer',
  'operator'
);

ALTER TABLE app.workspace_members
  ALTER COLUMN role TYPE app.member_role_expanded
  USING role::text::app.member_role_expanded;

ALTER TABLE app.project_members
  ALTER COLUMN role TYPE app.member_role_expanded
  USING role::text::app.member_role_expanded;

DROP TYPE app.member_role;

ALTER TYPE app.member_role_expanded RENAME TO member_role;

DELETE FROM app.schema_migrations WHERE version = '0006_member_role_contract';
