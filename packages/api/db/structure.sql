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
    'gitlab'
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
-- Name: _hyper_1_1397_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1397_chunk (
    CONSTRAINT constraint_1397 CHECK (((occurred_at >= '2026-03-23 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-03-24 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1398_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1398_chunk (
    CONSTRAINT constraint_1398 CHECK (((occurred_at >= '2026-02-23 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-02-24 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1399_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1399_chunk (
    CONSTRAINT constraint_1399 CHECK (((occurred_at >= '2026-04-01 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-02 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1400_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1400_chunk (
    CONSTRAINT constraint_1400 CHECK (((occurred_at >= '2026-04-08 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-09 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1401_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1401_chunk (
    CONSTRAINT constraint_1401 CHECK (((occurred_at >= '2026-04-15 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-16 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1402_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1402_chunk (
    CONSTRAINT constraint_1402 CHECK (((occurred_at >= '2026-04-02 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-03 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1403_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1403_chunk (
    CONSTRAINT constraint_1403 CHECK (((occurred_at >= '2026-04-17 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-18 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1404_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1404_chunk (
    CONSTRAINT constraint_1404 CHECK (((occurred_at >= '2026-04-28 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-29 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1405_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1405_chunk (
    CONSTRAINT constraint_1405 CHECK (((occurred_at >= '2026-03-31 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-01 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1406_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1406_chunk (
    CONSTRAINT constraint_1406 CHECK (((occurred_at >= '2026-04-09 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-10 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


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
-- Name: _hyper_3_1407_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_3_1407_chunk (
    CONSTRAINT constraint_1407 CHECK (((bucket >= '2026-04-27 00:00:00+00'::timestamp with time zone) AND (bucket < '2026-05-07 00:00:00+00'::timestamp with time zone)))
)
INHERITS (_timescaledb_internal._materialized_hypertable_3);


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
-- Name: compress_hyper_2_1408_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1408_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1408_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1409_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1409_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1409_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1410_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1410_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1410_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1411_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1411_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1411_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1412_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1412_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1412_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1413_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1413_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1413_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1414_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1414_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1414_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1415_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1415_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1415_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_1416_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_1416_chunk (
    _ts_meta_count integer,
    user_id uuid,
    organization_id uuid,
    _ts_meta_v2_bloomg_id _timescaledb_internal.bloom1,
    id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_project_id _timescaledb_internal.bloom1,
    project_id _timescaledb_internal.compressed_data,
    repository_id _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_tool_name _timescaledb_internal.bloom1,
    tool_name _timescaledb_internal.compressed_data,
    event_type _timescaledb_internal.compressed_data,
    model _timescaledb_internal.compressed_data,
    tokens_in _timescaledb_internal.compressed_data,
    tokens_out _timescaledb_internal.compressed_data,
    tokens_total _timescaledb_internal.compressed_data,
    cost_usd _timescaledb_internal.compressed_data,
    metadata _timescaledb_internal.compressed_data,
    _ts_meta_min_1 timestamp with time zone,
    _ts_meta_max_1 timestamp with time zone,
    occurred_at _timescaledb_internal.compressed_data,
    created_at _timescaledb_internal.compressed_data,
    duration_ms _timescaledb_internal.compressed_data,
    _ts_meta_v2_bloomg_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_1416_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name_occurred_at SET STORAGE MAIN;


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
    jira_project_key character varying NOT NULL,
    jira_project_id character varying NOT NULL,
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
    status character varying DEFAULT 'connected'::character varying NOT NULL
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
    updated_at timestamp(6) without time zone NOT NULL
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
    updated_at timestamp(6) without time zone NOT NULL
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
    token_hash character varying
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
-- Name: _hyper_1_1397_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1397_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1397_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1397_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1397_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1397_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1397_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1398_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1398_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1398_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1398_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1398_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1398_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1398_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1399_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1399_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1399_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1399_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1399_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1399_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1399_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1400_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1400_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1400_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1400_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1400_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1400_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1400_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1401_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1401_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1401_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1401_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1401_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1401_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1401_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1402_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1402_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1402_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1402_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1402_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1402_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1402_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1403_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1403_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1403_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1403_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1403_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1403_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1403_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1404_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1404_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1404_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1404_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1404_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1404_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1404_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1405_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1405_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1405_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1405_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1405_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1405_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1405_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1406_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1406_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1406_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1406_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1406_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1406_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1406_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1397_chunk 1397_6982_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk
    ADD CONSTRAINT "1397_6982_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1398_chunk 1398_6987_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk
    ADD CONSTRAINT "1398_6987_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1399_chunk 1399_6992_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk
    ADD CONSTRAINT "1399_6992_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1400_chunk 1400_6997_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk
    ADD CONSTRAINT "1400_6997_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1401_chunk 1401_7002_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk
    ADD CONSTRAINT "1401_7002_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1402_chunk 1402_7007_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk
    ADD CONSTRAINT "1402_7007_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1403_chunk 1403_7012_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk
    ADD CONSTRAINT "1403_7012_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1404_chunk 1404_7017_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk
    ADD CONSTRAINT "1404_7017_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1405_chunk 1405_7022_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk
    ADD CONSTRAINT "1405_7022_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1406_chunk 1406_7027_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk
    ADD CONSTRAINT "1406_7027_tool_events_pkey" PRIMARY KEY (id, occurred_at);


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
-- Name: tool_events tool_events_pkey; Type: CONSTRAINT; Schema: timeseries; Owner: -
--

ALTER TABLE ONLY timeseries.tool_events
    ADD CONSTRAINT tool_events_pkey PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1397_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1397_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1397_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1397_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1397_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1397_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1397_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1397_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1397_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1397_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1397_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1397_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1397_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1397_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1397_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1397_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1397_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1397_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1398_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1398_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1398_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1398_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1398_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1398_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1398_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1398_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1398_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1398_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1398_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1398_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1398_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1398_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1398_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1398_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1398_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1398_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1399_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1399_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1399_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1399_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1399_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1399_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1399_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1399_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1399_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1399_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1399_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1399_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1399_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1399_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1399_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1399_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1399_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1399_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1400_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1400_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1400_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1400_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1400_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1400_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1400_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1400_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1400_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1400_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1400_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1400_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1400_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1400_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1400_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1400_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1400_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1400_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1401_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1401_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1401_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1401_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1401_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1401_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1401_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1401_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1401_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1401_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1401_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1401_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1401_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1401_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1401_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1401_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1401_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1401_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1402_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1402_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1402_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1402_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1402_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1402_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1402_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1402_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1402_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1402_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1402_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1402_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1402_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1402_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1402_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1402_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1402_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1402_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1403_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1403_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1403_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1403_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1403_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1403_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1403_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1403_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1403_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1403_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1403_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1403_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1403_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1403_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1403_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1403_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1403_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1403_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1404_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1404_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1404_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1404_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1404_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1404_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1404_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1404_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1404_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1404_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1404_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1404_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1404_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1404_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1404_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1404_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1404_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1404_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1405_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1405_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1405_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1405_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1405_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1405_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1405_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1405_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1405_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1405_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1405_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1405_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1405_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1405_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1405_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1405_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1405_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1405_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1406_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1406_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1406_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1406_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1406_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1406_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1406_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1406_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1406_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1406_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1406_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1406_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1406_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1406_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1406_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1406_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1406_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1406_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_3_1407_chunk__materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_1407_chunk__materialized_hypertable_3_bucket_idx ON _timescaledb_internal._hyper_3_1407_chunk USING btree (bucket DESC);


--
-- Name: _hyper_3_1407_chunk__materialized_hypertable_3_event_type_bucke; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_1407_chunk__materialized_hypertable_3_event_type_bucke ON _timescaledb_internal._hyper_3_1407_chunk USING btree (event_type, bucket DESC);


--
-- Name: _hyper_3_1407_chunk__materialized_hypertable_3_organization_id_; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_1407_chunk__materialized_hypertable_3_organization_id_ ON _timescaledb_internal._hyper_3_1407_chunk USING btree (organization_id, bucket DESC);


--
-- Name: _hyper_3_1407_chunk__materialized_hypertable_3_project_id_bucke; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_1407_chunk__materialized_hypertable_3_project_id_bucke ON _timescaledb_internal._hyper_3_1407_chunk USING btree (project_id, bucket DESC);


--
-- Name: _hyper_3_1407_chunk__materialized_hypertable_3_tool_name_bucket; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_1407_chunk__materialized_hypertable_3_tool_name_bucket ON _timescaledb_internal._hyper_3_1407_chunk USING btree (tool_name, bucket DESC);


--
-- Name: _hyper_3_1407_chunk__materialized_hypertable_3_user_id_bucket_i; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_1407_chunk__materialized_hypertable_3_user_id_bucket_i ON _timescaledb_internal._hyper_3_1407_chunk USING btree (user_id, bucket DESC);


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
-- Name: compress_hyper_2_1408_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1408_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1408_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1409_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1409_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1409_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1410_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1410_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1410_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1411_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1411_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1411_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1412_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1412_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1412_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1413_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1413_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1413_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1414_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1414_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1414_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1415_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1415_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1415_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_1416_chunk_organization_id_user_id__ts_met_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_1416_chunk_organization_id_user_id__ts_met_idx ON _timescaledb_internal.compress_hyper_2_1416_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: idx_on_organization_id_connector_type_ebd5fb8c77; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_organization_id_connector_type_ebd5fb8c77 ON public.organization_connectors USING btree (organization_id, connector_type);


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
-- Name: index_issues_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_key ON public.issues USING btree (key);


--
-- Name: index_issues_on_organization_connector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_issues_on_organization_connector_id ON public.issues USING btree (organization_connector_id);


--
-- Name: index_issues_on_organization_connector_id_and_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_issues_on_organization_connector_id_and_external_id ON public.issues USING btree (organization_connector_id, external_id);


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
-- Name: idx_tool_events_org_occurred; Type: INDEX; Schema: timeseries; Owner: -
--

CREATE INDEX idx_tool_events_org_occurred ON timeseries.tool_events USING btree (organization_id, occurred_at DESC);


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
-- Name: _hyper_1_1397_chunk 1397_6981_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk
    ADD CONSTRAINT "1397_6981_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1397_chunk 1397_6983_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk
    ADD CONSTRAINT "1397_6983_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1397_chunk 1397_6984_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk
    ADD CONSTRAINT "1397_6984_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1397_chunk 1397_6985_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1397_chunk
    ADD CONSTRAINT "1397_6985_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1398_chunk 1398_6986_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk
    ADD CONSTRAINT "1398_6986_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1398_chunk 1398_6988_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk
    ADD CONSTRAINT "1398_6988_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1398_chunk 1398_6989_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk
    ADD CONSTRAINT "1398_6989_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1398_chunk 1398_6990_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1398_chunk
    ADD CONSTRAINT "1398_6990_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1399_chunk 1399_6991_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk
    ADD CONSTRAINT "1399_6991_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1399_chunk 1399_6993_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk
    ADD CONSTRAINT "1399_6993_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1399_chunk 1399_6994_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk
    ADD CONSTRAINT "1399_6994_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1399_chunk 1399_6995_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1399_chunk
    ADD CONSTRAINT "1399_6995_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1400_chunk 1400_6996_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk
    ADD CONSTRAINT "1400_6996_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1400_chunk 1400_6998_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk
    ADD CONSTRAINT "1400_6998_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1400_chunk 1400_6999_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk
    ADD CONSTRAINT "1400_6999_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1400_chunk 1400_7000_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1400_chunk
    ADD CONSTRAINT "1400_7000_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1401_chunk 1401_7001_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk
    ADD CONSTRAINT "1401_7001_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1401_chunk 1401_7003_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk
    ADD CONSTRAINT "1401_7003_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1401_chunk 1401_7004_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk
    ADD CONSTRAINT "1401_7004_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1401_chunk 1401_7005_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1401_chunk
    ADD CONSTRAINT "1401_7005_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1402_chunk 1402_7006_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk
    ADD CONSTRAINT "1402_7006_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1402_chunk 1402_7008_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk
    ADD CONSTRAINT "1402_7008_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1402_chunk 1402_7009_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk
    ADD CONSTRAINT "1402_7009_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1402_chunk 1402_7010_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1402_chunk
    ADD CONSTRAINT "1402_7010_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1403_chunk 1403_7011_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk
    ADD CONSTRAINT "1403_7011_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1403_chunk 1403_7013_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk
    ADD CONSTRAINT "1403_7013_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1403_chunk 1403_7014_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk
    ADD CONSTRAINT "1403_7014_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1403_chunk 1403_7015_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1403_chunk
    ADD CONSTRAINT "1403_7015_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1404_chunk 1404_7016_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk
    ADD CONSTRAINT "1404_7016_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1404_chunk 1404_7018_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk
    ADD CONSTRAINT "1404_7018_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1404_chunk 1404_7019_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk
    ADD CONSTRAINT "1404_7019_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1404_chunk 1404_7020_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1404_chunk
    ADD CONSTRAINT "1404_7020_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1405_chunk 1405_7021_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk
    ADD CONSTRAINT "1405_7021_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1405_chunk 1405_7023_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk
    ADD CONSTRAINT "1405_7023_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1405_chunk 1405_7024_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk
    ADD CONSTRAINT "1405_7024_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1405_chunk 1405_7025_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1405_chunk
    ADD CONSTRAINT "1405_7025_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1406_chunk 1406_7026_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk
    ADD CONSTRAINT "1406_7026_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1406_chunk 1406_7028_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk
    ADD CONSTRAINT "1406_7028_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1406_chunk 1406_7029_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk
    ADD CONSTRAINT "1406_7029_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1406_chunk 1406_7030_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1406_chunk
    ADD CONSTRAINT "1406_7030_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


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

