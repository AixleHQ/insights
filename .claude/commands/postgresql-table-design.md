---
description: PostgreSQL schema design reference — data types, constraints, indexing, partitioning, TimescaleDB, and JSONB patterns. Use when designing or reviewing table schemas.
---

# PostgreSQL Table Design

## Core Rules

- PRIMARY KEY: prefer `BIGINT GENERATED ALWAYS AS IDENTITY`; use `UUID` only for global uniqueness/distributed systems.
- **Normalize first (3NF)**; denormalize only for measured, high-ROI reads.
- Add `NOT NULL` everywhere semantically required; use `DEFAULT`s for common values.
- **Index FK columns manually** — PostgreSQL does NOT auto-index them.
- Prefer `TIMESTAMPTZ` for time, `NUMERIC` for money, `TEXT` for strings, `BIGINT` for integers.

## PostgreSQL Gotchas

- Unquoted identifiers → lowercased. Use `snake_case`.
- `UNIQUE` allows multiple NULLs. Use `NULLS NOT DISTINCT` (PG15+) to restrict to one.
- FK indexes are NOT automatic — add them.
- No silent coercions — overflow errors out.
- Sequences have gaps (normal — don't fix).
- No clustered PK by default (unlike MySQL InnoDB).

## Data Types

### IDs
- `BIGINT GENERATED ALWAYS AS IDENTITY` — preferred
- `UUID` — only for distributed/federated systems. Use `gen_random_uuid()`

### Do NOT use
- `TIMESTAMP` (without timezone) → use `TIMESTAMPTZ`
- `CHAR(n)` or `VARCHAR(n)` → use `TEXT`
- `MONEY` type → use `NUMERIC`
- `SERIAL` → use `GENERATED ALWAYS AS IDENTITY`
- `TIMESTAMPTZ(0)` with precision → use `TIMESTAMPTZ`

### Recommended types
- Strings: `TEXT` (+ `CHECK (LENGTH(col) <= n)` if limits needed)
- Integers: `BIGINT` (preferred), `INTEGER` for smaller ranges
- Floats: `DOUBLE PRECISION`; `NUMERIC` for exact decimal arithmetic
- Booleans: `BOOLEAN NOT NULL`
- Enums: `CREATE TYPE ... AS ENUM` for small stable sets; `TEXT + CHECK` for evolving values
- Arrays: `TEXT[]`, `INTEGER[]` — index with GIN for containment
- JSONB: preferred over JSON; index with GIN

## Constraints

- **PK**: implicit UNIQUE + NOT NULL + B-tree index
- **FK**: always specify `ON DELETE/UPDATE` action; always add index on referencing column
- **UNIQUE**: use `NULLS NOT DISTINCT` (PG15+) to prevent duplicate NULLs
- **CHECK**: NULL passes check (three-valued logic) — combine with `NOT NULL` to fully enforce
- **EXCLUDE**: prevents overlapping values — `EXCLUDE USING gist (room_id WITH =, period WITH &&)`

## Indexing

- **B-tree**: default — equality/range (`=`, `<`, `>`, `BETWEEN`, `ORDER BY`)
- **Composite**: leftmost prefix rule — put most selective/filtered columns first
- **Covering**: `CREATE INDEX ON tbl (id) INCLUDE (name, email)` — index-only scans
- **Partial**: `CREATE INDEX ON tbl (user_id) WHERE status = 'active'`
- **Expression**: `CREATE INDEX ON tbl (LOWER(email))` — must match exactly in WHERE
- **GIN**: JSONB containment/existence, arrays, full-text search
- **GiST**: ranges, geometry, exclusion constraints
- **BRIN**: very large time-ordered tables — minimal storage, only works with natural order

## Partitioning

Use for tables > 100M rows where queries filter on partition key.

```sql
-- RANGE (time-series — most common for DB90)
CREATE TABLE events (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  occurred_at TIMESTAMPTZ NOT NULL,
  ...
) PARTITION BY RANGE (occurred_at);

CREATE TABLE events_2024_q1 PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
```

**TimescaleDB** automates time-based partitioning with retention policies and compression — prefer hypertables over manual range partitions for time-series data.

- **LIST**: discrete values — `PARTITION BY LIST (region)`
- **HASH**: even distribution — `PARTITION BY HASH (user_id)`
- No global UNIQUE constraints — include partition key in PK/UNIQUE

## JSONB

```sql
-- Default GIN index (containment + key existence)
CREATE INDEX ON tbl USING GIN (jsonb_col);

-- For containment-only heavy workloads (smaller index)
CREATE INDEX ON tbl USING GIN (jsonb_col jsonb_path_ops);

-- For equality/range on a specific field — extract to generated column
ALTER TABLE tbl ADD COLUMN price INT
  GENERATED ALWAYS AS ((jsonb_col->>'price')::INT) STORED;
CREATE INDEX ON tbl (price);
```

Rules:
- Keep core relations in tables; use JSONB for optional/variable attributes
- Add constraints: `config JSONB NOT NULL CHECK(jsonb_typeof(config) = 'object')`

## TimescaleDB Extensions

```sql
-- Convert existing table to hypertable
SELECT create_hypertable('events', 'occurred_at');

-- Retention policy (drop data older than 90 days)
SELECT add_retention_policy('events', INTERVAL '90 days');

-- Compression policy
SELECT add_compression_policy('events', INTERVAL '7 days');
```

## Safe Schema Evolution

- `CREATE INDEX CONCURRENTLY` — avoids blocking writes (can't run in transactions)
- Adding `NOT NULL` columns with volatile defaults rewrites entire table — use two-step deploy
- `DROP CONSTRAINT` before `DROP COLUMN`

## Useful Extensions

| Extension | Use |
|---|---|
| `timescaledb` | Time-series — automated partitioning, retention, compression |
| `pgcrypto` | Password hashing, UUID generation |
| `pg_trgm` | Fuzzy text search, `LIKE '%pattern%'` acceleration |
| `pgvector` | Vector similarity search for embeddings |
| `pgaudit` | Audit logging |
| `postgis` | Geospatial support |

## Examples

```sql
-- Standard table
CREATE TABLE users (
  user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON users (LOWER(email));
CREATE INDEX ON users (created_at);

-- Table with FK (manually indexed)
CREATE TABLE orders (
  order_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','CANCELED')),
  total NUMERIC(10,2) NOT NULL CHECK (total > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON orders (user_id);    -- manual FK index
CREATE INDEX ON orders (created_at);
```
