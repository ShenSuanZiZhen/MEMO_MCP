DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM app.workspace_members
    WHERE role::text IN ('publisher', 'reviewer', 'operator')
  ) OR EXISTS (
    SELECT 1
    FROM app.project_members
    WHERE role::text IN ('publisher', 'reviewer', 'operator')
  ) THEN
    RAISE EXCEPTION
      'cannot rollback member_role data migration while publisher/reviewer/operator rows exist';
  END IF;
END
$$;

UPDATE app.workspace_members
SET role = 'developer'::app.member_role
WHERE role::text = 'editor';

UPDATE app.workspace_members
SET role = 'viewer'::app.member_role
WHERE role::text = 'observer';

UPDATE app.project_members
SET role = 'developer'::app.member_role
WHERE role::text = 'editor';

UPDATE app.project_members
SET role = 'viewer'::app.member_role
WHERE role::text = 'observer';

DELETE FROM app.schema_migrations WHERE version = '0005_member_role_data_migration';
