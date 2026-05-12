SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: timescaledb; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS timescaledb WITH SCHEMA public;

--
-- Name: EXTENSION timescaledb; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION timescaledb IS 'Enables scalable inserts and complex queries for time-series data (Community Edition)';

--
-- Name: timeseries; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA timeseries;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';

--
-- Name: connector_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.connector_type AS ENUM (
    'github',
    'gitlab',
    'bitbucket',
    'jira',
    'linear',
    'openrouter',
    'anthropic',
    'openai',
    'gemini',
    'slack',
    'github_copilot'
);

--
-- Name: daily_aggregate_retention; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.daily_aggregate_retention AS ENUM (
    '365_days',
    '730_days',
    '1095_days',
    'forever'
);

--
-- Name: event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_type AS ENUM (
    'chat',
    'completion',
    'edit',
    'commit',
    'review',
    'test',
    'debug',
    'refactor',
    'documentation',
    'other',
    'issue',
    'comment',
    'sprint'
);

--
-- Name: hourly_aggregate_retention; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.hourly_aggregate_retention AS ENUM (
    '90_days',
    '180_days',
    '365_days',
    '730_days'
);

--
-- Name: invitation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invitation_status AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);

--
-- Name: member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_role AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer'
);

--
-- Name: raw_event_ttl; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.raw_event_ttl AS ENUM (
    '6_hours',
    '12_hours',
    '24_hours',
    '48_hours',
    '72_hours'
);

--
-- Name: risk_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.risk_level AS ENUM (
    'low',
    'medium',
    'high',
    'critical',
    'none'
);

--
-- Name: tool_events_retention; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_events_retention AS ENUM (
    '30_days',
    '60_days',
    '90_days',
    '180_days',
    '365_days',
    '730_days'
);

--
-- Name: tool_name; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.tool_name AS ENUM (
    'claude_code',
    'cursor',
    'windsurf',
    'github_copilot',
    'aider',
    'continue',
    'cody',
    'tabnine',
    'amazon_q',
    'openrouter_api',
    'anthropic_api',
    'openai_api',
    'gemini_api',
    'custom',
    'jira',
    'linear',
    'github',
    'gitlab',
    'bitbucket'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _compressed_hypertable_2; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._compressed_hypertable_2 (
);

--
-- Name: tool_events; Type: TABLE; Schema: timeseries; Owner: -
--

CREATE TABLE timeseries.tool_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    organization_id uuid NOT NULL,
    project_id uuid,
    repository_id uuid,
    tool_name public.tool_name NOT NULL,
    event_type public.event_type NOT NULL,
    model character varying(255),
    tokens_in integer DEFAULT 0,
    tokens_out integer DEFAULT 0,
    tokens_total integer DEFAULT 0,
    cost_usd numeric(10,6) DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    occurred_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_ms integer
);

--
-- Name: _direct_view_3; Type: VIEW; Schema: _timescaledb_internal; Owner: -
--

CREATE VIEW _timescaledb_internal._direct_view_3 AS
 SELECT public.time_bucket('01:00:00'::interval, occurred_at) AS bucket,
    organization_id,
    user_id,
    project_id,
    tool_name,
    event_type,
    count(*) AS event_count,
    sum(tokens_in) AS total_tokens_in,
    sum(tokens_out) AS total_tokens_out,
    sum(tokens_total) AS total_tokens,
    sum(cost_usd) AS total_cost
   FROM timeseries.tool_events
  GROUP BY (public.time_bucket('01:00:00'::interval, occurred_at)), organization_id, user_id, project_id, tool_name, event_type;

--
-- Name: _direct_view_4; Type: VIEW; Schema: _timescaledb_internal; Owner: -
--

CREATE VIEW _timescaledb_internal._direct_view_4 AS
 SELECT public.time_bucket('1 day'::interval, occurred_at) AS bucket,
    organization_id,
    user_id,
    project_id,
    tool_name,
    event_type,
    count(*) AS event_count,
    sum(tokens_in) AS total_tokens_in,
    sum(tokens_out) AS total_tokens_out,
    sum(tokens_total) AS total_tokens,
    sum(cost_usd) AS total_cost
   FROM timeseries.tool_events
  GROUP BY (public.time_bucket('1 day'::interval, occurred_at)), organization_id, user_id, project_id, tool_name, event_type;

--
-- Name: _materialized_hypertable_3; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._materialized_hypertable_3 (
    bucket timestamp with time zone NOT NULL,
    organization_id uuid,
    user_id uuid,
    project_id uuid,
    tool_name public.tool_name,
    event_type public.event_type,
    event_count bigint,
    total_tokens_in bigint,
    total_tokens_out bigint,
    total_tokens bigint,
    total_cost numeric
);

--
-- Name: _materialized_hypertable_4; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._materialized_hypertable_4 (
    bucket timestamp with time zone NOT NULL,
    organization_id uuid,
    user_id uuid,
    project_id uuid,
    tool_name public.tool_name,
    event_type public.event_type,
    event_count bigint,
    total_tokens_in bigint,
    total_tokens_out bigint,
    total_tokens bigint,
    total_cost numeric
);

--
-- Name: _partial_view_3; Type: VIEW; Schema: _timescaledb_internal; Owner: -
--

CREATE VIEW _timescaledb_internal._partial_view_3 AS
 SELECT public.time_bucket('01:00:00'::interval, occurred_at) AS bucket,
    organization_id,
    user_id,
    project_id,
    tool_name,
    event_type,
    count(*) AS event_count,
    sum(tokens_in) AS total_tokens_in,
    sum(tokens_out) AS total_tokens_out,
    sum(tokens_total) AS total_tokens,
    sum(cost_usd) AS total_cost
   FROM timeseries.tool_events
  GROUP BY (public.time_bucket('01:00:00'::interval, occurred_at)), organization_id, user_id, project_id, tool_name, event_type;

--
-- Name: _partial_view_4; Type: VIEW; Schema: _timescaledb_internal; Owner: -
--

CREATE VIEW _timescaledb_internal._partial_view_4 AS
 SELECT public.time_bucket('1 day'::interval, occurred_at) AS bucket,
    organization_id,
    user_id,
    project_id,
    tool_name,
    event_type,
    count(*) AS event_count,
    sum(tokens_in) AS total_tokens_in,
    sum(tokens_out) AS total_tokens_out,
    sum(tokens_total) AS total_tokens,
    sum(cost_usd) AS total_cost
   FROM timeseries.tool_events
  GROUP BY (public.time_bucket('1 day'::interval, occurred_at)), organization_id, user_id, project_id, tool_name, event_type;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    action character varying NOT NULL,
    resource_type character varying NOT NULL,
    resource_id uuid,
    ip_address character varying,
    user_agent character varying,
    tracked_changes jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL
);

--
-- Name: ar_internal_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_internal_metadata (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tool_event_id uuid,
    raw_event_key character varying NOT NULL,
    organization_id uuid NOT NULL,
    classification_labels text[] DEFAULT '{}'::text[],
    risk_level public.risk_level DEFAULT 'low'::public.risk_level NOT NULL,
    confidence_score numeric(5,4),
    sanitization_actions text[] DEFAULT '{}'::text[],
    policy_version_id uuid,
    temporal_workflow_id character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL
);

--
-- Name: connector_event_dedup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_event_dedup (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    tool_name character varying NOT NULL,
    event_type character varying NOT NULL,
    unique_key character varying NOT NULL,
    unique_value character varying NOT NULL,
    tool_event_id uuid NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: connector_event_dedup_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.connector_event_dedup_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: connector_event_dedup_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.connector_event_dedup_id_seq OWNED BY public.connector_event_dedup.id;

--
-- Name: connector_health_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.connector_health_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_connector_id uuid NOT NULL,
    status character varying NOT NULL,
    sync_duration_ms integer,
    error_message text,
    snapshotted_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT connector_health_snapshots_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'failure'::character varying])::text[])))
);

--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    invited_by_id uuid NOT NULL,
    email character varying NOT NULL,
    token character varying NOT NULL,
    role public.member_role DEFAULT 'member'::public.member_role NOT NULL,
    status public.invitation_status DEFAULT 'pending'::public.invitation_status NOT NULL,
    expires_at timestamp(6) without time zone,
    accepted_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid,
    organization_connector_id uuid NOT NULL,
    assignee_id uuid,
    external_id character varying NOT NULL,
    key character varying NOT NULL,
    summary character varying NOT NULL,
    description text,
    status character varying,
    status_category character varying,
    issue_type character varying,
    priority character varying,
    provider_project_key character varying NOT NULL,
    provider_project_id character varying NOT NULL,
    assignee_account_id character varying,
    assignee_name character varying,
    reporter_name character varying,
    parent_key character varying,
    labels text[] DEFAULT '{}'::text[],
    due_date date,
    metadata jsonb DEFAULT '{}'::jsonb,
    external_created_at timestamp(6) without time zone,
    external_updated_at timestamp(6) without time zone,
    synced_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: model_pricing_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_pricing_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    model_pattern character varying NOT NULL,
    input_per_mtok numeric(10,6) NOT NULL,
    output_per_mtok numeric(10,6) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: organization_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    actor_id uuid,
    action character varying NOT NULL,
    resource_type character varying,
    resource_id uuid,
    tracked_changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address character varying,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: organization_connectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_connectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    connector_type public.connector_type NOT NULL,
    external_org_id character varying,
    external_org_name character varying,
    access_token text,
    refresh_token text,
    token_expires_at timestamp(6) without time zone,
    scopes text[] DEFAULT '{}'::text[],
    webhook_secret character varying,
    config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    last_sync_at timestamp(6) without time zone,
    last_error character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    external_account_id character varying,
    external_account_name character varying,
    status character varying DEFAULT 'connected'::character varying NOT NULL,
    pending_activity_jobs integer,
    webhook_token character varying,
    key_hash character varying,
    webhook_active boolean DEFAULT false NOT NULL,
    connector_scope character varying DEFAULT 'org'::character varying NOT NULL,
    activity_sync_started_at timestamp(6) without time zone
);

--
-- Name: organization_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    role public.member_role DEFAULT 'member'::public.member_role NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: organization_retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_retention_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    raw_event_ttl public.raw_event_ttl DEFAULT '24_hours'::public.raw_event_ttl NOT NULL,
    tool_events_retention public.tool_events_retention DEFAULT '90_days'::public.tool_events_retention NOT NULL,
    hourly_aggregate_retention public.hourly_aggregate_retention DEFAULT '365_days'::public.hourly_aggregate_retention NOT NULL,
    daily_aggregate_retention public.daily_aggregate_retention DEFAULT 'forever'::public.daily_aggregate_retention NOT NULL,
    retention_reason character varying,
    updated_by_id uuid,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: organization_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    key character varying NOT NULL,
    value jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    description character varying,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: project_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    actor_id uuid,
    action character varying NOT NULL,
    resource_type character varying,
    resource_id uuid,
    tracked_changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address character varying,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: project_connectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_connectors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    connector_type public.connector_type NOT NULL,
    access_token text,
    refresh_token text,
    token_expires_at timestamp(6) without time zone,
    scopes text[] DEFAULT '{}'::text[],
    webhook_secret text,
    config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    external_org_id character varying,
    external_org_name character varying,
    status character varying DEFAULT 'connected'::character varying NOT NULL,
    last_sync_at timestamp(6) without time zone,
    last_error character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    connector_scope character varying DEFAULT 'project'::character varying NOT NULL
);

--
-- Name: project_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    role public.member_role DEFAULT 'member'::public.member_role NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    created_by_id uuid
);

--
-- Name: project_retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_retention_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    updated_by_id uuid,
    raw_event_ttl public.raw_event_ttl DEFAULT '24_hours'::public.raw_event_ttl NOT NULL,
    tool_events_retention public.tool_events_retention DEFAULT '90_days'::public.tool_events_retention NOT NULL,
    hourly_aggregate_retention public.hourly_aggregate_retention DEFAULT '365_days'::public.hourly_aggregate_retention NOT NULL,
    daily_aggregate_retention public.daily_aggregate_retention DEFAULT 'forever'::public.daily_aggregate_retention NOT NULL,
    retention_reason character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: project_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    key character varying NOT NULL,
    value jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    owner_id uuid,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    description character varying,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    repository_url character varying,
    git_remote_url character varying
);

--
-- Name: repositories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.repositories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    organization_connector_id uuid NOT NULL,
    external_id character varying NOT NULL,
    name character varying NOT NULL,
    full_name character varying NOT NULL,
    url character varying,
    default_branch character varying,
    is_private boolean DEFAULT false,
    last_sync_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    description text,
    clone_url character varying,
    html_url character varying
);

--
-- Name: sanitization_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sanitization_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version integer NOT NULL,
    name character varying NOT NULL,
    classification_rules jsonb DEFAULT '{}'::jsonb,
    sanitization_rules jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT false NOT NULL,
    effective_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    description text,
    pattern character varying,
    replacement character varying,
    is_global boolean DEFAULT false NOT NULL,
    priority integer DEFAULT 0 NOT NULL
);

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);

--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    key character varying NOT NULL,
    value jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: user_tool_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tool_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_membership_id uuid NOT NULL,
    tool_name public.tool_name NOT NULL,
    external_user_id character varying,
    external_username character varying,
    external_email character varying,
    access_token text,
    refresh_token text,
    token_expires_at timestamp(6) without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    external_account_id character varying,
    external_account_name character varying,
    token_hash character varying,
    connector_scope character varying DEFAULT 'persona'::character varying NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    keycloak_sub character varying NOT NULL,
    email character varying NOT NULL,
    name character varying,
    avatar_url character varying,
    global_admin boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    last_sign_in_at timestamp(6) without time zone,
    last_login_at timestamp(6) without time zone
);

--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_connector_id uuid NOT NULL,
    provider character varying NOT NULL,
    event_type character varying NOT NULL,
    raw_event_key character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempted_at timestamp(6) without time zone,
    last_error character varying,
    delivered_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);

--
-- Name: daily_token_usage; Type: VIEW; Schema: timeseries; Owner: -
--

CREATE VIEW timeseries.daily_token_usage AS
 SELECT bucket,
    organization_id,
    user_id,
    project_id,
    tool_name,
    event_type,
    event_count,
    total_tokens_in,
    total_tokens_out,
    total_tokens,
    total_cost
   FROM _timescaledb_internal._materialized_hypertable_4;

--
-- Name: hourly_token_usage; Type: VIEW; Schema: timeseries; Owner: -
--

CREATE VIEW timeseries.hourly_token_usage AS
 SELECT bucket,
    organization_id,
    user_id,
    project_id,
    tool_name,
    event_type,
    event_count,
    total_tokens_in,
    total_tokens_out,
    total_tokens,
    total_cost
   FROM _timescaledb_internal._materialized_hypertable_3;

--
-- Name: connector_event_dedup id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_event_dedup ALTER COLUMN id SET DEFAULT nextval('public.connector_event_dedup_id_seq'::regclass);

--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);

--
-- Name: ar_internal_metadata ar_internal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);

--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

--
-- Name: connector_event_dedup connector_event_dedup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_event_dedup
    ADD CONSTRAINT connector_event_dedup_pkey PRIMARY KEY (id);

--
-- Name: connector_health_snapshots connector_health_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_health_snapshots
    ADD CONSTRAINT connector_health_snapshots_pkey PRIMARY KEY (id);

--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);

--
-- Name: issues issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_pkey PRIMARY KEY (id);

--
-- Name: model_pricing_overrides model_pricing_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_pricing_overrides
    ADD CONSTRAINT model_pricing_overrides_pkey PRIMARY KEY (id);

--
-- Name: organization_audit_logs organization_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT organization_audit_logs_pkey PRIMARY KEY (id);

--
-- Name: organization_connectors organization_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_connectors
    ADD CONSTRAINT organization_connectors_pkey PRIMARY KEY (id);

--
-- Name: organization_memberships organization_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT organization_memberships_pkey PRIMARY KEY (id);

--
-- Name: organization_retention_policies organization_retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_retention_policies
    ADD CONSTRAINT organization_retention_policies_pkey PRIMARY KEY (id);

--
-- Name: organization_settings organization_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT organization_settings_pkey PRIMARY KEY (id);

--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

--
-- Name: project_audit_logs project_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_audit_logs
    ADD CONSTRAINT project_audit_logs_pkey PRIMARY KEY (id);

--
-- Name: project_connectors project_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_connectors
    ADD CONSTRAINT project_connectors_pkey PRIMARY KEY (id);

--
-- Name: project_memberships project_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT project_memberships_pkey PRIMARY KEY (id);

--
-- Name: project_retention_policies project_retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_retention_policies
    ADD CONSTRAINT project_retention_policies_pkey PRIMARY KEY (id);

--
-- Name: project_settings project_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_settings
    ADD CONSTRAINT project_settings_pkey PRIMARY KEY (id);

--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

--
-- Name: repositories repositories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT repositories_pkey PRIMARY KEY (id);

--
-- Name: sanitization_policies sanitization_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sanitization_policies
    ADD CONSTRAINT sanitization_policies_pkey PRIMARY KEY (id);

--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);

--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (id);

--
-- Name: user_tool_accounts user_tool_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tool_accounts
    ADD CONSTRAINT user_tool_accounts_pkey PRIMARY KEY (id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);

--
-- Name: tool_events tool_events_pkey; Type: CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY timeseries.tool_events
    ADD CONSTRAINT tool_events_pkey PRIMARY KEY (id, occurred_at);

--
-- Name: _materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_3_bucket_idx ON _timescaledb_internal._materialized_hypertable_3 USING btree (bucket DESC);

--
-- Name: _materialized_hypertable_3_event_type_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_3_event_type_bucket_idx ON _timescaledb_internal._materialized_hypertable_3 USING btree (event_type, bucket DESC);

--
-- Name: _materialized_hypertable_3_organization_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_3_organization_id_bucket_idx ON _timescaledb_internal._materialized_hypertable_3 USING btree (organization_id, bucket DESC);

--
-- Name: _materialized_hypertable_3_project_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_3_project_id_bucket_idx ON _timescaledb_internal._materialized_hypertable_3 USING btree (project_id, bucket DESC);

--
-- Name: _materialized_hypertable_3_tool_name_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_3_tool_name_bucket_idx ON _timescaledb_internal._materialized_hypertable_3 USING btree (tool_name, bucket DESC);

--
-- Name: _materialized_hypertable_3_user_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_3_user_id_bucket_idx ON _timescaledb_internal._materialized_hypertable_3 USING btree (user_id, bucket DESC);

--
-- Name: _materialized_hypertable_4_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_4_bucket_idx ON _timescaledb_internal._materialized_hypertable_4 USING btree (bucket DESC);

--
-- Name: _materialized_hypertable_4_event_type_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_4_event_type_bucket_idx ON _timescaledb_internal._materialized_hypertable_4 USING btree (event_type, bucket DESC);

--
-- Name: _materialized_hypertable_4_organization_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_4_organization_id_bucket_idx ON _timescaledb_internal._materialized_hypertable_4 USING btree (organization_id, bucket DESC);

--
-- Name: _materialized_hypertable_4_project_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_4_project_id_bucket_idx ON _timescaledb_internal._materialized_hypertable_4 USING btree (project_id, bucket DESC);

--
-- Name: _materialized_hypertable_4_tool_name_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_4_tool_name_bucket_idx ON _timescaledb_internal._materialized_hypertable_4 USING btree (tool_name, bucket DESC);

--
-- Name: _materialized_hypertable_4_user_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _materialized_hypertable_4_user_id_bucket_idx ON _timescaledb_internal._materialized_hypertable_4 USING btree (user_id, bucket DESC);

--
-- Name: idx_connector_event_dedup_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_event_dedup_event_id ON public.connector_event_dedup USING btree (tool_event_id);

--
-- Name: idx_connector_event_dedup_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_connector_event_dedup_lookup ON public.connector_event_dedup USING btree (organization_id, tool_name, event_type, unique_key, unique_value);

--
-- Name: idx_on_organization_connector_id_created_at_49b9e3dabf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_organization_connector_id_created_at_49b9e3dabf ON public.webhook_deliveries USING btree (organization_connector_id, created_at);

--
-- Name: idx_on_organization_connector_id_snapshotted_at_80163c96c9; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_organization_connector_id_snapshotted_at_80163c96c9 ON public.connector_health_snapshots USING btree (organization_connector_id, snapshotted_at);

--
-- Name: idx_on_organization_connector_id_status_35942419d4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_organization_connector_id_status_35942419d4 ON public.webhook_deliveries USING btree (organization_connector_id, status);

--
-- Name: idx_on_organization_id_connector_type_ebd5fb8c77; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_organization_id_connector_type_ebd5fb8c77 ON public.organization_connectors USING btree (organization_id, connector_type);

--
-- Name: idx_organization_connectors_key_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_connectors_key_hash ON public.organization_connectors USING btree (key_hash) WHERE (key_hash IS NOT NULL);

--
-- Name: idx_organization_connectors_webhook_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_organization_connectors_webhook_token ON public.organization_connectors USING btree (webhook_token) WHERE (webhook_token IS NOT NULL);

--
-- Name: idx_repositories_connector_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_repositories_connector_external ON public.repositories USING btree (organization_connector_id, external_id);

--
-- Name: idx_user_tool_accounts_membership_tool; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_tool_accounts_membership_tool ON public.user_tool_accounts USING btree (organization_membership_id, tool_name);

--
-- Name: index_admin_audit_logs_on_admin_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_admin_audit_logs_on_admin_user_id ON public.admin_audit_logs USING btree (admin_user_id);

--
-- Name: index_admin_audit_logs_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_admin_audit_logs_on_created_at ON public.admin_audit_logs USING btree (created_at);

--
-- Name: index_admin_audit_logs_on_resource_type_and_resource_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_admin_audit_logs_on_resource_type_and_resource_id ON public.admin_audit_logs USING btree (resource_type, resource_id);

--
-- Name: index_audit_logs_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_audit_logs_on_organization_id ON public.audit_logs USING btree (organization_id);

--
-- Name: index_audit_logs_on_organization_id_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_audit_logs_on_organization_id_and_created_at ON public.audit_logs USING btree (organization_id, created_at DESC);

--
-- Name: index_audit_logs_on_policy_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_audit_logs_on_policy_version_id ON public.audit_logs USING btree (policy_version_id);

--
-- Name: index_audit_logs_on_raw_event_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_audit_logs_on_raw_event_key ON public.audit_logs USING btree (raw_event_key);

--
-- Name: index_audit_logs_on_temporal_workflow_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_audit_logs_on_temporal_workflow_id ON public.audit_logs USING btree (temporal_workflow_id);

--
-- Name: index_audit_logs_on_tool_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_audit_logs_on_tool_event_id ON public.audit_logs USING btree (tool_event_id);

--
-- Name: index_connector_health_snapshots_on_organization_connector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_connector_health_snapshots_on_organization_connector_id ON public.connector_health_snapshots USING btree (organization_connector_id);

--
-- Name: index_connector_health_snapshots_on_snapshotted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_connector_health_snapshots_on_snapshotted_at ON public.connector_health_snapshots USING btree (snapshotted_at);

--
-- Name: index_invitations_on_invited_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_invitations_on_invited_by_id ON public.invitations USING btree (invited_by_id);

--
-- Name: index_invitations_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_invitations_on_organization_id ON public.invitations USING btree (organization_id);

--
-- Name: index_invitations_on_organization_id_and_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_invitations_on_organization_id_and_email ON public.invitations USING btree (organization_id, email) WHERE (status = 'pending'::public.invitation_status);

--
-- Name: index_invitations_on_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_invitations_on_token ON public.invitations USING btree (token);

--
-- Name: index_issues_on_assignee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_assignee_id ON public.issues USING btree (assignee_id);

--
-- Name: index_issues_on_connector_project_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_issues_on_connector_project_external_id ON public.issues USING btree (organization_connector_id, project_id, external_id);

--
-- Name: index_issues_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_key ON public.issues USING btree (key);

--
-- Name: index_issues_on_organization_connector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_organization_connector_id ON public.issues USING btree (organization_connector_id);

--
-- Name: index_issues_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_organization_id ON public.issues USING btree (organization_id);

--
-- Name: index_issues_on_organization_id_and_external_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_organization_id_and_external_updated_at ON public.issues USING btree (organization_id, external_updated_at);

--
-- Name: index_issues_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_project_id ON public.issues USING btree (project_id);

--
-- Name: index_issues_on_project_id_and_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_project_id_and_status ON public.issues USING btree (project_id, status);

--
-- Name: index_model_pricing_overrides_on_org_and_pattern; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_model_pricing_overrides_on_org_and_pattern ON public.model_pricing_overrides USING btree (organization_id, model_pattern);

--
-- Name: index_model_pricing_overrides_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_model_pricing_overrides_on_organization_id ON public.model_pricing_overrides USING btree (organization_id);

--
-- Name: index_organization_audit_logs_on_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_action ON public.organization_audit_logs USING btree (action);

--
-- Name: index_organization_audit_logs_on_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_actor_id ON public.organization_audit_logs USING btree (actor_id);

--
-- Name: index_organization_audit_logs_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_created_at ON public.organization_audit_logs USING btree (created_at);

--
-- Name: index_organization_audit_logs_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_organization_id ON public.organization_audit_logs USING btree (organization_id);

--
-- Name: index_organization_audit_logs_on_resource_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_resource_type ON public.organization_audit_logs USING btree (resource_type);

--
-- Name: index_organization_audit_logs_on_resource_type_and_resource_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_resource_type_and_resource_id ON public.organization_audit_logs USING btree (resource_type, resource_id);

--
-- Name: index_organization_connectors_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_connectors_on_organization_id ON public.organization_connectors USING btree (organization_id);

--
-- Name: index_organization_connectors_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_connectors_on_status ON public.organization_connectors USING btree (status);

--
-- Name: index_organization_memberships_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_memberships_on_organization_id ON public.organization_memberships USING btree (organization_id);

--
-- Name: index_organization_memberships_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_memberships_on_user_id ON public.organization_memberships USING btree (user_id);

--
-- Name: index_organization_memberships_on_user_id_and_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_organization_memberships_on_user_id_and_organization_id ON public.organization_memberships USING btree (user_id, organization_id);

--
-- Name: index_organization_retention_policies_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_organization_retention_policies_on_organization_id ON public.organization_retention_policies USING btree (organization_id);

--
-- Name: index_organization_retention_policies_on_updated_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_retention_policies_on_updated_by_id ON public.organization_retention_policies USING btree (updated_by_id);

--
-- Name: index_organization_settings_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_settings_on_organization_id ON public.organization_settings USING btree (organization_id);

--
-- Name: index_organization_settings_on_organization_id_and_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_organization_settings_on_organization_id_and_key ON public.organization_settings USING btree (organization_id, key);

--
-- Name: index_organizations_on_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_organizations_on_slug ON public.organizations USING btree (slug);

--
-- Name: index_project_audit_logs_on_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_action ON public.project_audit_logs USING btree (action);

--
-- Name: index_project_audit_logs_on_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_actor_id ON public.project_audit_logs USING btree (actor_id);

--
-- Name: index_project_audit_logs_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_created_at ON public.project_audit_logs USING btree (created_at);

--
-- Name: index_project_audit_logs_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_project_id ON public.project_audit_logs USING btree (project_id);

--
-- Name: index_project_audit_logs_on_resource_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_resource_type ON public.project_audit_logs USING btree (resource_type);

--
-- Name: index_project_audit_logs_on_resource_type_and_resource_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_resource_type_and_resource_id ON public.project_audit_logs USING btree (resource_type, resource_id);

--
-- Name: index_project_connectors_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_connectors_on_project_id ON public.project_connectors USING btree (project_id);

--
-- Name: index_project_connectors_on_project_id_and_connector_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_project_connectors_on_project_id_and_connector_type ON public.project_connectors USING btree (project_id, connector_type);

--
-- Name: index_project_memberships_on_created_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_memberships_on_created_by_id ON public.project_memberships USING btree (created_by_id);

--
-- Name: index_project_memberships_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_memberships_on_project_id ON public.project_memberships USING btree (project_id);

--
-- Name: index_project_memberships_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_memberships_on_user_id ON public.project_memberships USING btree (user_id);

--
-- Name: index_project_memberships_on_user_id_and_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_project_memberships_on_user_id_and_project_id ON public.project_memberships USING btree (user_id, project_id);

--
-- Name: index_project_retention_policies_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_project_retention_policies_on_project_id ON public.project_retention_policies USING btree (project_id);

--
-- Name: index_project_retention_policies_on_updated_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_retention_policies_on_updated_by_id ON public.project_retention_policies USING btree (updated_by_id);

--
-- Name: index_project_settings_on_allowed_email_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_settings_on_allowed_email_domain ON public.project_settings USING btree (value) WHERE ((key)::text = 'allowed_email_domain'::text);

--
-- Name: index_project_settings_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_settings_on_project_id ON public.project_settings USING btree (project_id);

--
-- Name: index_project_settings_on_project_id_and_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_project_settings_on_project_id_and_key ON public.project_settings USING btree (project_id, key);

--
-- Name: index_projects_on_org_and_git_remote_url; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_projects_on_org_and_git_remote_url ON public.projects USING btree (organization_id, git_remote_url) WHERE ((organization_id IS NOT NULL) AND (git_remote_url IS NOT NULL));

--
-- Name: index_projects_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_projects_on_organization_id ON public.projects USING btree (organization_id);

--
-- Name: index_projects_on_organization_id_and_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_projects_on_organization_id_and_slug ON public.projects USING btree (organization_id, slug) WHERE (organization_id IS NOT NULL);

--
-- Name: index_projects_on_owner_and_git_remote_url; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_projects_on_owner_and_git_remote_url ON public.projects USING btree (owner_id, git_remote_url) WHERE ((owner_id IS NOT NULL) AND (git_remote_url IS NOT NULL));

--
-- Name: index_projects_on_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_projects_on_owner_id ON public.projects USING btree (owner_id);

--
-- Name: index_projects_on_owner_id_and_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_projects_on_owner_id_and_slug ON public.projects USING btree (owner_id, slug) WHERE (owner_id IS NOT NULL);

--
-- Name: index_repositories_on_organization_connector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_repositories_on_organization_connector_id ON public.repositories USING btree (organization_connector_id);

--
-- Name: index_repositories_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_repositories_on_project_id ON public.repositories USING btree (project_id);

--
-- Name: index_sanitization_policies_on_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_sanitization_policies_on_is_active ON public.sanitization_policies USING btree (is_active) WHERE (is_active = true);

--
-- Name: index_sanitization_policies_on_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_sanitization_policies_on_version ON public.sanitization_policies USING btree (version);

--
-- Name: index_user_settings_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_user_settings_on_user_id ON public.user_settings USING btree (user_id);

--
-- Name: index_user_settings_on_user_id_and_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_settings_on_user_id_and_key ON public.user_settings USING btree (user_id, key);

--
-- Name: index_user_tool_accounts_on_organization_membership_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_user_tool_accounts_on_organization_membership_id ON public.user_tool_accounts USING btree (organization_membership_id);

--
-- Name: index_user_tool_accounts_on_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_tool_accounts_on_token_hash ON public.user_tool_accounts USING btree (token_hash);

--
-- Name: index_users_on_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_users_on_email ON public.users USING btree (email);

--
-- Name: index_users_on_keycloak_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_users_on_keycloak_sub ON public.users USING btree (keycloak_sub);

--
-- Name: index_webhook_deliveries_on_organization_connector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_webhook_deliveries_on_organization_connector_id ON public.webhook_deliveries USING btree (organization_connector_id);

--
-- Name: idx_tool_events_external_id; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_external_id ON timeseries.tool_events USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);

--
-- Name: idx_tool_events_org_occurred; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_org_occurred ON timeseries.tool_events USING btree (organization_id, occurred_at DESC);

--
-- Name: idx_tool_events_org_tool_occurred; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_org_tool_occurred ON timeseries.tool_events USING btree (organization_id, tool_name, occurred_at DESC);

--
-- Name: idx_tool_events_project_occurred; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_project_occurred ON timeseries.tool_events USING btree (project_id, occurred_at DESC);

--
-- Name: idx_tool_events_session_id; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_session_id ON timeseries.tool_events USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);

--
-- Name: idx_tool_events_tool_occurred; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_tool_occurred ON timeseries.tool_events USING btree (tool_name, occurred_at DESC);

--
-- Name: idx_tool_events_user_occurred; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_user_occurred ON timeseries.tool_events USING btree (user_id, occurred_at DESC);

--
-- Name: tool_events_occurred_at_idx; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX tool_events_occurred_at_idx ON timeseries.tool_events USING btree (occurred_at DESC);

--
-- Name: project_memberships fk_project_memberships_created_by_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT fk_project_memberships_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);

--
-- Name: webhook_deliveries fk_rails_0afb2cd61a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT fk_rails_0afb2cd61a FOREIGN KEY (organization_connector_id) REFERENCES public.organization_connectors(id);

--
-- Name: invitations fk_rails_0fe4c14f0e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT fk_rails_0fe4c14f0e FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: audit_logs fk_rails_13aa3bd6ad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT fk_rails_13aa3bd6ad FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: project_memberships fk_rails_18b611e244; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT fk_rails_18b611e244 FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: projects fk_rails_219ef9bf7d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_rails_219ef9bf7d FOREIGN KEY (owner_id) REFERENCES public.users(id);

--
-- Name: organization_retention_policies fk_rails_273baa1ecd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_retention_policies
    ADD CONSTRAINT fk_rails_273baa1ecd FOREIGN KEY (updated_by_id) REFERENCES public.users(id);

--
-- Name: repositories fk_rails_36d1823ddd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT fk_rails_36d1823ddd FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: issues fk_rails_4b8ef071a8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT fk_rails_4b8ef071a8 FOREIGN KEY (organization_connector_id) REFERENCES public.organization_connectors(id);

--
-- Name: project_audit_logs fk_rails_525d91a68d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_audit_logs
    ADD CONSTRAINT fk_rails_525d91a68d FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: organization_memberships fk_rails_57cf70d280; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT fk_rails_57cf70d280 FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: connector_health_snapshots fk_rails_5fe169f99b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_health_snapshots
    ADD CONSTRAINT fk_rails_5fe169f99b FOREIGN KEY (organization_connector_id) REFERENCES public.organization_connectors(id);

--
-- Name: organization_audit_logs fk_rails_6b6833732b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT fk_rails_6b6833732b FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: project_audit_logs fk_rails_6fe27c573a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_audit_logs
    ADD CONSTRAINT fk_rails_6fe27c573a FOREIGN KEY (actor_id) REFERENCES public.users(id);

--
-- Name: audit_logs fk_rails_7145b2958f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT fk_rails_7145b2958f FOREIGN KEY (policy_version_id) REFERENCES public.sanitization_policies(id);

--
-- Name: organization_memberships fk_rails_715ab7f4fe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_memberships
    ADD CONSTRAINT fk_rails_715ab7f4fe FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: organization_connectors fk_rails_7f3b48aa2e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_connectors
    ADD CONSTRAINT fk_rails_7f3b48aa2e FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: project_retention_policies fk_rails_81cdd6d032; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_retention_policies
    ADD CONSTRAINT fk_rails_81cdd6d032 FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: project_memberships fk_rails_86b046ec96; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_memberships
    ADD CONSTRAINT fk_rails_86b046ec96 FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: issues fk_rails_899c8f3231; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT fk_rails_899c8f3231 FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: project_connectors fk_rails_8c7a35259d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_connectors
    ADD CONSTRAINT fk_rails_8c7a35259d FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: user_tool_accounts fk_rails_8ccfbe393d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tool_accounts
    ADD CONSTRAINT fk_rails_8ccfbe393d FOREIGN KEY (organization_membership_id) REFERENCES public.organization_memberships(id);

--
-- Name: organization_audit_logs fk_rails_8d2e99ef05; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT fk_rails_8d2e99ef05 FOREIGN KEY (actor_id) REFERENCES public.users(id);

--
-- Name: repositories fk_rails_92dbde9f4f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.repositories
    ADD CONSTRAINT fk_rails_92dbde9f4f FOREIGN KEY (organization_connector_id) REFERENCES public.organization_connectors(id);

--
-- Name: projects fk_rails_9aee26923d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_rails_9aee26923d FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: organization_retention_policies fk_rails_aea4165a3f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_retention_policies
    ADD CONSTRAINT fk_rails_aea4165a3f FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: project_retention_policies fk_rails_b240657e32; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_retention_policies
    ADD CONSTRAINT fk_rails_b240657e32 FOREIGN KEY (updated_by_id) REFERENCES public.users(id);

--
-- Name: model_pricing_overrides fk_rails_bb19157c26; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_pricing_overrides
    ADD CONSTRAINT fk_rails_bb19157c26 FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: organization_settings fk_rails_c56e4690c0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_settings
    ADD CONSTRAINT fk_rails_c56e4690c0 FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: project_settings fk_rails_c6df6e6328; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_settings
    ADD CONSTRAINT fk_rails_c6df6e6328 FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: issues fk_rails_ccc5514bad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT fk_rails_ccc5514bad FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: user_settings fk_rails_d1371c6356; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT fk_rails_d1371c6356 FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: invitations fk_rails_d799c974a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT fk_rails_d799c974a1 FOREIGN KEY (invited_by_id) REFERENCES public.users(id);

--
-- Name: admin_audit_logs fk_rails_f48ad7fa19; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT fk_rails_f48ad7fa19 FOREIGN KEY (admin_user_id) REFERENCES public.users(id);

--
-- Name: issues fk_rails_ff669b5916; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT fk_rails_ff669b5916 FOREIGN KEY (assignee_id) REFERENCES public.users(id);

--
-- Name: tool_events tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY timeseries.tool_events
    ADD CONSTRAINT tool_events_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

--
-- Name: tool_events tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY timeseries.tool_events
    ADD CONSTRAINT tool_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);

--
-- Name: tool_events tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY timeseries.tool_events
    ADD CONSTRAINT tool_events_repository_id_fkey FOREIGN KEY (repository_id) REFERENCES public.repositories(id);

--
-- Name: tool_events tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY timeseries.tool_events
    ADD CONSTRAINT tool_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- PostgreSQL database dump complete
--

SET search_path TO "$user", public;

INSERT INTO "schema_migrations" (version) VALUES
('20260512120000'),
('20260511120000'),
('20260507130000'),
('20260507120000'),
('20260506113501'),
('20260506102849'),
('20260505123328'),
('20260504180000'),
('20260504140050'),
('20260504135022'),
('20260504125319'),
('20260504121614'),
('20260504082100'),
('20260502155716'),
('20260502121500'),
('20260501151101'),
('20260429125535'),
('20260429123244'),
('20260429000001'),
('20260428125537'),
('20260424000003'),
('20260424000002'),
('20260424000001'),
('20260416000001'),
('20260415000001'),
('20260414000001'),
('20260413165455'),
('20260413165431'),
('20260408000001'),
('20260325000001'),
('20260324000001'),
('20260320000001'),
('20260317000001'),
('20260309000002'),
('20260309000001'),
('20260305123754'),
('20260225233834'),
('20260224000000'),
('20260223000002'),
('20260223000001'),
('20260223000000'),
('20260202004706'),
('20260131163423'),
('20260126000949'),
('20260125235001'),
('20260125235000'),
('20260125224628'),
('20260125224627'),
('20260125224626'),
('20260125224625'),
('20260125224624'),
('20260125224623'),
('20260125224622'),
('20260125224621'),
('20260125224620'),
('20260125224619'),
('20260125224618'),
('20260125224617'),
('20260125224616'),
('20260125224615'),
('20260125224614'),
('20260125224613'),
('20260125224604'),
('20260125224539');

