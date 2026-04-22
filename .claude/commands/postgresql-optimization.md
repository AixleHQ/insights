---
description: PostgreSQL query optimization reference — EXPLAIN ANALYZE, index strategies, JSONB, window functions, full-text search, and monitoring. Use when optimizing slow queries or reviewing query performance.
---

# PostgreSQL Optimization

Expert PostgreSQL guidance. Focus on PostgreSQL-specific features, optimization patterns, and advanced capabilities.

## Query Optimization

### EXPLAIN ANALYZE

Always use with `BUFFERS` for full picture:

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) SELECT ...;
```

Key things to look for:
- **Seq Scan** on large tables → missing index
- **Nested Loop** with large outer result → consider Hash Join
- **High actual vs estimated rows** → outdated statistics, run `ANALYZE tbl`
- **Buffers: hit vs read** → cache miss ratio

### pg_stat_statements

```sql
-- Enable in postgresql.conf: shared_preload_libraries = 'pg_stat_statements'

-- Top 10 slowest queries
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Most called queries
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

## Index Strategies

```sql
-- Composite (most selective column first)
CREATE INDEX ON events (organization_id, occurred_at DESC);

-- Partial (hot subset)
CREATE INDEX ON jobs (created_at) WHERE status = 'pending';

-- Expression (computed search)
CREATE INDEX ON users (LOWER(email));

-- Covering (index-only scan)
CREATE INDEX ON orders (user_id) INCLUDE (status, total);

-- GIN for JSONB
CREATE INDEX ON metrics USING GIN (metadata);

-- GIN for full-text
CREATE INDEX ON documents USING GIN (to_tsvector('english', content));

-- BRIN for large time-ordered tables
CREATE INDEX ON events USING BRIN (occurred_at);
```

### Index Maintenance

```sql
-- Unused indexes (candidates for removal)
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- Index bloat check
SELECT indexname, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

## JSONB Operations

```sql
-- Containment (uses GIN index)
SELECT * FROM events WHERE metadata @> '{"type": "login"}';

-- Key existence
SELECT * FROM events WHERE metadata ? 'user_id';

-- Path extraction
SELECT metadata->>'user_id', metadata#>>'{context,ip}' FROM events;

-- Aggregation
SELECT jsonb_agg(metadata) FROM events WHERE occurred_at > now() - INTERVAL '1 day';

-- Update nested key
UPDATE events SET metadata = metadata || '{"processed": true}' WHERE id = $1;
```

## Array Operations

```sql
-- Containment
SELECT * FROM posts WHERE tags @> ARRAY['rails', 'api'];

-- Overlap
SELECT * FROM posts WHERE tags && ARRAY['rails', 'ruby'];

-- Any (scalar)
SELECT * FROM orders WHERE status = ANY(ARRAY['pending', 'processing']);

-- Aggregation
SELECT organization_id, array_agg(DISTINCT tool_name) as tools
FROM usage_events
GROUP BY organization_id;
```

## Window Functions & Analytics

```sql
-- Running total (useful for cumulative token usage)
SELECT date, tokens,
  SUM(tokens) OVER (PARTITION BY org_id ORDER BY date) AS running_total
FROM daily_usage;

-- Moving average (7-day)
SELECT date, tokens,
  AVG(tokens) OVER (
    PARTITION BY org_id
    ORDER BY date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS moving_avg_7d
FROM daily_usage;

-- Ranking
SELECT user_id, tokens,
  RANK() OVER (PARTITION BY org_id ORDER BY tokens DESC) AS rank,
  DENSE_RANK() OVER (PARTITION BY org_id ORDER BY tokens DESC) AS dense_rank
FROM monthly_usage;

-- Period-over-period comparison
SELECT date, tokens,
  LAG(tokens, 7) OVER (PARTITION BY org_id ORDER BY date) AS tokens_7d_ago,
  tokens - LAG(tokens, 7) OVER (PARTITION BY org_id ORDER BY date) AS delta
FROM daily_usage;
```

## Full-Text Search

```sql
-- Index
CREATE INDEX ON documents USING GIN (to_tsvector('english', content));

-- Query (always specify language)
SELECT * FROM documents
WHERE to_tsvector('english', content) @@ to_tsquery('english', 'rails & authentication')
ORDER BY ts_rank(to_tsvector('english', content), to_tsquery('english', 'rails & authentication')) DESC;

-- Multi-column search
SELECT * FROM documents
WHERE (to_tsvector('english', title) || to_tsvector('english', content))
  @@ plainto_tsquery('english', 'search terms');
```

## Pagination

```sql
-- Cursor-based (preferred for large datasets)
SELECT * FROM events
WHERE id > $last_id
ORDER BY id
LIMIT 20;

-- Keyset with compound key
SELECT * FROM events
WHERE (occurred_at, id) < ($last_time, $last_id)
ORDER BY occurred_at DESC, id DESC
LIMIT 20;

-- Avoid OFFSET on large datasets (scans all skipped rows)
```

## Connection & Memory

```sql
-- Active connections
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;

-- Long-running queries
SELECT pid, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > INTERVAL '5 seconds'
ORDER BY duration DESC;

-- Kill a query
SELECT pg_cancel_backend($pid);   -- graceful
SELECT pg_terminate_backend($pid); -- forceful
```

## TimescaleDB-Specific

```sql
-- Continuous aggregate (pre-computed rollups)
CREATE MATERIALIZED VIEW hourly_usage
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', occurred_at) AS bucket,
  organization_id,
  SUM(tokens) AS total_tokens,
  COUNT(*) AS event_count
FROM usage_events
GROUP BY bucket, organization_id;

-- Refresh policy
SELECT add_continuous_aggregate_policy('hourly_usage',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- Chunk info
SELECT * FROM timescaledb_information.chunks WHERE hypertable_name = 'usage_events';
```

## Optimization Checklist

**Before opening a PR with new queries:**
- [ ] Run `EXPLAIN ANALYZE` on all new queries against representative data volume
- [ ] FK columns have indexes
- [ ] Filters on large tables have supporting indexes
- [ ] No `OFFSET` pagination on large tables — use cursor-based
- [ ] No `SELECT *` in production queries — specify columns
- [ ] Aggregations on time-series use hypertable chunks efficiently
- [ ] JSONB queries use GIN-indexed containment operators, not casts
