---
description: 32 TanStack Query v5 rules across query keys, caching, mutations, error handling, prefetching, and performance. Use when implementing or reviewing data fetching logic.
---

# TanStack Query Best Practices

Comprehensive guidelines for TanStack Query (React Query) v5 in React applications. Optimizes data fetching, caching, mutations, and server state synchronization.

## When to Apply

- Creating new data fetching logic
- Setting up query configurations
- Implementing mutations and optimistic updates
- Configuring caching strategies
- Refactoring existing data fetching code

## Rule Categories by Priority

| Priority | Category | Rules | Impact |
|---|---|---|---|
| CRITICAL | Query Keys | 5 rules | Prevents cache bugs and data inconsistencies |
| CRITICAL | Caching | 5 rules | Optimizes performance and data freshness |
| HIGH | Mutations | 6 rules | Ensures data integrity and UI consistency |
| HIGH | Error Handling | 3 rules | Prevents poor user experiences |
| MEDIUM | Prefetching | 4 rules | Improves perceived performance |
| MEDIUM | Parallel Queries | 2 rules | Enables dynamic parallel fetching |
| MEDIUM | Infinite Queries | 3 rules | Prevents pagination bugs |
| LOW | Performance | 4 rules | Reduces unnecessary re-renders |
| LOW | Offline Support | 2 rules | Enables offline-first patterns |

## Query Keys (`qk-`)

- `qk-array-structure` — Always use arrays: `['users', userId]` not `'users'`
- `qk-include-dependencies` — Include ALL variables the query depends on in the key
- `qk-hierarchical-organization` — Organize hierarchically: `['users', 'list', { filters }]`
- `qk-factory-pattern` — Use query key factories for complex apps:
  ```ts
  export const userKeys = {
    all: ['users'] as const,
    lists: () => [...userKeys.all, 'list'] as const,
    detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  }
  ```
- `qk-serializable` — All key parts must be JSON-serializable

## Caching (`cache-`)

- `cache-stale-time` — Set `staleTime` based on data volatility (0 = always refetch, Infinity = never)
- `cache-gc-time` — Configure `gcTime` for inactive query retention (default: 5 min)
- `cache-defaults` — Set sensible defaults at QueryClient level, not per-query
- `cache-invalidation` — Use targeted invalidation: `queryClient.invalidateQueries({ queryKey: userKeys.detail(id) })`
- `cache-placeholder-vs-initial` — `placeholderData` shows stale UI while refetching; `initialData` is treated as real data

## Mutations (`mut-`)

- `mut-invalidate-queries` — Always invalidate related queries after successful mutations
- `mut-optimistic-updates` — Use `onMutate` for optimistic updates on fast interactions
- `mut-rollback-context` — Return rollback data from `onMutate`, use in `onError`
- `mut-error-handling` — Handle mutation errors in `onError`, not just `onSuccess`
- `mut-loading-states` — Use `isPending` (not `isLoading`) for mutation loading states (v5)
- `mut-mutation-state` — Use `useMutationState` for cross-component mutation tracking

```ts
// ✅ Correct mutation pattern
const mutation = useMutation({
  mutationFn: updateUser,
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: userKeys.detail(newData.id) });
    const previous = queryClient.getQueryData(userKeys.detail(newData.id));
    queryClient.setQueryData(userKeys.detail(newData.id), newData);
    return { previous };
  },
  onError: (err, newData, context) => {
    queryClient.setQueryData(userKeys.detail(newData.id), context?.previous);
  },
  onSettled: (data, err, variables) => {
    queryClient.invalidateQueries({ queryKey: userKeys.detail(variables.id) });
  },
});
```

## Error Handling (`err-`)

- `err-error-boundaries` — Use Error Boundaries with `useQueryErrorResetBoundary`
- `err-retry-config` — Configure `retry` per query type (default 3 is too many for user actions)
- `err-fallback-data` — Provide `placeholderData` for graceful degraded UX

## Prefetching (`pf-`)

- `pf-intent-prefetch` — Prefetch on hover/focus before navigation
- `pf-route-prefetch` — Prefetch during route transitions
- `pf-stale-time-config` — Always set `staleTime` when prefetching
- `pf-ensure-query-data` — Use `ensureQueryData` for conditional prefetching

## Performance (`perf-`)

- `perf-select-transform` — Use `select` to transform/filter data and prevent unnecessary re-renders:
  ```ts
  useQuery({ ..., select: (data) => data.users.filter(u => u.active) })
  ```
- `perf-structural-sharing` — TanStack Query uses structural sharing by default — don't fight it
- `perf-notify-change-props` — Use `notifyOnChangeProps` to limit re-renders to specific fields
- `perf-placeholder-data` — Use `placeholderData: keepPreviousData` for pagination

## Anti-Patterns to Avoid

```ts
// ❌ NEVER copy server data to local state
const { data } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
const [users, setUsers] = useState([]);
useEffect(() => setUsers(data), [data]); // ← wrong

// ✅ Query IS the source of truth
const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });

// ❌ Missing dependencies in query key
useQuery({ queryKey: ['users'], queryFn: () => fetchUser(userId) }); // userId not in key

// ✅ Include all dependencies
useQuery({ queryKey: ['users', userId], queryFn: () => fetchUser(userId) });
```

## v5-Specific Notes

- `isLoading` → `isPending` for mutations
- `cacheTime` → `gcTime`
- `useQueries` now accepts `{ queries: [...] }` shape
- `useQuery` `onSuccess`/`onError`/`onSettled` callbacks removed — use `useEffect` or mutation callbacks
