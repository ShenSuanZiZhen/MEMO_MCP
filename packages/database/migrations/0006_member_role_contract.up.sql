DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.workspace_members
    WHERE role::text IN ('developer', 'viewer')
  ) OR EXISTS (
    SELECT 1
    FROM app.project_members
    WHERE role::text IN ('developer', 'viewer')
  ) THEN
    RAISE EXCEPTION
      'cannot contract member_role while legacy developer/viewer rows exist';
  END IF;
END
$$;

CREATE TYPE app.member_role_v3 AS ENUM (
  'owner',
  'admin',
  'editor',
  'publisher',
  'reviewer',
  'observer',
  'operator'
);

ALTER TABLE app.workspace_members
  ALTER COLUMN role TYPE app.member_role_v3
  USING role::text::app.member_role_v3;

ALTER TABLE app.project_members
  ALTER COLUMN role TYPE app.member_role_v3
  USING role::text::app.member_role_v3;

DROP TYPE app.member_role;

ALTER TYPE app.member_role_v3 RENAME TO member_role;

INSERT INTO app.schema_migrations (version) VALUES ('0006_member_role_contract');
