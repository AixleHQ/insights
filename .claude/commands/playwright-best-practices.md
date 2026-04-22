---
description: Activity-based Playwright reference — 50+ testing patterns across E2E, component, API, auth, mobile, debugging, and CI/CD. Use when writing, debugging, or architecting Playwright tests.
---

# Playwright Best Practices

Comprehensive guidance for all aspects of Playwright test development, from writing new tests to debugging and maintaining existing test suites.

## Activity-Based Reference Guide

### Writing New Tests

| Activity | Reference |
|----------|-----------|
| E2E tests | test-suite-structure, locators, assertions-waiting |
| Component tests | component-testing, test-suite-structure |
| API tests | api-testing, test-suite-structure |
| GraphQL tests | graphql-testing, api-testing |
| Visual regression | visual-regression |
| Page Object Model | page-object-model, test-suite-structure |
| Test fixtures/data | fixtures-hooks, test-data |
| Authentication | authentication, authentication-flows |
| Date/time features | clock-mocking |
| File upload/download | file-operations, file-upload-download |
| Forms/validation | forms-validation |
| Accessibility | accessibility |
| Security (XSS, CSRF) | security-testing |
| iframes | iframes |
| Internationalization | i18n |

### Mobile & Responsive Testing

| Activity | Reference |
|----------|-----------|
| Device emulation | mobile-testing |
| Touch gestures | mobile-testing |
| Viewport/breakpoint testing | mobile-testing |

### Real-Time & Browser APIs

| Activity | Reference |
|----------|-----------|
| WebSocket/real-time | websockets |
| Geolocation mocking | browser-apis |
| Permission handling | browser-apis |
| OAuth popup handling | third-party, multi-context |
| Multi-tab/popup flows | multi-context |

### Debugging & Troubleshooting

| Activity | Reference |
|----------|-----------|
| Debugging test failures | debugging, assertions-waiting |
| Fixing flaky tests | flaky-tests, debugging |
| Fixing selector issues | locators, debugging |
| Timeout issues | assertions-waiting, debugging |
| Race conditions | flaky-tests, debugging |
| Console/JS errors | console-errors |
| Using trace viewer | debugging |

### Architecture Decisions

| Activity | Reference |
|----------|-----------|
| POM vs fixtures | pom-vs-fixtures |
| Test type selection | test-architecture |
| Mock vs real services | when-to-mock |
| Test suite structure | test-suite-structure |

### Infrastructure & CI/CD

| Activity | Reference |
|----------|-----------|
| GitHub Actions setup | github-actions |
| Docker/container setup | docker |
| Parallel execution/sharding | parallel-sharding, performance |
| Global setup/teardown | global-setup |
| Test coverage | test-coverage |
| Reporting/artifacts | reporting |

### Advanced Patterns

| Activity | Reference |
|----------|-----------|
| Mocking API responses | network-advanced |
| OAuth/SSO mocking | third-party, multi-context |
| Performance budgets | performance-testing |
| Network interception | network-advanced |
| GraphQL mocking | network-advanced |
| Security testing | security-testing |

## Quick Decision Tree

```
What are you doing?
├─ Writing a new test?
│  ├─ E2E → test-suite-structure, locators, assertions-waiting
│  ├─ Component → component-testing
│  ├─ API → api-testing
│  ├─ Visual regression → visual-regression
│  ├─ Accessibility → accessibility
│  └─ Multi-user → multi-user
│
├─ Test is failing/flaky?
│  ├─ Flaky → flaky-tests
│  ├─ Element not found → locators, debugging
│  ├─ Timeout → assertions-waiting, debugging
│  └─ Race conditions → flaky-tests, debugging
│
├─ Architecture decisions?
│  ├─ POM vs fixtures → pom-vs-fixtures
│  ├─ Test type → test-architecture
│  └─ Mock vs real → when-to-mock
│
└─ Setting up infrastructure?
   ├─ CI/CD → ci-cd, github-actions
   ├─ Docker → docker
   └─ Sharding → parallel-sharding
```

## Test Validation Loop

After writing or modifying tests:

1. **Run tests:** `npx playwright test --reporter=list`
2. **If tests fail:**
   - Review error and trace: `npx playwright show-trace`
   - Fix locators, waits, or assertions
   - Re-run
3. **Only proceed when all tests pass**
4. **For critical tests:** `npx playwright test --repeat-each=5`

## DB90-Specific Notes

- Auth setup project is in `packages/web/playwright.config.ts` — use existing auth state rather than re-authenticating in every test
- Run e2e: `cd packages/web && npm run test:e2e`
- Run with UI: `npm run test:e2e:ui`
- Full suite (with auth setup): `npm run test:e2e:full`
