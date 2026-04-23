---
description: TypeScript + React 19 code review — critical bugs, React 19-specific mistakes, state management anti-patterns, and strict TypeScript config. Use when reviewing React/TS changes before committing.
---

# TypeScript + React 19 Code Review

Expert code reviewer for React 19 + TypeScript. Focus on bugs, memory leaks, architectural problems, and React 19-specific mistakes.

## Review Priority Levels

### Critical — Block Merge

| Issue | Why It's Critical |
|---|---|
| `useEffect` for derived state | Extra render cycle, sync bugs |
| Missing cleanup in `useEffect` | Memory leaks |
| Direct state mutation (`.push()`, `.splice()`) | Silent update failures |
| Conditional hook calls | Breaks Rules of Hooks |
| `key={index}` in dynamic lists | State corruption on reorder |
| `any` type without justification | Type safety bypass |
| `useFormStatus` in same component as `<form>` | Always returns false (React 19 bug) |
| Promise created inside render with `use()` | Infinite loop |

### High Priority

| Issue | Impact |
|---|---|
| Incomplete `useEffect` dependency arrays | Stale closures, missing updates |
| Props typed as `any` | Runtime errors |
| Unjustified `useMemo`/`useCallback` | Unnecessary complexity |
| Missing Error Boundaries at route boundaries | Poor error UX |
| Controlled input initialized with `undefined` | React warning → uncontrolled |

### Architecture / Style

| Issue | Recommendation |
|---|---|
| Component > 300 lines | Split into smaller components |
| Prop drilling > 2-3 levels | Use composition or context |
| State far from usage | Colocate state |
| Custom hook without `use` prefix | Follow naming convention |

## Quick Detection Patterns

### useEffect Abuse (Most Common Anti-Pattern)

```ts
// ❌ WRONG: Derived state in useEffect
const [fullName, setFullName] = useState('');
useEffect(() => {
  setFullName(firstName + ' ' + lastName);
}, [firstName, lastName]);

// ✅ CORRECT: Compute during render
const fullName = firstName + ' ' + lastName;
```

```ts
// ❌ WRONG: Event logic in useEffect
useEffect(() => {
  if (product.isInCart) showNotification('Added!');
}, [product]);

// ✅ CORRECT: Logic in event handler
function handleAddToCart() {
  addToCart(product);
  showNotification('Added!');
}
```

### React 19 Hook Mistakes

```ts
// ❌ WRONG: useFormStatus in form component (always returns false)
function Form() {
  const { pending } = useFormStatus();
  return <form action={submit}><button disabled={pending}>Send</button></form>;
}

// ✅ CORRECT: useFormStatus in child component
function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>Send</button>;
}

// ❌ WRONG: Promise created in render (infinite loop)
function Component() {
  const data = use(fetch('/api/data')); // New promise every render!
}

// ✅ CORRECT: Promise from props or stable reference
function Component({ dataPromise }: { dataPromise: Promise<Data> }) {
  const data = use(dataPromise);
}
```

### State Mutation

```ts
// ❌ WRONG: Mutations (no re-render triggered)
items.push(newItem);
setItems(items);

// ✅ CORRECT: Immutable updates
setItems([...items, newItem]);
setArr(arr.map((x, idx) => idx === i ? newValue : x));
```

### TypeScript Red Flags

```ts
// ❌ Flag immediately
const data: any = response;
const App: React.FC<Props> = () => {}; // discouraged pattern

// ✅ Preferred
const data: ResponseType = response;
const App = ({ prop }: Props) => {};  // explicit props
```

## State Management Quick Guide

| Data type | Solution |
|---|---|
| Server/async data | TanStack Query (never copy to local state) |
| Simple global UI state | Zustand |
| Component-local state | `useState`/`useReducer` |
| Form state | React 19 `useActionState` |

```ts
// ❌ NEVER copy server data to local state
const { data } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });
const [todos, setTodos] = useState([]);
useEffect(() => setTodos(data), [data]); // ← wrong

// ✅ Query IS the source of truth
const { data: todos } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });
```

## TypeScript Config Recommendations

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true
  }
}
```

`noUncheckedIndexedAccess` is critical — catches `arr[i]` returning `undefined`.

## Review Workflow

1. **Scan for critical issues first** — the table above
2. **Check React 19 usage** — `useFormStatus`, `use()`, `useActionState` patterns
3. **Evaluate state management** — server state vs client state separation
4. **Assess TypeScript safety** — generics, discriminated unions, strict config
5. **Review for maintainability** — component size, hook design

## Immediate Red Flags

| Pattern | Problem | Fix |
|---|---|---|
| `eslint-disable react-hooks/exhaustive-deps` | Hides stale closure bugs | Refactor logic |
| Component defined inside component | Remounts every render | Move outside |
| `useState(undefined)` for inputs | Uncontrolled warning | Use empty string |
| `React.FC` with generics | Generic inference breaks | Use explicit props |
| Barrel files (`index.ts`) in app code | Bundle bloat, circular deps | Direct imports |
