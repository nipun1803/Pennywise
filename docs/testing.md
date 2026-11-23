# Pennywise testing

| Suite | Location | Runner | Tests | Needs |
| --- | --- | --- | ---: | --- |
| Server unit | `server/tests/unit/` | Jest (after `tsc`) | 39 | Nothing |
| Server API | `server/tests/api/backend.test.ts` | Jest + Supertest | 82 | `mongodb-memory-server` (downloads a MongoDB binary on first run) |
| Client core | `client/tests/*.test.cjs` | `node --test` | 17 | Nothing |
| Client components | `client/tests/components/*.test.jsx` | Jest + React Native Testing Library | 69 | Nothing |
| Docker smoke | `server/scripts/docker-smoke.cjs` | Node script | All 35 endpoints plus the 429 rate limit | Docker |

## Commands

```bash
# Server
cd server
npm run typecheck        # tsc on src + tests, no output
npm run lint             # build, then eslint dist + scripts
npm test                 # compile to .test-dist/ and run every Jest suite
npm run test:unit        # unit tests only, no database
npm run test:docker      # build the image and smoke-test it in a container

# Client
cd client
npm run typecheck
npm run lint
npm test                 # node:test core logic
npm run test:components  # Jest component/hook tests
```

Server tests are compiled with `tsconfig.test.json` into `server/.test-dist/` and Jest runs the compiled JavaScript. That's why file paths inside tests resolve from `.test-dist/tests/...`.

## Server unit tests

| File | What it protects |
| --- | --- |
| `money.test.ts` | Equal-split remainders (`10000 / 3 → 3334, 3333, 3333`), zero-cent shares, max-safe-integer amounts, overflow detection, zero-sum validation, and greedy settle-up (randomized ledgers always settle; 4 people never need more than 3 payments). Also checks the join-code alphabet. |
| `media.test.ts` | Photo upload handling: Cloudinary configuration failures are reported as such, invalid images keep a helpful error, and a valid upload returns the hosted URL. |
| `openapi.test.ts` | Every route the app actually serves is in the OpenAPI document, and vice versa. |
| `rate-limit.test.ts` | Signup/login share one 429 budget, the global limit exempts `/health`, and limits stay off unless configured. |
| `api-documentation.test.ts` | Every route appears exactly once in the tables in `docs/api.md`, and there are exactly 35. |
| `registered-routes.ts` *(helper)* | Walks the live Express router tree, mount prefixes included, to list every `METHOD /path`. Both documentation tests use it, so they keep working however routes are split across files. |

## Server API tests

`backend.test.ts` boots the real Express app against an in-memory MongoDB and drives it over HTTP. Push delivery is replaced with a fake sender (`setPushSender`) so notification tests can inspect messages without network access.

| Area | Examples of what's covered |
| --- | --- |
| Auth | Email normalization, bcrypt hashing, the 8-character / 72-byte password rules, identical errors for bad email and bad password, rejection of expired, wrong-audience and tampered tokens |
| Groups | Join-code normalization, parallel joins without duplicate members, creator-only edit/rotate, old code stops working, code-collision retries, member search escaping |
| Expenses | Server-calculated equal splits, `all`/`allExcept`/`selected`/`custom` modes, rejection of non-members, edit permissions (author or creator), soft-delete without resurrection |
| Idempotency | Concurrent creates store one record, a changed payload returns `409`, retries after edit or delete replay the original response, keys can't be spoofed across users |
| Balances | Recomputed after edits, deletes and settlements; `422` on overflow; a member joining mid-request doesn't break the ledger |
| Audit & records | Concurrent before-images stay accurate, a failure to prepare the audit entry blocks the action, statements use the corrected ledger with page opening balances |
| Platform | Per-user join limit (429), CORS preflight, invalid JSON, oversized bodies, unsupported charsets, `/health`, Swagger UI, unique indexes |
| Notifications | Right recipients for create, edit and delete; per-type mute; actor never notified; dead tokens pruned; a failing push service never fails the write |

## Client tests

| File | What it protects |
| --- | --- |
| `core.test.cjs` | INR formatting (paise, Indian digit grouping, signs), amount input parsing, join-code normalization, local JWT expiry decoding, photo crop bounds |
| `invite.test.cjs` | Parsing scanned QR codes and invite links, WCAG AA contrast of positive-amount text |
| `use-mutation.test.jsx` | Idempotency intents survive remounts and restarts, duplicate taps are blocked, intents clear on success or a definite `4xx` |
| `use-resource.test.jsx` | Offline cache reads, no fetch without a session, cached data dropped on `403/404` |
| `forms.test.jsx` | The expense edit form loads fresh data and offers "keep original people"; payment suggestions need confirmation when they might overpay |
| `flows.test.jsx` | Tab bar, sheets, password visibility, avatar fallback |
| `photos.test.jsx` | Camera/gallery permission handling, the crop flow, preset fallbacks, upload failures |
| `push.test.jsx` | Notification taps route only to valid group ids, token registration and removal on logout, preference switches |
| `category-manager.test.jsx` | Archive/restore permissions; archived categories can't be picked |

## Adding a test

- **New endpoint:** register it in `server/src/routes/`, then add it to `server/src/openapi.ts` and the table in `docs/api.md`. The two documentation tests fail until all three agree. Update the `35` count in `api-documentation.test.ts`.
- **New money rule:** add a pure-function case to `money.test.ts` first, then an API test showing the rule through HTTP.
- **New screen behaviour:** add to the matching `client/tests/components/*.test.jsx`, or start a new file there.
