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
    'github_copilot',
    'cursor'
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
    'sprint',
    'tool_use'
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


--
-- Name: prevent_retention_purge_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_retention_purge_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'retention_purge_logs is append-only — updates and deletes are not permitted';
END;
$$;


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
-- Name: _hyper_1_100_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_100_chunk (
    CONSTRAINT constraint_55 CHECK (((occurred_at >= '2026-06-05 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-06 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_104_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_104_chunk (
    CONSTRAINT constraint_56 CHECK (((occurred_at >= '2026-06-08 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-09 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_10_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_10_chunk (
    CONSTRAINT constraint_10 CHECK (((occurred_at >= '2026-05-21 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-22 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_11_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_11_chunk (
    CONSTRAINT constraint_11 CHECK (((occurred_at >= '2026-05-20 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-21 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_12_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_12_chunk (
    CONSTRAINT constraint_12 CHECK (((occurred_at >= '2026-05-19 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-20 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_13_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_13_chunk (
    CONSTRAINT constraint_13 CHECK (((occurred_at >= '2026-05-18 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-19 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_14_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_14_chunk (
    CONSTRAINT constraint_14 CHECK (((occurred_at >= '2026-05-17 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-18 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_15_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_15_chunk (
    CONSTRAINT constraint_15 CHECK (((occurred_at >= '2026-05-16 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-17 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_16_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_16_chunk (
    CONSTRAINT constraint_16 CHECK (((occurred_at >= '2026-05-15 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-16 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_17_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_17_chunk (
    CONSTRAINT constraint_17 CHECK (((occurred_at >= '2026-05-14 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-15 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_18_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_18_chunk (
    CONSTRAINT constraint_18 CHECK (((occurred_at >= '2026-05-13 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-14 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_19_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_19_chunk (
    CONSTRAINT constraint_19 CHECK (((occurred_at >= '2026-05-12 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-13 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_1_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_1_chunk (
    CONSTRAINT constraint_1 CHECK (((occurred_at >= '2026-05-30 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-31 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_20_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_20_chunk (
    CONSTRAINT constraint_20 CHECK (((occurred_at >= '2026-05-11 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-12 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_21_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_21_chunk (
    CONSTRAINT constraint_21 CHECK (((occurred_at >= '2026-05-10 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-11 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_22_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_22_chunk (
    CONSTRAINT constraint_22 CHECK (((occurred_at >= '2026-05-09 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-10 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_23_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_23_chunk (
    CONSTRAINT constraint_23 CHECK (((occurred_at >= '2026-05-08 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-09 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_24_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_24_chunk (
    CONSTRAINT constraint_24 CHECK (((occurred_at >= '2026-05-07 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-08 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_25_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_25_chunk (
    CONSTRAINT constraint_25 CHECK (((occurred_at >= '2026-05-06 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-07 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_26_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_26_chunk (
    CONSTRAINT constraint_26 CHECK (((occurred_at >= '2026-05-05 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-06 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_27_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_27_chunk (
    CONSTRAINT constraint_27 CHECK (((occurred_at >= '2026-05-04 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-05 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_28_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_28_chunk (
    CONSTRAINT constraint_28 CHECK (((occurred_at >= '2026-05-03 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-04 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_29_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_29_chunk (
    CONSTRAINT constraint_29 CHECK (((occurred_at >= '2026-05-02 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-03 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_2_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_2_chunk (
    CONSTRAINT constraint_2 CHECK (((occurred_at >= '2026-05-29 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-30 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_30_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_30_chunk (
    CONSTRAINT constraint_30 CHECK (((occurred_at >= '2026-05-01 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-02 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_31_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_31_chunk (
    CONSTRAINT constraint_31 CHECK (((occurred_at >= '2026-04-30 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-01 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_32_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_32_chunk (
    CONSTRAINT constraint_32 CHECK (((occurred_at >= '2026-04-29 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-30 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_33_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_33_chunk (
    CONSTRAINT constraint_33 CHECK (((occurred_at >= '2026-04-28 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-29 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_34_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_34_chunk (
    CONSTRAINT constraint_34 CHECK (((occurred_at >= '2026-04-27 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-28 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_35_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_35_chunk (
    CONSTRAINT constraint_35 CHECK (((occurred_at >= '2026-04-26 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-27 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_36_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_36_chunk (
    CONSTRAINT constraint_36 CHECK (((occurred_at >= '2026-04-25 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-26 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_37_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_37_chunk (
    CONSTRAINT constraint_37 CHECK (((occurred_at >= '2026-04-24 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-25 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_38_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_38_chunk (
    CONSTRAINT constraint_38 CHECK (((occurred_at >= '2026-04-23 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-24 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_39_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_39_chunk (
    CONSTRAINT constraint_39 CHECK (((occurred_at >= '2026-04-22 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-23 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_3_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_3_chunk (
    CONSTRAINT constraint_3 CHECK (((occurred_at >= '2026-05-28 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-29 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_40_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_40_chunk (
    CONSTRAINT constraint_40 CHECK (((occurred_at >= '2026-04-21 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-22 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_41_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_41_chunk (
    CONSTRAINT constraint_41 CHECK (((occurred_at >= '2026-04-20 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-21 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_42_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_42_chunk (
    CONSTRAINT constraint_42 CHECK (((occurred_at >= '2026-04-19 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-20 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_43_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_43_chunk (
    CONSTRAINT constraint_43 CHECK (((occurred_at >= '2026-04-18 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-19 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_44_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_44_chunk (
    CONSTRAINT constraint_44 CHECK (((occurred_at >= '2026-04-17 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-18 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_45_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_45_chunk (
    CONSTRAINT constraint_45 CHECK (((occurred_at >= '2026-04-16 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-04-17 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_47_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_47_chunk (
    CONSTRAINT constraint_47 CHECK (((occurred_at >= '2026-02-23 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-02-24 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_48_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_48_chunk (
    CONSTRAINT constraint_48 CHECK (((occurred_at >= '2026-02-16 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-02-17 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_4_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_4_chunk (
    CONSTRAINT constraint_4 CHECK (((occurred_at >= '2026-05-27 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-28 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_5_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_5_chunk (
    CONSTRAINT constraint_5 CHECK (((occurred_at >= '2026-05-26 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-27 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_6_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_6_chunk (
    CONSTRAINT constraint_6 CHECK (((occurred_at >= '2026-05-25 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-26 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_7_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_7_chunk (
    CONSTRAINT constraint_7 CHECK (((occurred_at >= '2026-05-24 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-25 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_89_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_89_chunk (
    CONSTRAINT constraint_49 CHECK (((occurred_at >= '2026-05-31 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-01 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_8_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_8_chunk (
    CONSTRAINT constraint_8 CHECK (((occurred_at >= '2026-05-23 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-24 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_92_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_92_chunk (
    CONSTRAINT constraint_51 CHECK (((occurred_at >= '2026-06-01 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-02 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_94_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_94_chunk (
    CONSTRAINT constraint_52 CHECK (((occurred_at >= '2026-06-02 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-03 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_95_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_95_chunk (
    CONSTRAINT constraint_53 CHECK (((occurred_at >= '2026-06-03 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-04 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_98_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_98_chunk (
    CONSTRAINT constraint_54 CHECK (((occurred_at >= '2026-06-04 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-06-05 00:00:00+00'::timestamp with time zone)))
)
INHERITS (timeseries.tool_events);


--
-- Name: _hyper_1_9_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_1_9_chunk (
    CONSTRAINT constraint_9 CHECK (((occurred_at >= '2026-05-22 00:00:00+00'::timestamp with time zone) AND (occurred_at < '2026-05-23 00:00:00+00'::timestamp with time zone)))
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
-- Name: _hyper_3_105_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_3_105_chunk (
    CONSTRAINT constraint_57 CHECK (((bucket >= '2026-06-06 00:00:00+00'::timestamp with time zone) AND (bucket < '2026-06-16 00:00:00+00'::timestamp with time zone)))
)
INHERITS (_timescaledb_internal._materialized_hypertable_3);


--
-- Name: _hyper_3_46_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_3_46_chunk (
    CONSTRAINT constraint_46 CHECK (((bucket >= '2026-05-27 00:00:00+00'::timestamp with time zone) AND (bucket < '2026-06-06 00:00:00+00'::timestamp with time zone)))
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
-- Name: _hyper_4_90_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal._hyper_4_90_chunk (
    CONSTRAINT constraint_50 CHECK (((bucket >= '2026-05-27 00:00:00+00'::timestamp with time zone) AND (bucket < '2026-06-06 00:00:00+00'::timestamp with time zone)))
)
INHERITS (_timescaledb_internal._materialized_hypertable_4);


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
-- Name: compress_hyper_2_101_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_101_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_101_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_102_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_102_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_102_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_103_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_103_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_103_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_49_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_49_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_49_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_50_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_50_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_50_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_51_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_51_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_51_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_52_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_52_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_52_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_53_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_53_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_53_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_54_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_54_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_54_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_55_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_55_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_55_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_56_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_56_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_56_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_57_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_57_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_57_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_58_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_58_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_58_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_59_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_59_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_59_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_60_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_60_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_60_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_61_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_61_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_61_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_62_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_62_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_62_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_63_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_63_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_63_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_64_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_64_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_64_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_65_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_65_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_65_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_66_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_66_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_66_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_67_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_67_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_67_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_68_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_68_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_68_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_69_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_69_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_69_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_70_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_70_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_70_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_71_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_71_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_71_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_72_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_72_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_72_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_73_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_73_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_73_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_74_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_74_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_74_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_75_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_75_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_75_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_76_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_76_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_76_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_77_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_77_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_77_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_78_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_78_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_78_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_79_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_79_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_79_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_80_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_80_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_80_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_81_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_81_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_81_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_82_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_82_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_82_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_83_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_83_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_83_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_84_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_84_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_84_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_85_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_85_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_85_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_86_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_86_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_86_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_87_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_87_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_87_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_88_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_88_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_88_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_91_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_91_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_91_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_93_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_93_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_93_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_96_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_96_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_96_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_97_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_97_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_97_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: compress_hyper_2_99_chunk; Type: TABLE; Schema: _timescaledb_internal; Owner: -
--

CREATE TABLE _timescaledb_internal.compress_hyper_2_99_chunk (
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
    _ts_meta_v2_bloomg_4fb2_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_1aa9_project_id_occurred_at _timescaledb_internal.bloom1,
    _ts_meta_v2_bloomg_054f_tool_name_occurred_at _timescaledb_internal.bloom1
)
WITH (toast_tuple_target='128');
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_count SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN organization_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_project_id SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN project_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN repository_id SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_tool_name SET STORAGE EXTERNAL;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN tool_name SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN tool_name SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN event_type SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN event_type SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN model SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN model SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN tokens_in SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN tokens_out SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN tokens_total SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN cost_usd SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN cost_usd SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN metadata SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN metadata SET STORAGE EXTENDED;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_min_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_max_1 SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN occurred_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN created_at SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN duration_ms SET STATISTICS 0;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_4fb2_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_1aa9_project_id_occurred_at SET STORAGE MAIN;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STATISTICS 1000;
ALTER TABLE ONLY _timescaledb_internal.compress_hyper_2_99_chunk ALTER COLUMN _ts_meta_v2_bloomg_054f_tool_name_occurred_at SET STORAGE MAIN;


--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    action character varying NOT NULL,
    resource_type character varying NOT NULL,
    resource_id uuid,
    ip_address inet,
    user_agent character varying,
    tracked_changes jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL,
    severity character varying,
    outcome character varying
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
-- Name: notification_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    notification_type character varying NOT NULL,
    recipient_type character varying NOT NULL,
    recipient_role character varying,
    recipient_user_id uuid,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    notification_type character varying NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    read_at timestamp(6) without time zone,
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
    ip_address inet,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent character varying,
    severity character varying,
    outcome character varying
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
    updated_at timestamp(6) without time zone NOT NULL,
    cost_threshold_cents integer,
    token_threshold integer,
    alert_enabled boolean DEFAULT true NOT NULL
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
    ip_address inet,
    created_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_agent character varying,
    severity character varying,
    outcome character varying
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
    updated_at timestamp(6) without time zone NOT NULL,
    cost_threshold_cents integer,
    token_threshold integer,
    alert_enabled boolean DEFAULT true NOT NULL
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
-- Name: retention_purge_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_purge_logs (
    id bigint NOT NULL,
    organization_id uuid NOT NULL,
    project_id uuid,
    retention_policy_type integer NOT NULL,
    retention_days_applied integer NOT NULL,
    cutoff_timestamp timestamp(6) without time zone NOT NULL,
    records_deleted integer DEFAULT 0 NOT NULL,
    job_run_at timestamp(6) without time zone NOT NULL,
    status integer DEFAULT 0 NOT NULL,
    error_message text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: retention_purge_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retention_purge_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retention_purge_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.retention_purge_logs_id_seq OWNED BY public.retention_purge_logs.id;


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
-- Name: user_personal_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_personal_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    cost_threshold_cents integer,
    token_threshold integer,
    alert_email boolean DEFAULT true NOT NULL,
    alert_slack boolean DEFAULT false NOT NULL,
    theme character varying,
    timezone character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: user_project_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_project_favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
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
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    external_account_id character varying,
    external_account_name character varying,
    token_hash character varying,
    connector_scope character varying DEFAULT 'persona'::character varying NOT NULL,
    connection_state character varying DEFAULT 'inactive'::character varying NOT NULL
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
-- Name: _hyper_1_100_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_100_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_100_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_100_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_100_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_100_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_100_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_104_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_104_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_104_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_104_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_104_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_104_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_104_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_10_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_10_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_10_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_10_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_10_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_10_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_10_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_11_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_11_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_11_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_11_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_11_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_11_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_11_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_12_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_12_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_12_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_12_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_12_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_12_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_12_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_13_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_13_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_13_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_13_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_13_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_13_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_13_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_14_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_14_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_14_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_14_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_14_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_14_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_14_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_15_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_15_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_15_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_15_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_15_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_15_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_15_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_16_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_16_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_16_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_16_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_16_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_16_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_16_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_17_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_17_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_17_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_17_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_17_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_17_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_17_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_18_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_18_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_18_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_18_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_18_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_18_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_18_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_19_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_19_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_19_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_19_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_19_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_19_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_19_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_1_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_1_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_1_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_1_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_1_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_1_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_1_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_20_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_20_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_20_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_20_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_20_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_20_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_20_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_21_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_21_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_21_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_21_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_21_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_21_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_21_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_22_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_22_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_22_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_22_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_22_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_22_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_22_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_23_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_23_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_23_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_23_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_23_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_23_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_23_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_24_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_24_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_24_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_24_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_24_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_24_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_24_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_25_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_25_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_25_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_25_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_25_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_25_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_25_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_26_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_26_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_26_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_26_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_26_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_26_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_26_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_27_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_27_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_27_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_27_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_27_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_27_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_27_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_28_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_28_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_28_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_28_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_28_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_28_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_28_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_29_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_29_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_29_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_29_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_29_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_29_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_29_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_2_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_2_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_2_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_2_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_2_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_2_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_2_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_30_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_30_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_30_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_30_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_30_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_30_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_30_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_31_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_31_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_31_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_31_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_31_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_31_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_31_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_32_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_32_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_32_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_32_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_32_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_32_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_32_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_33_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_33_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_33_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_33_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_33_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_33_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_33_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_34_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_34_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_34_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_34_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_34_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_34_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_34_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_35_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_35_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_35_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_35_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_35_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_35_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_35_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_36_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_36_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_36_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_36_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_36_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_36_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_36_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_37_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_37_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_37_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_37_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_37_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_37_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_37_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_38_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_38_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_38_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_38_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_38_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_38_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_38_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_39_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_39_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_39_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_39_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_39_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_39_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_39_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_3_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_3_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_3_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_3_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_3_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_3_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_3_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_40_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_40_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_40_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_40_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_40_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_40_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_40_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_41_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_41_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_41_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_41_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_41_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_41_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_41_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_42_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_42_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_42_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_42_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_42_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_42_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_42_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_43_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_43_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_43_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_43_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_43_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_43_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_43_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_44_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_44_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_44_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_44_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_44_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_44_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_44_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_45_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_45_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_45_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_45_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_45_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_45_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_45_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_47_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_47_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_47_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_47_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_47_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_47_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_47_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_48_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_48_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_48_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_48_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_48_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_48_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_48_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_4_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_4_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_4_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_4_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_4_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_4_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_4_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_5_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_5_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_5_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_5_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_5_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_5_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_5_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_6_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_6_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_6_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_6_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_6_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_6_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_6_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_7_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_7_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_7_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_7_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_7_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_7_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_7_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_89_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_89_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_89_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_89_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_89_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_89_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_89_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_8_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_8_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_8_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_8_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_8_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_8_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_8_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_92_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_92_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_92_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_92_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_92_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_92_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_92_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_94_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_94_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_94_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_94_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_94_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_94_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_94_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_95_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_95_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_95_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_95_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_95_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_95_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_95_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_98_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_98_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_98_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_98_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_98_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_98_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_98_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: _hyper_1_9_chunk id; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN id SET DEFAULT gen_random_uuid();


--
-- Name: _hyper_1_9_chunk tokens_in; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN tokens_in SET DEFAULT 0;


--
-- Name: _hyper_1_9_chunk tokens_out; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN tokens_out SET DEFAULT 0;


--
-- Name: _hyper_1_9_chunk tokens_total; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN tokens_total SET DEFAULT 0;


--
-- Name: _hyper_1_9_chunk cost_usd; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN cost_usd SET DEFAULT 0;


--
-- Name: _hyper_1_9_chunk metadata; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;


--
-- Name: _hyper_1_9_chunk created_at; Type: DEFAULT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk ALTER COLUMN created_at SET DEFAULT now();


--
-- Name: connector_event_dedup id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.connector_event_dedup ALTER COLUMN id SET DEFAULT nextval('public.connector_event_dedup_id_seq'::regclass);


--
-- Name: retention_purge_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_purge_logs ALTER COLUMN id SET DEFAULT nextval('public.retention_purge_logs_id_seq'::regclass);


--
-- Name: _hyper_1_100_chunk 100_262_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk
    ADD CONSTRAINT "100_262_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_104_chunk 104_267_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk
    ADD CONSTRAINT "104_267_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_10_chunk 10_47_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk
    ADD CONSTRAINT "10_47_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_11_chunk 11_52_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk
    ADD CONSTRAINT "11_52_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_12_chunk 12_57_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk
    ADD CONSTRAINT "12_57_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_13_chunk 13_62_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk
    ADD CONSTRAINT "13_62_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_14_chunk 14_67_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk
    ADD CONSTRAINT "14_67_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_15_chunk 15_72_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk
    ADD CONSTRAINT "15_72_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_16_chunk 16_77_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk
    ADD CONSTRAINT "16_77_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_17_chunk 17_82_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk
    ADD CONSTRAINT "17_82_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_18_chunk 18_87_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk
    ADD CONSTRAINT "18_87_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_19_chunk 19_92_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk
    ADD CONSTRAINT "19_92_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_1_chunk 1_2_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk
    ADD CONSTRAINT "1_2_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_20_chunk 20_97_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk
    ADD CONSTRAINT "20_97_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_21_chunk 21_102_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk
    ADD CONSTRAINT "21_102_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_22_chunk 22_107_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk
    ADD CONSTRAINT "22_107_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_23_chunk 23_112_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk
    ADD CONSTRAINT "23_112_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_24_chunk 24_117_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk
    ADD CONSTRAINT "24_117_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_25_chunk 25_122_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk
    ADD CONSTRAINT "25_122_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_26_chunk 26_127_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk
    ADD CONSTRAINT "26_127_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_27_chunk 27_132_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk
    ADD CONSTRAINT "27_132_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_28_chunk 28_137_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk
    ADD CONSTRAINT "28_137_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_29_chunk 29_142_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk
    ADD CONSTRAINT "29_142_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_2_chunk 2_7_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk
    ADD CONSTRAINT "2_7_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_30_chunk 30_147_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk
    ADD CONSTRAINT "30_147_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_31_chunk 31_152_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk
    ADD CONSTRAINT "31_152_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_32_chunk 32_157_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk
    ADD CONSTRAINT "32_157_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_33_chunk 33_162_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk
    ADD CONSTRAINT "33_162_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_34_chunk 34_167_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk
    ADD CONSTRAINT "34_167_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_35_chunk 35_172_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk
    ADD CONSTRAINT "35_172_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_36_chunk 36_177_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk
    ADD CONSTRAINT "36_177_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_37_chunk 37_182_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk
    ADD CONSTRAINT "37_182_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_38_chunk 38_187_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk
    ADD CONSTRAINT "38_187_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_39_chunk 39_192_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk
    ADD CONSTRAINT "39_192_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_3_chunk 3_12_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk
    ADD CONSTRAINT "3_12_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_40_chunk 40_197_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk
    ADD CONSTRAINT "40_197_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_41_chunk 41_202_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk
    ADD CONSTRAINT "41_202_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_42_chunk 42_207_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk
    ADD CONSTRAINT "42_207_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_43_chunk 43_212_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk
    ADD CONSTRAINT "43_212_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_44_chunk 44_217_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk
    ADD CONSTRAINT "44_217_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_45_chunk 45_222_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk
    ADD CONSTRAINT "45_222_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_47_chunk 47_227_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk
    ADD CONSTRAINT "47_227_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_48_chunk 48_232_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk
    ADD CONSTRAINT "48_232_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_4_chunk 4_17_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk
    ADD CONSTRAINT "4_17_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_5_chunk 5_22_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk
    ADD CONSTRAINT "5_22_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_6_chunk 6_27_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk
    ADD CONSTRAINT "6_27_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_7_chunk 7_32_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk
    ADD CONSTRAINT "7_32_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_89_chunk 89_237_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk
    ADD CONSTRAINT "89_237_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_8_chunk 8_37_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk
    ADD CONSTRAINT "8_37_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_92_chunk 92_242_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk
    ADD CONSTRAINT "92_242_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_94_chunk 94_247_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk
    ADD CONSTRAINT "94_247_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_95_chunk 95_252_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk
    ADD CONSTRAINT "95_252_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_98_chunk 98_257_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk
    ADD CONSTRAINT "98_257_tool_events_pkey" PRIMARY KEY (id, occurred_at);


--
-- Name: _hyper_1_9_chunk 9_42_tool_events_pkey; Type: CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk
    ADD CONSTRAINT "9_42_tool_events_pkey" PRIMARY KEY (id, occurred_at);


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
-- Name: notification_routes notification_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routes
    ADD CONSTRAINT notification_routes_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


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
-- Name: retention_purge_logs retention_purge_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_purge_logs
    ADD CONSTRAINT retention_purge_logs_pkey PRIMARY KEY (id);


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
-- Name: user_personal_settings user_personal_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personal_settings
    ADD CONSTRAINT user_personal_settings_pkey PRIMARY KEY (id);


--
-- Name: user_project_favorites user_project_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_project_favorites
    ADD CONSTRAINT user_project_favorites_pkey PRIMARY KEY (id);


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
-- Name: _hyper_1_100_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_100_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_100_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_100_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_100_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_100_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_100_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_100_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_100_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_100_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_100_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_100_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_100_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_100_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_100_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_100_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_100_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_104_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_104_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_104_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_104_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_104_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_104_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_104_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_104_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_104_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_104_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_104_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_10_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_10_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_10_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_10_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_10_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_10_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_10_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_10_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_10_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_10_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_10_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_11_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_11_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_11_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_11_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_11_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_11_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_11_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_11_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_11_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_11_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_11_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_12_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_12_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_12_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_12_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_12_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_12_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_12_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_12_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_12_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_12_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_12_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_13_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_13_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_13_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_13_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_13_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_13_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_13_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_13_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_13_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_13_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_13_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_14_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_14_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_14_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_14_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_14_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_14_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_14_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_14_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_14_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_14_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_14_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_15_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_15_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_15_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_15_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_15_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_15_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_15_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_15_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_15_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_15_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_15_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_16_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_16_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_16_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_16_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_16_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_16_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_16_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_16_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_16_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_16_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_16_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_17_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_17_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_17_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_17_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_17_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_17_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_17_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_17_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_17_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_17_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_17_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_18_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_18_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_18_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_18_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_18_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_18_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_18_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_18_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_18_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_18_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_18_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_19_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_19_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_19_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_19_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_19_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_19_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_19_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_19_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_19_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_19_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_19_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_1_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_1_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_1_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_1_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_1_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_1_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_1_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_1_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_1_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_1_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_1_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_20_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_20_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_20_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_20_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_20_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_20_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_20_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_20_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_20_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_20_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_20_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_21_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_21_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_21_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_21_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_21_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_21_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_21_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_21_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_21_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_21_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_21_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_22_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_22_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_22_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_22_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_22_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_22_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_22_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_22_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_22_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_22_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_22_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_23_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_23_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_23_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_23_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_23_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_23_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_23_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_23_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_23_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_23_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_23_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_24_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_24_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_24_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_24_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_24_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_24_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_24_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_24_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_24_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_24_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_24_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_25_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_25_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_25_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_25_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_25_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_25_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_25_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_25_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_25_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_25_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_25_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_26_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_26_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_26_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_26_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_26_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_26_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_26_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_26_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_26_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_26_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_26_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_27_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_27_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_27_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_27_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_27_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_27_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_27_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_27_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_27_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_27_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_27_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_28_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_28_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_28_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_28_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_28_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_28_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_28_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_28_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_28_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_28_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_28_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_29_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_29_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_29_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_29_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_29_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_29_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_29_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_29_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_29_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_29_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_29_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_2_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_2_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_2_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_2_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_2_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_2_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_2_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_2_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_2_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_2_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_2_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_30_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_30_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_30_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_30_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_30_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_30_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_30_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_30_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_30_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_30_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_30_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_31_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_31_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_31_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_31_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_31_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_31_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_31_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_31_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_31_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_31_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_31_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_32_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_32_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_32_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_32_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_32_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_32_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_32_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_32_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_32_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_32_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_32_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_33_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_33_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_33_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_33_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_33_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_33_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_33_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_33_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_33_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_33_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_33_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_34_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_34_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_34_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_34_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_34_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_34_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_34_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_34_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_34_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_34_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_34_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_35_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_35_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_35_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_35_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_35_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_35_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_35_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_35_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_35_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_35_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_35_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_36_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_36_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_36_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_36_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_36_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_36_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_36_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_36_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_36_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_36_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_36_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_37_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_37_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_37_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_37_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_37_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_37_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_37_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_37_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_37_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_37_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_37_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_38_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_38_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_38_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_38_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_38_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_38_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_38_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_38_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_38_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_38_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_38_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_39_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_39_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_39_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_39_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_39_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_39_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_39_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_39_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_39_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_39_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_39_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_3_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_3_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_3_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_3_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_3_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_3_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_3_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_3_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_3_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_3_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_3_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_40_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_40_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_40_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_40_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_40_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_40_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_40_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_40_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_40_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_40_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_40_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_41_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_41_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_41_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_41_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_41_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_41_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_41_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_41_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_41_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_41_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_41_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_42_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_42_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_42_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_42_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_42_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_42_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_42_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_42_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_42_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_42_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_42_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_43_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_43_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_43_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_43_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_43_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_43_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_43_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_43_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_43_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_43_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_43_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_44_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_44_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_44_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_44_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_44_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_44_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_44_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_44_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_44_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_44_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_44_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_45_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_45_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_45_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_45_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_45_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_45_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_45_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_45_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_45_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_45_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_45_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_47_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_47_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_47_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_47_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_47_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_47_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_47_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_47_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_47_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_47_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_47_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_48_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_48_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_48_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_48_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_48_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_48_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_48_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_48_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_48_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_48_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_48_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_4_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_4_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_4_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_4_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_4_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_4_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_4_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_4_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_4_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_4_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_4_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_5_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_5_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_5_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_5_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_5_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_5_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_5_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_5_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_5_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_5_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_5_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_6_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_6_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_6_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_6_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_6_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_6_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_6_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_6_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_6_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_6_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_6_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_7_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_7_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_7_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_7_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_7_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_7_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_7_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_7_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_7_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_7_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_7_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_89_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_89_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_89_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_89_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_89_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_89_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_89_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_89_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_89_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_89_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_89_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_8_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_8_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_8_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_8_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_8_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_8_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_8_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_8_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_8_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_8_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_8_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_92_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_92_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_92_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_92_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_92_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_92_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_92_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_92_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_92_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_92_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_92_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_94_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_94_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_94_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_94_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_94_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_94_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_94_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_94_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_94_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_94_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_94_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_95_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_95_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_95_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_95_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_95_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_95_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_95_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_95_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_95_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_95_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_95_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_98_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_98_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_98_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_98_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_98_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_98_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_98_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_98_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_98_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_98_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_98_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_external_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_external_id ON _timescaledb_internal._hyper_1_9_chunk USING btree (organization_id, ((metadata ->> 'external_id'::text))) WHERE ((metadata ->> 'external_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_org_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_org_occurred ON _timescaledb_internal._hyper_1_9_chunk USING btree (organization_id, occurred_at DESC);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_org_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_org_tool_occurred ON _timescaledb_internal._hyper_1_9_chunk USING btree (organization_id, tool_name, occurred_at DESC);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_project_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_project_occurred ON _timescaledb_internal._hyper_1_9_chunk USING btree (project_id, occurred_at DESC);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_session_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_session_id ON _timescaledb_internal._hyper_1_9_chunk USING btree (((metadata ->> 'session_id'::text))) WHERE ((metadata ->> 'session_id'::text) IS NOT NULL);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_tool_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_tool_occurred ON _timescaledb_internal._hyper_1_9_chunk USING btree (tool_name, occurred_at DESC);


--
-- Name: _hyper_1_9_chunk_idx_tool_events_user_occurred; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_idx_tool_events_user_occurred ON _timescaledb_internal._hyper_1_9_chunk USING btree (user_id, occurred_at DESC);


--
-- Name: _hyper_1_9_chunk_tool_events_occurred_at_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_1_9_chunk_tool_events_occurred_at_idx ON _timescaledb_internal._hyper_1_9_chunk USING btree (occurred_at DESC);


--
-- Name: _hyper_3_105_chunk__materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_105_chunk__materialized_hypertable_3_bucket_idx ON _timescaledb_internal._hyper_3_105_chunk USING btree (bucket DESC);


--
-- Name: _hyper_3_105_chunk__materialized_hypertable_3_event_type_bucket; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_105_chunk__materialized_hypertable_3_event_type_bucket ON _timescaledb_internal._hyper_3_105_chunk USING btree (event_type, bucket DESC);


--
-- Name: _hyper_3_105_chunk__materialized_hypertable_3_organization_id_b; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_105_chunk__materialized_hypertable_3_organization_id_b ON _timescaledb_internal._hyper_3_105_chunk USING btree (organization_id, bucket DESC);


--
-- Name: _hyper_3_105_chunk__materialized_hypertable_3_project_id_bucket; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_105_chunk__materialized_hypertable_3_project_id_bucket ON _timescaledb_internal._hyper_3_105_chunk USING btree (project_id, bucket DESC);


--
-- Name: _hyper_3_105_chunk__materialized_hypertable_3_tool_name_bucket_; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_105_chunk__materialized_hypertable_3_tool_name_bucket_ ON _timescaledb_internal._hyper_3_105_chunk USING btree (tool_name, bucket DESC);


--
-- Name: _hyper_3_105_chunk__materialized_hypertable_3_user_id_bucket_id; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_105_chunk__materialized_hypertable_3_user_id_bucket_id ON _timescaledb_internal._hyper_3_105_chunk USING btree (user_id, bucket DESC);


--
-- Name: _hyper_3_46_chunk__materialized_hypertable_3_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_46_chunk__materialized_hypertable_3_bucket_idx ON _timescaledb_internal._hyper_3_46_chunk USING btree (bucket DESC);


--
-- Name: _hyper_3_46_chunk__materialized_hypertable_3_event_type_bucket_; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_46_chunk__materialized_hypertable_3_event_type_bucket_ ON _timescaledb_internal._hyper_3_46_chunk USING btree (event_type, bucket DESC);


--
-- Name: _hyper_3_46_chunk__materialized_hypertable_3_organization_id_bu; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_46_chunk__materialized_hypertable_3_organization_id_bu ON _timescaledb_internal._hyper_3_46_chunk USING btree (organization_id, bucket DESC);


--
-- Name: _hyper_3_46_chunk__materialized_hypertable_3_project_id_bucket_; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_46_chunk__materialized_hypertable_3_project_id_bucket_ ON _timescaledb_internal._hyper_3_46_chunk USING btree (project_id, bucket DESC);


--
-- Name: _hyper_3_46_chunk__materialized_hypertable_3_tool_name_bucket_i; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_46_chunk__materialized_hypertable_3_tool_name_bucket_i ON _timescaledb_internal._hyper_3_46_chunk USING btree (tool_name, bucket DESC);


--
-- Name: _hyper_3_46_chunk__materialized_hypertable_3_user_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_3_46_chunk__materialized_hypertable_3_user_id_bucket_idx ON _timescaledb_internal._hyper_3_46_chunk USING btree (user_id, bucket DESC);


--
-- Name: _hyper_4_90_chunk__materialized_hypertable_4_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_4_90_chunk__materialized_hypertable_4_bucket_idx ON _timescaledb_internal._hyper_4_90_chunk USING btree (bucket DESC);


--
-- Name: _hyper_4_90_chunk__materialized_hypertable_4_event_type_bucket_; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_4_90_chunk__materialized_hypertable_4_event_type_bucket_ ON _timescaledb_internal._hyper_4_90_chunk USING btree (event_type, bucket DESC);


--
-- Name: _hyper_4_90_chunk__materialized_hypertable_4_organization_id_bu; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_4_90_chunk__materialized_hypertable_4_organization_id_bu ON _timescaledb_internal._hyper_4_90_chunk USING btree (organization_id, bucket DESC);


--
-- Name: _hyper_4_90_chunk__materialized_hypertable_4_project_id_bucket_; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_4_90_chunk__materialized_hypertable_4_project_id_bucket_ ON _timescaledb_internal._hyper_4_90_chunk USING btree (project_id, bucket DESC);


--
-- Name: _hyper_4_90_chunk__materialized_hypertable_4_tool_name_bucket_i; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_4_90_chunk__materialized_hypertable_4_tool_name_bucket_i ON _timescaledb_internal._hyper_4_90_chunk USING btree (tool_name, bucket DESC);


--
-- Name: _hyper_4_90_chunk__materialized_hypertable_4_user_id_bucket_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX _hyper_4_90_chunk__materialized_hypertable_4_user_id_bucket_idx ON _timescaledb_internal._hyper_4_90_chunk USING btree (user_id, bucket DESC);


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
-- Name: compress_hyper_2_101_chunk_organization_id_user_id__ts_meta_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_101_chunk_organization_id_user_id__ts_meta_idx ON _timescaledb_internal.compress_hyper_2_101_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_102_chunk_organization_id_user_id__ts_meta_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_102_chunk_organization_id_user_id__ts_meta_idx ON _timescaledb_internal.compress_hyper_2_102_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_103_chunk_organization_id_user_id__ts_meta_idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_103_chunk_organization_id_user_id__ts_meta_idx ON _timescaledb_internal.compress_hyper_2_103_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_49_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_49_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_49_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_50_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_50_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_50_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_51_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_51_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_51_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_52_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_52_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_52_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_53_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_53_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_53_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_54_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_54_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_54_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_55_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_55_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_55_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_56_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_56_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_56_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_57_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_57_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_57_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_58_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_58_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_58_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_59_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_59_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_59_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_60_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_60_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_60_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_61_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_61_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_61_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_62_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_62_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_62_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_63_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_63_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_63_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_64_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_64_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_64_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_65_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_65_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_65_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_66_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_66_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_66_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_67_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_67_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_67_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_68_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_68_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_68_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_69_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_69_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_69_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_70_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_70_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_70_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_71_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_71_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_71_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_72_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_72_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_72_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_73_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_73_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_73_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_74_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_74_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_74_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_75_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_75_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_75_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_76_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_76_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_76_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_77_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_77_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_77_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_78_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_78_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_78_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_79_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_79_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_79_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_80_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_80_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_80_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_81_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_81_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_81_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_82_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_82_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_82_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_83_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_83_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_83_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_84_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_84_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_84_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_85_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_85_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_85_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_86_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_86_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_86_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_87_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_87_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_87_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_88_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_88_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_88_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_91_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_91_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_91_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_93_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_93_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_93_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_96_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_96_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_96_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_97_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_97_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_97_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: compress_hyper_2_99_chunk_organization_id_user_id__ts_meta__idx; Type: INDEX; Schema: _timescaledb_internal; Owner: -
--

CREATE INDEX compress_hyper_2_99_chunk_organization_id_user_id__ts_meta__idx ON _timescaledb_internal.compress_hyper_2_99_chunk USING btree (organization_id, user_id, _ts_meta_min_1 DESC, _ts_meta_max_1 DESC);


--
-- Name: idx_connector_event_dedup_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_connector_event_dedup_event_id ON public.connector_event_dedup USING btree (tool_event_id);


--
-- Name: idx_connector_event_dedup_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_connector_event_dedup_lookup ON public.connector_event_dedup USING btree (organization_id, tool_name, event_type, unique_key, unique_value);


--
-- Name: idx_notification_routes_role_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_notification_routes_role_unique ON public.notification_routes USING btree (organization_id, notification_type, recipient_role) WHERE ((recipient_type)::text = 'role'::text);


--
-- Name: idx_notification_routes_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_notification_routes_user_unique ON public.notification_routes USING btree (organization_id, notification_type, recipient_user_id) WHERE ((recipient_type)::text = 'user'::text);


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
-- Name: index_admin_audit_logs_on_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_admin_audit_logs_on_created_at_desc ON public.admin_audit_logs USING btree (created_at DESC);


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
-- Name: index_notification_routes_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_notification_routes_on_organization_id ON public.notification_routes USING btree (organization_id);


--
-- Name: index_notification_routes_on_recipient_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_notification_routes_on_recipient_user_id ON public.notification_routes USING btree (recipient_user_id);


--
-- Name: index_notifications_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_notifications_on_organization_id ON public.notifications USING btree (organization_id);


--
-- Name: index_notifications_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_notifications_on_user_id ON public.notifications USING btree (user_id);


--
-- Name: index_notifications_on_user_id_and_read_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_notifications_on_user_id_and_read_at ON public.notifications USING btree (user_id, read_at);


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
-- Name: index_organization_audit_logs_on_org_id_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_organization_audit_logs_on_org_id_and_created_at ON public.organization_audit_logs USING btree (organization_id, created_at DESC);


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
-- Name: index_project_audit_logs_on_project_id_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_project_audit_logs_on_project_id_and_created_at ON public.project_audit_logs USING btree (project_id, created_at DESC);


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
-- Name: index_retention_purge_logs_on_job_run_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_retention_purge_logs_on_job_run_at ON public.retention_purge_logs USING btree (job_run_at);


--
-- Name: index_retention_purge_logs_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_retention_purge_logs_on_organization_id ON public.retention_purge_logs USING btree (organization_id);


--
-- Name: index_retention_purge_logs_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_retention_purge_logs_on_project_id ON public.retention_purge_logs USING btree (project_id);


--
-- Name: index_sanitization_policies_on_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_sanitization_policies_on_is_active ON public.sanitization_policies USING btree (is_active) WHERE (is_active = true);


--
-- Name: index_sanitization_policies_on_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_sanitization_policies_on_version ON public.sanitization_policies USING btree (version);


--
-- Name: index_user_personal_settings_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_personal_settings_on_user_id ON public.user_personal_settings USING btree (user_id);


--
-- Name: index_user_project_favorites_on_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_user_project_favorites_on_project_id ON public.user_project_favorites USING btree (project_id);


--
-- Name: index_user_project_favorites_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_user_project_favorites_on_user_id ON public.user_project_favorites USING btree (user_id);


--
-- Name: index_user_project_favorites_on_user_id_and_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_project_favorites_on_user_id_and_project_id ON public.user_project_favorites USING btree (user_id, project_id);


--
-- Name: index_user_settings_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_user_settings_on_user_id ON public.user_settings USING btree (user_id);


--
-- Name: index_user_settings_on_user_id_and_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_settings_on_user_id_and_key ON public.user_settings USING btree (user_id, key);


--
-- Name: index_user_tool_accounts_on_connection_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_user_tool_accounts_on_connection_state ON public.user_tool_accounts USING btree (connection_state);


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
-- Name: retention_purge_logs retention_purge_logs_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER retention_purge_logs_append_only BEFORE DELETE OR UPDATE ON public.retention_purge_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_retention_purge_log_mutation();


--
-- Name: _hyper_1_100_chunk 100_261_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk
    ADD CONSTRAINT "100_261_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_100_chunk 100_263_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk
    ADD CONSTRAINT "100_263_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_100_chunk 100_264_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk
    ADD CONSTRAINT "100_264_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_100_chunk 100_265_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_100_chunk
    ADD CONSTRAINT "100_265_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_104_chunk 104_266_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk
    ADD CONSTRAINT "104_266_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_104_chunk 104_268_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk
    ADD CONSTRAINT "104_268_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_104_chunk 104_269_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk
    ADD CONSTRAINT "104_269_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_104_chunk 104_270_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_104_chunk
    ADD CONSTRAINT "104_270_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_10_chunk 10_46_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk
    ADD CONSTRAINT "10_46_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_10_chunk 10_48_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk
    ADD CONSTRAINT "10_48_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_10_chunk 10_49_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk
    ADD CONSTRAINT "10_49_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_10_chunk 10_50_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_10_chunk
    ADD CONSTRAINT "10_50_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_11_chunk 11_51_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk
    ADD CONSTRAINT "11_51_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_11_chunk 11_53_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk
    ADD CONSTRAINT "11_53_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_11_chunk 11_54_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk
    ADD CONSTRAINT "11_54_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_11_chunk 11_55_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_11_chunk
    ADD CONSTRAINT "11_55_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_12_chunk 12_56_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk
    ADD CONSTRAINT "12_56_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_12_chunk 12_58_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk
    ADD CONSTRAINT "12_58_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_12_chunk 12_59_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk
    ADD CONSTRAINT "12_59_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_12_chunk 12_60_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_12_chunk
    ADD CONSTRAINT "12_60_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_13_chunk 13_61_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk
    ADD CONSTRAINT "13_61_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_13_chunk 13_63_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk
    ADD CONSTRAINT "13_63_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_13_chunk 13_64_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk
    ADD CONSTRAINT "13_64_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_13_chunk 13_65_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_13_chunk
    ADD CONSTRAINT "13_65_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_14_chunk 14_66_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk
    ADD CONSTRAINT "14_66_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_14_chunk 14_68_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk
    ADD CONSTRAINT "14_68_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_14_chunk 14_69_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk
    ADD CONSTRAINT "14_69_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_14_chunk 14_70_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_14_chunk
    ADD CONSTRAINT "14_70_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_15_chunk 15_71_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk
    ADD CONSTRAINT "15_71_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_15_chunk 15_73_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk
    ADD CONSTRAINT "15_73_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_15_chunk 15_74_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk
    ADD CONSTRAINT "15_74_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_15_chunk 15_75_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_15_chunk
    ADD CONSTRAINT "15_75_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_16_chunk 16_76_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk
    ADD CONSTRAINT "16_76_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_16_chunk 16_78_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk
    ADD CONSTRAINT "16_78_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_16_chunk 16_79_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk
    ADD CONSTRAINT "16_79_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_16_chunk 16_80_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_16_chunk
    ADD CONSTRAINT "16_80_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_17_chunk 17_81_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk
    ADD CONSTRAINT "17_81_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_17_chunk 17_83_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk
    ADD CONSTRAINT "17_83_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_17_chunk 17_84_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk
    ADD CONSTRAINT "17_84_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_17_chunk 17_85_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_17_chunk
    ADD CONSTRAINT "17_85_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_18_chunk 18_86_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk
    ADD CONSTRAINT "18_86_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_18_chunk 18_88_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk
    ADD CONSTRAINT "18_88_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_18_chunk 18_89_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk
    ADD CONSTRAINT "18_89_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_18_chunk 18_90_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_18_chunk
    ADD CONSTRAINT "18_90_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_19_chunk 19_91_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk
    ADD CONSTRAINT "19_91_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_19_chunk 19_93_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk
    ADD CONSTRAINT "19_93_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_19_chunk 19_94_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk
    ADD CONSTRAINT "19_94_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_19_chunk 19_95_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_19_chunk
    ADD CONSTRAINT "19_95_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_1_chunk 1_1_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk
    ADD CONSTRAINT "1_1_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_1_chunk 1_3_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk
    ADD CONSTRAINT "1_3_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_1_chunk 1_4_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk
    ADD CONSTRAINT "1_4_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_1_chunk 1_5_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_1_chunk
    ADD CONSTRAINT "1_5_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_20_chunk 20_100_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk
    ADD CONSTRAINT "20_100_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_20_chunk 20_96_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk
    ADD CONSTRAINT "20_96_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_20_chunk 20_98_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk
    ADD CONSTRAINT "20_98_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_20_chunk 20_99_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_20_chunk
    ADD CONSTRAINT "20_99_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_21_chunk 21_101_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk
    ADD CONSTRAINT "21_101_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_21_chunk 21_103_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk
    ADD CONSTRAINT "21_103_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_21_chunk 21_104_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk
    ADD CONSTRAINT "21_104_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_21_chunk 21_105_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_21_chunk
    ADD CONSTRAINT "21_105_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_22_chunk 22_106_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk
    ADD CONSTRAINT "22_106_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_22_chunk 22_108_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk
    ADD CONSTRAINT "22_108_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_22_chunk 22_109_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk
    ADD CONSTRAINT "22_109_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_22_chunk 22_110_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_22_chunk
    ADD CONSTRAINT "22_110_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_23_chunk 23_111_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk
    ADD CONSTRAINT "23_111_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_23_chunk 23_113_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk
    ADD CONSTRAINT "23_113_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_23_chunk 23_114_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk
    ADD CONSTRAINT "23_114_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_23_chunk 23_115_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_23_chunk
    ADD CONSTRAINT "23_115_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_24_chunk 24_116_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk
    ADD CONSTRAINT "24_116_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_24_chunk 24_118_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk
    ADD CONSTRAINT "24_118_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_24_chunk 24_119_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk
    ADD CONSTRAINT "24_119_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_24_chunk 24_120_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_24_chunk
    ADD CONSTRAINT "24_120_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_25_chunk 25_121_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk
    ADD CONSTRAINT "25_121_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_25_chunk 25_123_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk
    ADD CONSTRAINT "25_123_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_25_chunk 25_124_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk
    ADD CONSTRAINT "25_124_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_25_chunk 25_125_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_25_chunk
    ADD CONSTRAINT "25_125_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_26_chunk 26_126_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk
    ADD CONSTRAINT "26_126_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_26_chunk 26_128_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk
    ADD CONSTRAINT "26_128_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_26_chunk 26_129_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk
    ADD CONSTRAINT "26_129_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_26_chunk 26_130_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_26_chunk
    ADD CONSTRAINT "26_130_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_27_chunk 27_131_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk
    ADD CONSTRAINT "27_131_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_27_chunk 27_133_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk
    ADD CONSTRAINT "27_133_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_27_chunk 27_134_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk
    ADD CONSTRAINT "27_134_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_27_chunk 27_135_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_27_chunk
    ADD CONSTRAINT "27_135_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_28_chunk 28_136_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk
    ADD CONSTRAINT "28_136_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_28_chunk 28_138_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk
    ADD CONSTRAINT "28_138_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_28_chunk 28_139_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk
    ADD CONSTRAINT "28_139_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_28_chunk 28_140_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_28_chunk
    ADD CONSTRAINT "28_140_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_29_chunk 29_141_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk
    ADD CONSTRAINT "29_141_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_29_chunk 29_143_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk
    ADD CONSTRAINT "29_143_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_29_chunk 29_144_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk
    ADD CONSTRAINT "29_144_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_29_chunk 29_145_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_29_chunk
    ADD CONSTRAINT "29_145_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_2_chunk 2_10_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk
    ADD CONSTRAINT "2_10_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_2_chunk 2_6_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk
    ADD CONSTRAINT "2_6_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_2_chunk 2_8_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk
    ADD CONSTRAINT "2_8_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_2_chunk 2_9_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_2_chunk
    ADD CONSTRAINT "2_9_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_30_chunk 30_146_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk
    ADD CONSTRAINT "30_146_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_30_chunk 30_148_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk
    ADD CONSTRAINT "30_148_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_30_chunk 30_149_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk
    ADD CONSTRAINT "30_149_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_30_chunk 30_150_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_30_chunk
    ADD CONSTRAINT "30_150_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_31_chunk 31_151_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk
    ADD CONSTRAINT "31_151_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_31_chunk 31_153_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk
    ADD CONSTRAINT "31_153_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_31_chunk 31_154_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk
    ADD CONSTRAINT "31_154_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_31_chunk 31_155_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_31_chunk
    ADD CONSTRAINT "31_155_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_32_chunk 32_156_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk
    ADD CONSTRAINT "32_156_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_32_chunk 32_158_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk
    ADD CONSTRAINT "32_158_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_32_chunk 32_159_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk
    ADD CONSTRAINT "32_159_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_32_chunk 32_160_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_32_chunk
    ADD CONSTRAINT "32_160_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_33_chunk 33_161_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk
    ADD CONSTRAINT "33_161_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_33_chunk 33_163_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk
    ADD CONSTRAINT "33_163_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_33_chunk 33_164_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk
    ADD CONSTRAINT "33_164_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_33_chunk 33_165_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_33_chunk
    ADD CONSTRAINT "33_165_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_34_chunk 34_166_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk
    ADD CONSTRAINT "34_166_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_34_chunk 34_168_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk
    ADD CONSTRAINT "34_168_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_34_chunk 34_169_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk
    ADD CONSTRAINT "34_169_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_34_chunk 34_170_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_34_chunk
    ADD CONSTRAINT "34_170_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_35_chunk 35_171_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk
    ADD CONSTRAINT "35_171_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_35_chunk 35_173_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk
    ADD CONSTRAINT "35_173_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_35_chunk 35_174_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk
    ADD CONSTRAINT "35_174_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_35_chunk 35_175_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_35_chunk
    ADD CONSTRAINT "35_175_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_36_chunk 36_176_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk
    ADD CONSTRAINT "36_176_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_36_chunk 36_178_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk
    ADD CONSTRAINT "36_178_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_36_chunk 36_179_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk
    ADD CONSTRAINT "36_179_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_36_chunk 36_180_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_36_chunk
    ADD CONSTRAINT "36_180_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_37_chunk 37_181_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk
    ADD CONSTRAINT "37_181_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_37_chunk 37_183_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk
    ADD CONSTRAINT "37_183_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_37_chunk 37_184_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk
    ADD CONSTRAINT "37_184_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_37_chunk 37_185_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_37_chunk
    ADD CONSTRAINT "37_185_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_38_chunk 38_186_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk
    ADD CONSTRAINT "38_186_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_38_chunk 38_188_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk
    ADD CONSTRAINT "38_188_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_38_chunk 38_189_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk
    ADD CONSTRAINT "38_189_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_38_chunk 38_190_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_38_chunk
    ADD CONSTRAINT "38_190_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_39_chunk 39_191_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk
    ADD CONSTRAINT "39_191_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_39_chunk 39_193_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk
    ADD CONSTRAINT "39_193_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_39_chunk 39_194_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk
    ADD CONSTRAINT "39_194_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_39_chunk 39_195_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_39_chunk
    ADD CONSTRAINT "39_195_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_3_chunk 3_11_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk
    ADD CONSTRAINT "3_11_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_3_chunk 3_13_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk
    ADD CONSTRAINT "3_13_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_3_chunk 3_14_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk
    ADD CONSTRAINT "3_14_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_3_chunk 3_15_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_3_chunk
    ADD CONSTRAINT "3_15_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_40_chunk 40_196_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk
    ADD CONSTRAINT "40_196_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_40_chunk 40_198_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk
    ADD CONSTRAINT "40_198_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_40_chunk 40_199_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk
    ADD CONSTRAINT "40_199_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_40_chunk 40_200_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_40_chunk
    ADD CONSTRAINT "40_200_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_41_chunk 41_201_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk
    ADD CONSTRAINT "41_201_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_41_chunk 41_203_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk
    ADD CONSTRAINT "41_203_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_41_chunk 41_204_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk
    ADD CONSTRAINT "41_204_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_41_chunk 41_205_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_41_chunk
    ADD CONSTRAINT "41_205_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_42_chunk 42_206_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk
    ADD CONSTRAINT "42_206_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_42_chunk 42_208_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk
    ADD CONSTRAINT "42_208_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_42_chunk 42_209_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk
    ADD CONSTRAINT "42_209_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_42_chunk 42_210_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_42_chunk
    ADD CONSTRAINT "42_210_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_43_chunk 43_211_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk
    ADD CONSTRAINT "43_211_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_43_chunk 43_213_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk
    ADD CONSTRAINT "43_213_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_43_chunk 43_214_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk
    ADD CONSTRAINT "43_214_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_43_chunk 43_215_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_43_chunk
    ADD CONSTRAINT "43_215_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_44_chunk 44_216_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk
    ADD CONSTRAINT "44_216_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_44_chunk 44_218_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk
    ADD CONSTRAINT "44_218_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_44_chunk 44_219_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk
    ADD CONSTRAINT "44_219_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_44_chunk 44_220_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_44_chunk
    ADD CONSTRAINT "44_220_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_45_chunk 45_221_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk
    ADD CONSTRAINT "45_221_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_45_chunk 45_223_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk
    ADD CONSTRAINT "45_223_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_45_chunk 45_224_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk
    ADD CONSTRAINT "45_224_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_45_chunk 45_225_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_45_chunk
    ADD CONSTRAINT "45_225_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_47_chunk 47_226_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk
    ADD CONSTRAINT "47_226_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_47_chunk 47_228_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk
    ADD CONSTRAINT "47_228_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_47_chunk 47_229_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk
    ADD CONSTRAINT "47_229_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_47_chunk 47_230_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_47_chunk
    ADD CONSTRAINT "47_230_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_48_chunk 48_231_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk
    ADD CONSTRAINT "48_231_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_48_chunk 48_233_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk
    ADD CONSTRAINT "48_233_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_48_chunk 48_234_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk
    ADD CONSTRAINT "48_234_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_48_chunk 48_235_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_48_chunk
    ADD CONSTRAINT "48_235_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_4_chunk 4_16_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk
    ADD CONSTRAINT "4_16_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_4_chunk 4_18_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk
    ADD CONSTRAINT "4_18_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_4_chunk 4_19_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk
    ADD CONSTRAINT "4_19_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_4_chunk 4_20_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_4_chunk
    ADD CONSTRAINT "4_20_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_5_chunk 5_21_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk
    ADD CONSTRAINT "5_21_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_5_chunk 5_23_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk
    ADD CONSTRAINT "5_23_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_5_chunk 5_24_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk
    ADD CONSTRAINT "5_24_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_5_chunk 5_25_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_5_chunk
    ADD CONSTRAINT "5_25_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_6_chunk 6_26_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk
    ADD CONSTRAINT "6_26_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_6_chunk 6_28_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk
    ADD CONSTRAINT "6_28_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_6_chunk 6_29_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk
    ADD CONSTRAINT "6_29_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_6_chunk 6_30_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_6_chunk
    ADD CONSTRAINT "6_30_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_7_chunk 7_31_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk
    ADD CONSTRAINT "7_31_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_7_chunk 7_33_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk
    ADD CONSTRAINT "7_33_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_7_chunk 7_34_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk
    ADD CONSTRAINT "7_34_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_7_chunk 7_35_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_7_chunk
    ADD CONSTRAINT "7_35_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_89_chunk 89_236_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk
    ADD CONSTRAINT "89_236_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_89_chunk 89_238_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk
    ADD CONSTRAINT "89_238_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_89_chunk 89_239_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk
    ADD CONSTRAINT "89_239_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_89_chunk 89_240_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_89_chunk
    ADD CONSTRAINT "89_240_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_8_chunk 8_36_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk
    ADD CONSTRAINT "8_36_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_8_chunk 8_38_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk
    ADD CONSTRAINT "8_38_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_8_chunk 8_39_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk
    ADD CONSTRAINT "8_39_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_8_chunk 8_40_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_8_chunk
    ADD CONSTRAINT "8_40_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_92_chunk 92_241_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk
    ADD CONSTRAINT "92_241_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_92_chunk 92_243_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk
    ADD CONSTRAINT "92_243_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_92_chunk 92_244_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk
    ADD CONSTRAINT "92_244_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_92_chunk 92_245_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_92_chunk
    ADD CONSTRAINT "92_245_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_94_chunk 94_246_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk
    ADD CONSTRAINT "94_246_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_94_chunk 94_248_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk
    ADD CONSTRAINT "94_248_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_94_chunk 94_249_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk
    ADD CONSTRAINT "94_249_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_94_chunk 94_250_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_94_chunk
    ADD CONSTRAINT "94_250_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_95_chunk 95_251_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk
    ADD CONSTRAINT "95_251_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_95_chunk 95_253_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk
    ADD CONSTRAINT "95_253_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_95_chunk 95_254_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk
    ADD CONSTRAINT "95_254_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_95_chunk 95_255_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_95_chunk
    ADD CONSTRAINT "95_255_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_98_chunk 98_256_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk
    ADD CONSTRAINT "98_256_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_98_chunk 98_258_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk
    ADD CONSTRAINT "98_258_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_98_chunk 98_259_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk
    ADD CONSTRAINT "98_259_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_98_chunk 98_260_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_98_chunk
    ADD CONSTRAINT "98_260_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: _hyper_1_9_chunk 9_41_tool_events_organization_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk
    ADD CONSTRAINT "9_41_tool_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: _hyper_1_9_chunk 9_43_tool_events_project_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk
    ADD CONSTRAINT "9_43_tool_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: _hyper_1_9_chunk 9_44_tool_events_repository_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk
    ADD CONSTRAINT "9_44_tool_events_repository_id_fkey" FOREIGN KEY (repository_id) REFERENCES public.repositories(id);


--
-- Name: _hyper_1_9_chunk 9_45_tool_events_user_id_fkey; Type: FK CONSTRAINT; Schema: _timescaledb_internal; Owner: -
--

ALTER TABLE ONLY _timescaledb_internal._hyper_1_9_chunk
    ADD CONSTRAINT "9_45_tool_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id);


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
-- Name: notifications fk_rails_394d9847aa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_rails_394d9847aa FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


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
-- Name: user_personal_settings fk_rails_61a8fa50df; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_personal_settings
    ADD CONSTRAINT fk_rails_61a8fa50df FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: organization_audit_logs fk_rails_6b6833732b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_audit_logs
    ADD CONSTRAINT fk_rails_6b6833732b FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: retention_purge_logs fk_rails_6cfbc838f7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_purge_logs
    ADD CONSTRAINT fk_rails_6cfbc838f7 FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


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
-- Name: user_project_favorites fk_rails_73553a4f87; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_project_favorites
    ADD CONSTRAINT fk_rails_73553a4f87 FOREIGN KEY (project_id) REFERENCES public.projects(id);


--
-- Name: user_project_favorites fk_rails_770491029a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_project_favorites
    ADD CONSTRAINT fk_rails_770491029a FOREIGN KEY (user_id) REFERENCES public.users(id);


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
-- Name: notification_routes fk_rails_8c39011ce1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routes
    ADD CONSTRAINT fk_rails_8c39011ce1 FOREIGN KEY (recipient_user_id) REFERENCES public.users(id);


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
-- Name: notifications fk_rails_b080fb4855; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_rails_b080fb4855 FOREIGN KEY (user_id) REFERENCES public.users(id);


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
-- Name: notification_routes fk_rails_f38ba37cba; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_routes
    ADD CONSTRAINT fk_rails_f38ba37cba FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: admin_audit_logs fk_rails_f48ad7fa19; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT fk_rails_f48ad7fa19 FOREIGN KEY (admin_user_id) REFERENCES public.users(id);


--
-- Name: retention_purge_logs fk_rails_f79fa6fcf2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_purge_logs
    ADD CONSTRAINT fk_rails_f79fa6fcf2 FOREIGN KEY (project_id) REFERENCES public.projects(id);


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
('20260608000001'),
('20260527100000'),
('20260525234350'),
('20260525100001'),
('20260520000001'),
('20260514090000'),
('20260513161604'),
('20260513150002'),
('20260513150001'),
('20260513140003'),
('20260513140002'),
('20260513140001'),
('20260513120000'),
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

