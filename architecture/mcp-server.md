# MCP telemetry server (@aixle/insights)

End-user package: **`@aixle/insights`** in `packages/tools/aixle-insights/`. It runs as a **stdio MCP server** inside Claude Code (and can run standalone via `aixle-insights run`). It reads local Claude Code transcripts and Cursor IDE telemetry, normalizes payloads, and posts tool-usage events to the Aixle Insights ingest API using credentials obtained through **Keycloak/OIDC device login** (or manual token files for advanced setups).

## System flow

The diagram below mirrors the MCP package’s ingest path after readers produce normalized payloads. **Note:** `Api::V1::IngestController#create` **overwrites** `organization_id`, `user_id`, `tool_name`, and default **`event_type`** from the authenticated **ingest token** (`UserToolAccount`), so reader payloads must be treated as *hints*, not authoritative identity.

```mermaid
flowchart LR
  Editor[Claude Code / Cursor] -->|MCP stdio| MCP[@aixle/insights]
  MCP --> Readers[Claude JSONL reader / Cursor SQLite reader]
  Readers -->|POST /api/v1/ingest/events| Ingest[Api::V1::IngestController#create]
  Ingest --> Raw[RawEventStore / MinIO]
  Ingest -->|Temporal::Client.start_workflow| Temporal[Workflows::IngestionSanitizationWorkflow]
  Temporal --> Events[ToolEvents::Upsert / tool_events]
  Ingest -.Temporal unavailable.-> Fallback[fallback_direct_insert]
  Fallback --> Events
```

## Ingest controller behavior

Implementation: `packages/api/app/controllers/api/v1/ingest_controller.rb`.

Relevant sequence in **`#create`**:

1. **Normalize / permit params** (`permitted_params`), including back-compat mapping for raw Claude Code hook payloads when **`event_type`** is blank.
2. Apply **organization**, **user**, **tool**, and default **event_type** from the ingest token (**`event_params`** is merged with trusted server-side values)**.
3. **`store_raw_event(request.raw_post, org)`** — stores the raw POST body via **`RawEventStore`** (warns and continues if storage fails).
4. **`start_ingestion_workflow(raw_key, event_params, org)`** — calls **`Temporal::Client.start_workflow("Workflows::IngestionSanitizationWorkflow", …)`** with raw MinIO bucket/key and normalized **`event`** args.
5. On success: respond **`202 Accepted`** with `{ accepted: true, rawEventKey, workflowId? }`.
6. If Temporal start raises: log, then **`fallback_direct_insert`**, broadcast when possible via **`EventsChannel`**, and include **`fallback: true`** in the JSON payload.

Keep this document aligned whenever ingest or MCP exchange routes change.
