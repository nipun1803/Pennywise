# Pennywise backend cross-check

Reviewed against the original backend requirements **and the later decisions in this conversation**. Later decisions take precedence: unlimited group membership, greedy settlement suggestions, editable/soft-deletable payments, embedded creation metadata, and deferred rate limits.

## Scope and endpoint coverage

All **28 agreed HTTP endpoints**, including the frontend-approved extensions, are registered and documented in [api.md](api.md):

- Authentication/profile: 4.
- Groups/membership: 7.
- Expenses: 5.
- Balances/settle-up: 2.
- Settlement records/history/corrections: 4.
- Categories: 3.
- Activity/statements: 2.
- Health: 1.

A regression test compares documentation tables against route registrations and rejects missing/duplicate entries. The Docker smoke script now covers all 28 endpoints; the earlier 22-endpoint container result does not verify the extensions.

## Decisions checked

| Area | Final agreed rule | Implementation / verification |
| --- | --- | --- |
| Backend stack | Express, TypeScript, MongoDB/Mongoose, JWT, bcrypt, Zod | Present; TypeScript build/typecheck and lint pass |
| Accounts | Name/email/password signup; email/password login | API tests verify normalization, hashing, duplicate emails and generic login failures |
| Passwords | Minimum 8 Unicode characters; bcrypt-safe byte length | Signup enforces the 8-character minimum; signup and login enforce the 72-byte boundary; truncation-regression test passes |
| Sessions | Seven-day JWT; no refresh/reset/verification | HS256, subject, issuer, audience and expiry verification; invalid/expired/wrong-audience tokens tested |
| Profile | Name and preset avatar/color | GET/PATCH `/me`; presets validated; email/password updates rejected |
| Groups | Name, optional description/preset icon/color; creator becomes first member | Description length/presets and creator-only metadata changes tested; no capacity field or member input |
| Capacity | No application member/group count limit | Joining beyond the earlier 16-member proposal tested; finite MongoDB limits still apply |
| Joining | Six-character code, automatic membership, reliable `alreadyMember` | Concurrent first joins return exactly one new membership and one embedded join event |
| Group privacy | Only members read/write; users list only their groups | Read/write isolation, creator-only rename/rotation, and cross-group record-ID checks tested |
| Code sharing | All members can see/copy/share code | Group list/detail responses include it; frontend actions implemented; native sheets still require device checks |
| Members/lists | Page numbers, default 25, maximum 100; name search | Validated pagination and literal case-insensitive search; member emails excluded |
| Expenses | Integer paise; everyone, selected, or everyone with exclusions | Server derives shares; deterministic remainders/zero shares; non-member/duplicate/empty participants rejected; snapshots and normalized exclusion retries tested |
| Categories | Required for new expenses; standard/custom categories; creator-only rename/archive | Duplicate names, archived/cross-group choices, legacy null category, permissions, and preserved snapshots tested |
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
| Frontend/offline | Cached loaded-page reads; no offline writes; SecureStore token | Implemented; core tests cover storage/cache/session behavior; native-device verification still pending |
| Activity | Embedded atomic events with actor/time/before/after, deleted records retained | Concurrent before-image chain and fault-injected audit failure atomicity tested; invite/credential leakage checked |
| Statements | Corrected ledger at original dates; full-ledger running totals | Matches member balances; pagination opening totals, deleted exclusion, group spending and overflow tested |
| Non-goals | No real payments, currency conversion, receipt scanning, push, placeholders, social/OTP login | None added; no group leaving/archive/deletion or ownership-transfer APIs added. The client's camera QR scanner only reads group join codes (`client/src/app/scan.tsx`); nothing is recorded or uploaded |

## Bugs reproduced and fixed

1. **New-member balance race.** Authorization cached a group's member list before ledger queries. If someone joined and recorded an expense meanwhile, calculations could throw “Ledger references a non-member.” Membership now reloads after both ledger reads, and displayed names load from the calculated user IDs. This relies on the agreed no-leaving/no-member-removal scope.
2. **Concurrent code rotation could succeed without changing the latest code.** Two requests reading the same old code and generating the same candidate could both report that candidate as successful. Rotation now compares the stored code atomically with the value it read and retries on concurrent changes. A deterministic test forced this exact collision.
3. **Unsupported JSON charset was misreported as HTTP 500.** Unsupported charset/content-encoding errors now return 415 with the consistent error wrapper. Oversized JSON remains 413.

Each bug was reproduced by a failing regression test before applying the fix.

## Verification

*Historical results from the review on 2026-11-21; re-run the commands below for current status.* Frontend-extension check at that time: **84 Jest tests passed across 3 suites** on an isolated standalone MongoDB; backend build/typecheck/lint pass. Earlier container verification covered the original 22 endpoints; re-run the expanded 28-endpoint script against a rebuilt image. Earlier dependency-audit results are not a guarantee about future advisories. Client checks and native-testing limits are described in [client setup](../client/README.md).

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
- Full version-by-version activity begins with this rollout; older actions cannot be reconstructed. Any-member payment corrections are intentional and require group trust; the backend does not verify actual money transfers.
- Tombstones and original creation responses are retained indefinitely for idempotency. Large groups/ledgers remain subject to document, request-size, memory and CPU limits; no large production-load benchmark was performed.
- At the time of review (2026-11-19), production npm dependencies reported zero advisories; re-run `npm audit --omit=dev` for current results. The Jest development dependency tree then reported moderate glob/minimatch advisories; no forced breaking dependency update was applied. This does not constitute an OS-container vulnerability scan.
- Docker was built/run on this Apple Silicon machine. Other architectures and live Atlas/hosting environments were not exercised. No paid resource or live deployment was created.
- The client is implemented, but compilation/web checks do not prove Android/iOS keyboard, safe-area, SecureStore, clipboard, share-sheet, or connectivity behavior. Test development builds on actual devices before release.
- Embedded audit arrays are retained with the action document, not a separate transaction-dependent collection. Monitor MongoDB's 16 MiB document limit; full histories are not silently pruned. There has been no large-scale load benchmark.
