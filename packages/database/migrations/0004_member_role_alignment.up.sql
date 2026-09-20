ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'publisher';
ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'reviewer';
ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'observer';
ALTER TYPE app.member_role ADD VALUE IF NOT EXISTS 'operator';

INSERT INTO app.schema_migrations (version) VALUES ('0004_member_role_alignment');
