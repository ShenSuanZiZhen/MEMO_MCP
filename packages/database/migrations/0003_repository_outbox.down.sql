DELETE FROM app.schema_migrations WHERE version = '0003_repository_outbox';

DROP POLICY IF EXISTS outbox_consumptions_tenant_isolation ON app.outbox_consumptions;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON app.outbox_events;
DROP POLICY IF EXISTS idempotency_records_tenant_isolation ON app.idempotency_records;

DROP TABLE IF EXISTS app.outbox_consumptions;
DROP TABLE IF EXISTS app.outbox_events;
DROP TABLE IF EXISTS app.idempotency_records;

DROP FUNCTION IF EXISTS app.consume_outbox_event(text, uuid, uuid, app.environment);
DROP FUNCTION IF EXISTS app.release_or_retry_outbox_event(uuid, app.environment, uuid, uuid, timestamptz);
DROP FUNCTION IF EXISTS app.mark_outbox_published(uuid, app.environment, uuid, uuid);
DROP FUNCTION IF EXISTS app.claim_outbox_events(uuid, app.environment, integer, text, integer);
DROP FUNCTION IF EXISTS app.complete_idempotency_key(uuid, uuid, app.environment, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS app.ensure_idempotency_key(uuid, uuid, app.environment, text, text, text);
DROP FUNCTION IF EXISTS app.protect_outbox_event_change();
DROP FUNCTION IF EXISTS app.protect_idempotency_record_change();

DROP TYPE IF EXISTS app.idempotency_record_status;
