UPDATE app.workspace_members
SET role = 'editor'::app.member_role
WHERE role::text = 'developer';

UPDATE app.workspace_members
SET role = 'observer'::app.member_role
WHERE role::text = 'viewer';

UPDATE app.project_members
SET role = 'editor'::app.member_role
WHERE role::text = 'developer';

UPDATE app.project_members
SET role = 'observer'::app.member_role
WHERE role::text = 'viewer';

INSERT INTO app.schema_migrations (version) VALUES ('0005_member_role_data_migration');
