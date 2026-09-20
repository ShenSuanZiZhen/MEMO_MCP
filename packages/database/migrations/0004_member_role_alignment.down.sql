DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.workspace_members
    WHERE role::text IN ('editor', 'publisher', 'reviewer', 'observer', 'operator')
  ) OR EXISTS (
    SELECT 1
    FROM app.project_members
    WHERE role::text IN ('editor', 'publisher', 'reviewer', 'observer', 'operator')
  ) THEN
    RAISE EXCEPTION
      'cannot rollback member_role expand while new role values exist';
  END IF;
END
$$;

CREATE TYPE app.member_role_v1 AS ENUM ('owner', 'admin', 'developer', 'viewer');

ALTER TABLE app.workspace_members
  ALTER COLUMN role TYPE app.member_role_v1
  USING role::text::app.member_role_v1;

ALTER TABLE app.project_members
  ALTER COLUMN role TYPE app.member_role_v1
  USING role::text::app.member_role_v1;

DROP TYPE app.member_role;

ALTER TYPE app.member_role_v1 RENAME TO member_role;

DELETE FROM app.schema_migrations WHERE version = '0004_member_role_alignment';
