SET row_security = off;

INSERT INTO app.workspaces (id, slug, kind, revision, display_name, region)
VALUES
  (
    '018f0000-0000-7000-8000-000000000001',
    'acme',
    'team',
    1,
    'Acme Workspace',
    'us-east-1'
  ),
  (
    '018f0000-0000-7000-8000-000000000002',
    'globex',
    'team',
    1,
    'Globex Workspace',
    'us-east-1'
  );

INSERT INTO app.workspace_members (workspace_id, actor_id, role, status)
VALUES
  (
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000101',
    'owner',
    'active'
  ),
  (
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000103',
    'developer',
    'active'
  ),
  (
    '018f0000-0000-7000-8000-000000000002',
    '018f0000-0000-7000-8000-000000000102',
    'owner',
    'active'
  );

INSERT INTO app.projects (
  id,
  workspace_id,
  slug,
  revision,
  display_name,
  description,
  default_region,
  default_environment,
  status,
  created_by
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000201',
    '018f0000-0000-7000-8000-000000000001',
    'knowledge-base',
    1,
    'Knowledge Base',
    'Synthetic support workspace project.',
    'us-east-1',
    'production',
    'active',
    '018f0000-0000-7000-8000-000000000101'
  ),
  (
    '018f0000-0000-7000-8000-000000000202',
    '018f0000-0000-7000-8000-000000000002',
    'knowledge-base',
    1,
    'Knowledge Base',
    'Synthetic support workspace project.',
    'us-east-1',
    'production',
    'active',
    '018f0000-0000-7000-8000-000000000102'
  );

INSERT INTO app.project_members (
  workspace_id,
  project_id,
  actor_id,
  role,
  status
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    '018f0000-0000-7000-8000-000000000101',
    'owner',
    'active'
  ),
  (
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    '018f0000-0000-7000-8000-000000000103',
    'developer',
    'active'
  ),
  (
    '018f0000-0000-7000-8000-000000000002',
    '018f0000-0000-7000-8000-000000000202',
    '018f0000-0000-7000-8000-000000000102',
    'owner',
    'active'
  );

INSERT INTO app.data_sources (
  id,
  workspace_id,
  project_id,
  environment,
  slug,
  display_name,
  kind,
  sensitivity,
  rights,
  version_strategy,
  state,
  revision,
  created_by
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000301',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    'support-docs',
    'Support Docs',
    'file_upload',
    'internal',
    'synthetic_fixture_rights',
    'fixed',
    'active',
    1,
    '018f0000-0000-7000-8000-000000000101'
  ),
  (
    '018f0000-0000-7000-8000-000000000302',
    '018f0000-0000-7000-8000-000000000002',
    '018f0000-0000-7000-8000-000000000202',
    'production',
    'support-docs',
    'Support Docs',
    'file_upload',
    'internal',
    'synthetic_fixture_rights',
    'fixed',
    'active',
    1,
    '018f0000-0000-7000-8000-000000000102'
  );

INSERT INTO app.data_sources (
  id,
  workspace_id,
  project_id,
  environment,
  slug,
  display_name,
  kind,
  sensitivity,
  rights,
  version_strategy,
  state,
  revision,
  created_by
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000303',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'test',
    'support-docs',
    'Support Docs Test',
    'file_upload',
    'internal',
    'synthetic_fixture_rights',
    'fixed',
    'active',
    1,
    '018f0000-0000-7000-8000-000000000101'
  );

INSERT INTO app.data_versions (
  id,
  workspace_id,
  project_id,
  environment,
  data_source_id,
  status,
  processing_stage,
  revision,
  content_digest,
  created_by,
  completed_at
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000401',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    '018f0000-0000-7000-8000-000000000301',
    'completed',
    'completed',
    1,
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '018f0000-0000-7000-8000-000000000101',
    CURRENT_TIMESTAMP
  ),
  (
    '018f0000-0000-7000-8000-000000000402',
    '018f0000-0000-7000-8000-000000000002',
    '018f0000-0000-7000-8000-000000000202',
    'production',
    '018f0000-0000-7000-8000-000000000302',
    'completed',
    'completed',
    1,
    'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '018f0000-0000-7000-8000-000000000102',
    CURRENT_TIMESTAMP
  );

INSERT INTO app.drafts (
  id,
  workspace_id,
  project_id,
  environment,
  revision,
  state,
  current_step,
  creation_mode,
  title,
  document,
  created_by,
  updated_by
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000501',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    1,
    'editing',
    'goal',
    'blank',
    'Default Draft',
    '{"goal":"support lookup"}',
    '018f0000-0000-7000-8000-000000000101',
    '018f0000-0000-7000-8000-000000000101'
  ),
  (
    '018f0000-0000-7000-8000-000000000502',
    '018f0000-0000-7000-8000-000000000002',
    '018f0000-0000-7000-8000-000000000202',
    'production',
    1,
    'editing',
    'goal',
    'blank',
    'Default Draft',
    '{"goal":"support lookup"}',
    '018f0000-0000-7000-8000-000000000102',
    '018f0000-0000-7000-8000-000000000102'
  );

INSERT INTO app.draft_revisions (
  workspace_id,
  project_id,
  environment,
  draft_id,
  revision,
  document,
  changed_by
)
VALUES
  (
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    '018f0000-0000-7000-8000-000000000501',
    1,
    '{"goal":"support lookup"}',
    '018f0000-0000-7000-8000-000000000101'
  ),
  (
    '018f0000-0000-7000-8000-000000000002',
    '018f0000-0000-7000-8000-000000000202',
    'production',
    '018f0000-0000-7000-8000-000000000502',
    1,
    '{"goal":"support lookup"}',
    '018f0000-0000-7000-8000-000000000102'
  );

INSERT INTO app.modules (
  id,
  module_name,
  module_kind
)
VALUES (
  '018f0000-0000-7000-8000-000000001100',
  'search_documents',
  'capability'
);

INSERT INTO app.module_versions (
  id,
  module_id,
  module_name,
  module_kind,
  version,
  status,
  artifact_digest,
  signature_digest
)
VALUES (
  '018f0000-0000-7000-8000-000000001101',
  '018f0000-0000-7000-8000-000000001100',
  'search_documents',
  'capability',
  '1.0.0',
  'draft',
  'sha256:2222222222222222222222222222222222222222222222222222222222222222',
  'sha256:3333333333333333333333333333333333333333333333333333333333333333'
);

UPDATE app.module_versions
SET status = 'testing', revision = 2
WHERE id = '018f0000-0000-7000-8000-000000001101';

UPDATE app.module_versions
SET status = 'submitted', revision = 3
WHERE id = '018f0000-0000-7000-8000-000000001101';

UPDATE app.module_versions
SET status = 'approved', revision = 4
WHERE id = '018f0000-0000-7000-8000-000000001101';

INSERT INTO app.services (
  id,
  workspace_id,
  project_id,
  environment,
  slug,
  display_name,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001001',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  'support-search',
  'Support Search',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.service_definitions (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  version,
  digest,
  canonical_json,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001201',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '1.0.0',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  '{"metadata":{"schemaVersion":"1.0.0","serviceId":"svc_support_search","version":"1.0.0"},"modules":[{"id":"search_documents","exactVersion":"1.0.0"}]}',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.definition_modules (
  workspace_id,
  project_id,
  environment,
  definition_id,
  module_version_id,
  module_name,
  exact_version,
  artifact_digest
)
VALUES (
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001201',
  '018f0000-0000-7000-8000-000000001101',
  'search_documents',
  '1.0.0',
  'sha256:2222222222222222222222222222222222222222222222222222222222222222'
);

INSERT INTO app.candidates (
  id,
  workspace_id,
  project_id,
  environment,
  definition_id,
  definition_digest,
  version,
  status,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001301',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001201',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  '1.0.0',
  'submitted',
  '018f0000-0000-7000-8000-000000000101'
);

UPDATE app.candidates
SET status = 'approved', revision = 2
WHERE id = '018f0000-0000-7000-8000-000000001301';

INSERT INTO app.test_runs (
  id,
  workspace_id,
  project_id,
  environment,
  definition_id,
  definition_digest,
  candidate_id,
  status,
  report_digest,
  completed_at,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001401',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001201',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  '018f0000-0000-7000-8000-000000001301',
  'queued',
  NULL,
  NULL,
  '018f0000-0000-7000-8000-000000000101'
);

UPDATE app.test_runs
SET status = 'running', revision = 2
WHERE id = '018f0000-0000-7000-8000-000000001401';

UPDATE app.test_runs
SET
  status = 'passed',
  revision = 3,
  report_digest = 'sha256:4444444444444444444444444444444444444444444444444444444444444444',
  completed_at = CURRENT_TIMESTAMP
WHERE id = '018f0000-0000-7000-8000-000000001401';

INSERT INTO app.test_cases (
  id,
  workspace_id,
  project_id,
  environment,
  test_run_id,
  case_key,
  status,
  assertion_digest
)
VALUES (
  '018f0000-0000-7000-8000-000000001402',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001401',
  'synthetic-policy-deny',
  'passed',
  'sha256:5555555555555555555555555555555555555555555555555555555555555555'
);

INSERT INTO app.service_versions (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  version,
  definition_id,
  candidate_id,
  candidate_status,
  definition_digest,
  artifact_digest,
  status,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001501',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '1.0.0',
  '018f0000-0000-7000-8000-000000001201',
  '018f0000-0000-7000-8000-000000001301',
  'approved',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  'sha256:6666666666666666666666666666666666666666666666666666666666666666',
  'approved',
  '018f0000-0000-7000-8000-000000000101'
);

UPDATE app.service_versions
SET status = 'deploying', revision = 2
WHERE id = '018f0000-0000-7000-8000-000000001501';

UPDATE app.service_versions
SET status = 'published', revision = 3
WHERE id = '018f0000-0000-7000-8000-000000001501';

INSERT INTO app.deployments (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  service_version_id,
  definition_digest,
  status,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001601',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '018f0000-0000-7000-8000-000000001501',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  'provisioning',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.deployment_events (
  id,
  workspace_id,
  project_id,
  environment,
  deployment_id,
  deployment_revision,
  from_status,
  to_status,
  reason,
  actor_id
)
VALUES (
  '018f0000-0000-7000-8000-000000001602',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001601',
  1,
  NULL,
  'provisioning',
  'synthetic deployment created',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.access_policies (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  policy_name,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001701',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  'default_access',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.policy_versions (
  id,
  workspace_id,
  project_id,
  environment,
  access_policy_id,
  version_id,
  status,
  policy_digest,
  document,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001702',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001701',
  'pv_01HZY8T3M6R7P9K2Q4V5X6Y7Z8',
  'active',
  'sha256:7777777777777777777777777777777777777777777777777777777777777777',
  '{"allow":["tool.search_documents"],"limits":{"requestsPerMinute":60}}',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.credentials (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  access_policy_id,
  kind,
  status,
  subject_id,
  public_digest,
  created_by
)
VALUES
  (
    '018f0000-0000-7000-8000-000000001801',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    '018f0000-0000-7000-8000-000000001001',
    '018f0000-0000-7000-8000-000000001701',
    'api_key',
    'active',
    'synthetic-client-a',
    'sha256:8888888888888888888888888888888888888888888888888888888888888888',
    '018f0000-0000-7000-8000-000000000101'
  ),
  (
    '018f0000-0000-7000-8000-000000001803',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    '018f0000-0000-7000-8000-000000001001',
    '018f0000-0000-7000-8000-000000001701',
    'api_key',
    'active',
    'synthetic-client-a',
    'sha256:9898989898989898989898989898989898989898989898989898989898989898',
    '018f0000-0000-7000-8000-000000000101'
  );

UPDATE app.credentials
SET status = 'rotating', revision = 2
WHERE id = '018f0000-0000-7000-8000-000000001801';

INSERT INTO app.credential_secrets (
  id,
  workspace_id,
  project_id,
  environment,
  credential_id,
  secret_hash,
  secret_digest
)
VALUES
  (
    '018f0000-0000-7000-8000-000000001802',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    '018f0000-0000-7000-8000-000000001801',
    'sha256:9999999999999999999999999999999999999999999999999999999999999999',
    'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  ),
  (
    '018f0000-0000-7000-8000-000000001804',
    '018f0000-0000-7000-8000-000000000001',
    '018f0000-0000-7000-8000-000000000201',
    'production',
    '018f0000-0000-7000-8000-000000001803',
    'sha256:abababababababababababababababababababababababababababababababab',
    'sha256:babababababababababababababababababababababababababababababababa'
  );

INSERT INTO app.credential_rotations (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  access_policy_id,
  subject_id,
  old_credential_id,
  new_credential_id,
  status,
  created_by
)
VALUES (
  '018f0000-0000-7000-8000-000000001805',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '018f0000-0000-7000-8000-000000001701',
  'synthetic-client-a',
  '018f0000-0000-7000-8000-000000001801',
  '018f0000-0000-7000-8000-000000001803',
  'active',
  '018f0000-0000-7000-8000-000000000101'
);

INSERT INTO app.request_traces (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  service_version_id,
  credential_id,
  trace_id,
  status,
  completed_at,
  duration_ms,
  policy_decision_id
)
VALUES (
  '018f0000-0000-7000-8000-000000001901',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '018f0000-0000-7000-8000-000000001501',
  '018f0000-0000-7000-8000-000000001803',
  'trace_synthetic_0001',
  'allowed',
  CURRENT_TIMESTAMP,
  42,
  'decision_synthetic_0001'
);

INSERT INTO app.usage_events (
  id,
  workspace_id,
  project_id,
  environment,
  service_id,
  service_version_id,
  credential_id,
  idempotency_key,
  metric_key,
  unit,
  quantity
)
VALUES (
  '018f0000-0000-7000-8000-000000001902',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '018f0000-0000-7000-8000-000000001501',
  '018f0000-0000-7000-8000-000000001803',
  'idem_synthetic_0001',
  'mcp.request',
  'request',
  1
);

INSERT INTO app.quota_buckets (
  workspace_id,
  project_id,
  environment,
  service_id,
  credential_id,
  bucket_key,
  window_start,
  used
)
VALUES (
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000001001',
  '018f0000-0000-7000-8000-000000001803',
  'minute:synthetic',
  date_trunc('minute', CURRENT_TIMESTAMP),
  1
);

INSERT INTO app.audit_events (
  id,
  workspace_id,
  project_id,
  environment,
  actor_id,
  event_type,
  resource_type,
  resource_id,
  summary,
  metadata
)
VALUES (
  '018f0000-0000-7000-8000-000000001951',
  '018f0000-0000-7000-8000-000000000001',
  '018f0000-0000-7000-8000-000000000201',
  'production',
  '018f0000-0000-7000-8000-000000000101',
  'service_version.published',
  'service_version',
  '018f0000-0000-7000-8000-000000001501',
  'Synthetic service version published',
  '{"source":"synthetic_fixture"}'
);

RESET row_security;
