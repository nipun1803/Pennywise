# Pennywise backend cross-check

Reviewed against the original backend requirements **and the later decisions in this conversation**. Later decisions take precedence: unlimited group membership, greedy settlement suggestions, editable/soft-deletable payments, embedded creation metadata, and deferred rate limits.

## Scope and endpoint coverage

All **22 agreed HTTP endpoints** are registered and documented in the per-feature tables in [api.md](api.md):

- Authentication/profile: 4.
- Groups/membership: 7.
- Expenses: 4.
- Balances/settle-up: 2.
- Settlement records/history/corrections: 4.
- Health: 1.

A regression test compares the documentation tables against the route registrations and rejects missing/duplicate table entries. The Docker smoke test exercises all 22 endpoints against the compiled containerized server.

## Decisions checked

| Area | Final agreed rule | Implementation / verification |
| --- | --- | --- |
| Backend stack | Express, TypeScript, MongoDB/Mongoose, JWT, bcrypt, Zod | Present; TypeScript build/typecheck and lint pass |
| Accounts | Name/email/password signup; email/password login | API tests verify normalization, hashing, duplicate emails and generic login failures |
| Passwords | Minimum 10 Unicode characters; bcrypt-safe byte length | Signup and login enforce the 72-byte boundary; truncation-regression test passes |
| Sessions | Seven-day JWT; no refresh/reset/verification | HS256, subject, issuer, audience and expiry verification; invalid/expired/wrong-audience tokens tested |
| Profile | Display-name editing only | GET/PATCH `/me`; email/password updates rejected |
| Groups | Creation takes only name; creator becomes first member | Tested; no capacity field or member input; extra capacity input rejected |
| Capacity | No application member/group count limit | Joining beyond the earlier 16-member proposal tested; finite MongoDB limits still apply |
| Joining | Unique six-character code, excluded look-alikes, automatic membership | Cryptographic generation, unique index, collision retries, normalized code lookup and atomic duplicate-safe joins tested |
| Group privacy | Only members read/write; users list only their groups | Read/write isolation, creator-only rename/rotation, and cross-group record-ID checks tested |
| Code sharing | All members can see the code | Group list/detail responses include it; frontend copy/share UI remains future work |
| Members/lists | Page numbers, default 25, maximum 100; name search | Validated pagination and literal case-insensitive search; member emails excluded |
| Expenses | Integer cents; equal split among everyone-at-creation or selected members | Server derives shares; 100/3 = 34,33,33; tiny amounts allow zero shares; non-member and duplicate splits rejected |
| Payer | Any group member; participation in split optional | Selected split may exclude payer; tested |
| Expense corrections | Author or creator only; allowed after recorded payments | Permission tests; omitted splits preserve participants; changed amount/payer recalculates shares; payments remain unchanged |
| Balances | Full active ledger on each request; no running totals; zero sum | Pure shared functions and generated-ledger tests; pagination never limits calculation input; overflow returns 422 |
| Debt simplification | Greedy; at most n−1 payments, not absolute minimum | Deterministic correctness/bound tests across groups up to 50 members; four-member/ten-expense case tested |
| Payment recording | Any member; distinct member sender/receiver; positive cents | Partial payments, overpayments and third-party entry accepted as agreed; invalid fields rejected |
| Payment corrections | Any member can edit or soft-delete | Latest editor/deletion actor and timestamps retained; deleted records stay in history and are excluded from calculations |
| Expense deletion | Soft delete, hidden from normal lists | Preserves immutable creation metadata and original retry responses; deletion permissions tested |
| Idempotency | Required UUID for expense/payment creation; scoped to user/group/type | Unique embedded-key indexes; concurrent inserts, conflicts, normalized payload/order, edits and tombstone replays tested |
| Responses | Data wrapper, standard errors, 204 deletes | Documented schemas match controller responses; malformed JSON, unsupported charset and size-limit handling tested |
| Storage | Standalone local MongoDB or Atlas; no replica-set requirement | API tests use actual isolated standalone MongoDB; Atlas connection/setup documented, not live-tested |
| Docker | Backend only | Multi-stage build, pruned production dependencies, non-root runtime, healthcheck, external database; container smoke test passes |
| Rate limits | Defer until frontend completion | Intentionally absent, including join-code limiting; tracked as required pre-production work |
| Frontend/offline | Cached loaded-page reads; no offline writes; SecureStore token | Integration requirements documented; no frontend code changed or claimed complete |
| Non-goals | No real payments, currency conversion, scanning, push, placeholders, social/OTP login | None added; no group leaving/archive/deletion or ownership-transfer APIs added |

## Bugs reproduced and fixed

1. **New-member balance race.** Authorization cached a group's member list before ledger queries. If someone joined and recorded an expense meanwhile, calculations could throw “Ledger references a non-member.” Membership now reloads after both ledger reads, and displayed names load from the calculated user IDs. This relies on the agreed no-leaving/no-member-removal scope.
2. **Concurrent code rotation could succeed without changing the latest code.** Two requests reading the same old code and generating the same candidate could both report that candidate as successful. Rotation now compares the stored code atomically with the value it read and retries on concurrent changes. A deterministic test forced this exact collision.
3. **Unsupported JSON charset was misreported as HTTP 500.** Unsupported charset/content-encoding errors now return 415 with the consistent error wrapper. Oversized JSON remains 413.

Each bug was reproduced by a failing regression test before applying the fix.

## Verification

Latest cross-check: **73 Jest tests passed across 3 suites**, including 17 unit/documentation tests. Build, typecheck, lint, the standalone API tests, and the Docker smoke covering all 22 endpoints passed. `npm audit --omit=dev` reported zero production dependency vulnerabilities.

Run from `server/`:

```bash
npm run lint
npm run typecheck
npm run build
npm test
npm run test:unit
docker build -t pennywise-api:local .
npm run test:docker
npm audit --omit=dev
```

Container testing uses an isolated host-side standalone MongoDB and a uniquely named temporary API container, not the user's development/Atlas database. Its own container/database are stopped/removed afterwards; the built API image remains available. Docker Desktop stays running because starting it was approved. See [backend setup](backend-setup.md) for connection/environment instructions.

## Remaining limitations / intentional deferrals

- **Not a claim of zero possible bugs.** Passing review and tests cover the checked scenarios, not every future deployment or load condition.
- Rate limiting is still deferred by explicit instruction. Add signup/login/join brute-force protection before public exposure; share limiter state across multiple instances.
- JWT logout is device-local. A copied token remains valid until expiry or secret rotation.
- Full-ledger reads are not a cross-collection transaction snapshot during simultaneous edits. Counts/pages may shift; independent corrections remain last-write-wins as documented. No running totals are stored.
- Latest payment correction attribution is retained, not a full version-by-version edit audit. Any-member correction permissions are intentional and require group trust; the backend does not verify actual money transfers.
- Tombstones and original creation responses are retained indefinitely for idempotency. Large groups/ledgers remain subject to document, request-size, memory and CPU limits; no large production-load benchmark was performed.
- Production npm dependencies report zero current advisories. The Jest development dependency tree still reports moderate glob/minimatch advisories; no forced breaking dependency update was applied. This does not constitute an OS-container vulnerability scan.
- Docker was built/run on this Apple Silicon machine. Other architectures and live Atlas/hosting environments were not exercised. No paid resource or live deployment was created.
- Frontend welcome/auth/join retention, SecureStore, AsyncStorage cache isolation, offline banners/write disabling, reconnect refetches, scroll/search UI and copy/share sheets still require frontend implementation.
