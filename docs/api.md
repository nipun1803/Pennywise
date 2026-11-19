# Pennywise API reference

This documents the implemented backend. Development base URL: `http://localhost:3000`. Production must use HTTPS. IDs in examples are illustrative valid ObjectId strings; replace them with IDs returned by your server. Tokens and request keys below are examples, not credentials.

## Conventions

- Send `Content-Type: application/json` for JSON bodies.
- Except signup, login, and health, send `Authorization: Bearer <token>`.
- Success: `{ "data": ... }`. Paginated success also includes `pagination`.
- DELETE success is **204 No Content**, with no JSON body.
- Errors: `{ "error": { "code": "...", "message": "..." } }`.
- Money is JSON **number** integer cents, from 1 through `9007199254740991`. Decimal amounts and numeric strings are rejected. No currency conversion or real payment processing.
- Dates are UTC ISO 8601 strings. API `id` fields represent MongoDB `_id`.
- Names: 1–80 characters after trimming. Expense descriptions: 1–200. Search: at most 80.
- Unknown JSON body fields are rejected. Do not send database-only fields such as `createdBy`, hashes, or client-calculated shares.
- Signup passwords: at least 10 Unicode characters, at most 72 UTF-8 bytes. Passwords are not trimmed. Login also rejects passwords beyond 72 bytes to avoid bcrypt truncation.
- Group-specific endpoints require membership, even when retrying a write.

### Pagination

Groups, members, expenses, and settlement history use `?page=1&limit=25`.
`page` is a positive integer; `limit` is 1–100, default 25. An out-of-range page returns an empty list, not an error. Empty collections have `totalPages: 0`.

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 25, "total": 0, "totalPages": 0 }
}
```

Groups, expenses, and settlements sort by creation time descending, then ID descending. Members sort by name ascending, then ID. Page boundaries may shift during concurrent changes; refetch affected cached pages rather than assuming old boundaries remain valid. Counts and pages are separate reads, not a transaction snapshot.

### Idempotent creation

**Required only for POST expense and POST settlement creation:**

```http
Idempotency-Key: 5e5c502a-d5bd-44d8-9dcf-51d78f793f90
```

Generate a fresh UUID for each intended new record. Retain it while retrying the same request after a lost response. Keys are normalized to lowercase and scoped to the creating user, group, and resource type. The same key may therefore be used independently by another user/group/resource type, but a fresh key everywhere is best.

- Same key + same normalized payload: **201** and the original saved response, including original timestamps.
- Same key + different normalized payload: **409 IDEMPOTENCY_CONFLICT**.
- Simultaneous matching requests create one record, protected by a unique database index.
- Selected split IDs are sorted for fingerprinting; reordering the same IDs is a matching retry.
- Retrying all-mode after new members join still returns the original member snapshot.
- Original creation metadata survives edits and soft deletion. A retry does **not** undo an edit or resurrect a deleted record. Refresh the lists/balances after such a retry to see current state.
- Keys and original response snapshots do not expire in this MVP. Do not purge tombstones without redesigning this guarantee.
- Group creation is not idempotent; blindly retrying it can create another group.

## Response objects used below

The following examples are reusable response shapes. Every endpoint below specifies which shape it returns.

### User

```json
{
  "id": "507f1f77bcf86cd799439011",
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2026-11-19T10:00:00.000Z"
}
```

Only authentication and `/me` expose the authenticated user's email. Member lists contain only `id` and `name`. Password hashes are never returned.

### Group

```json
{
  "id": "507f191e810c19729de860ea",
  "name": "Weekend trip",
  "joinCode": "K7M2QX",
  "createdBy": "507f1f77bcf86cd799439011",
  "memberCount": 3,
  "createdAt": "2026-11-19T10:00:00.000Z"
}
```

`memberCount` is computed response metadata, not a creation input or capacity. There is no capacity field or application-level member limit. Group responses do not embed all members; use the member endpoint.

### Expense

```json
{
  "id": "507f191e810c19729de860eb",
  "groupId": "507f191e810c19729de860ea",
  "description": "Shared snacks",
  "amountCents": 100,
  "paidBy": "507f1f77bcf86cd799439011",
  "splits": [
    { "userId": "507f1f77bcf86cd799439011", "shareCents": 34 },
    { "userId": "507f1f77bcf86cd799439012", "shareCents": 33 },
    { "userId": "507f1f77bcf86cd799439013", "shareCents": 33 }
  ],
  "createdBy": "507f1f77bcf86cd799439011",
  "createdAt": "2026-11-19T10:00:00.000Z",
  "updatedAt": "2026-11-19T10:00:00.000Z"
}
```

### Settlement

```json
{
  "id": "507f191e810c19729de860ec",
  "groupId": "507f191e810c19729de860ea",
  "fromUser": "507f1f77bcf86cd799439012",
  "toUser": "507f1f77bcf86cd799439011",
  "amountCents": 20,
  "createdBy": "507f1f77bcf86cd799439013",
  "createdAt": "2026-11-19T10:00:00.000Z",
  "updatedAt": "2026-11-19T10:00:00.000Z",
  "updatedBy": null,
  "deletedAt": null,
  "deletedBy": null
}
```

`createdBy` is who entered the payment, not necessarily the sender. It never changes. Corrections set `updatedBy` and `updatedAt`; deletion also sets `deletedAt` and `deletedBy`. This records latest correction attribution, not a complete version-by-version edit history.

## Authentication and profile

| Method | Endpoint | Access | Request body | Success |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | Public | `name`, `email`, `password` | 201 — `data: { token, user }` |
| POST | `/auth/login` | Public | `email`, `password` | 200 — `data: { token, user }` |
| GET | `/me` | JWT | None | 200 — `data: User` |
| PATCH | `/me` | JWT | `name` only | 200 — `data: User` |

### POST /auth/signup

No token required. Creates a bcrypt-hashed account and signs in immediately.

Request:
```json
{ "name": "Alice", "email": " Alice@Example.com ", "password": "a-long-passphrase" }
```

Response **201**:
```json
{
  "data": {
    "token": "<JWT>",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "name": "Alice",
      "email": "alice@example.com",
      "createdAt": "2026-11-19T10:00:00.000Z"
    }
  }
}
```

Email is trimmed/lowercased before the unique check. Duplicate: **409 EMAIL_IN_USE**. Invalid fields/password: **400 VALIDATION_ERROR**. Signup does not accept a join code; after successful authentication the app submits its retained code to `/groups/join`.

### POST /auth/login

No token required.

Request:
```json
{ "email": "alice@example.com", "password": "a-long-passphrase" }
```

Response **200**: the same `{ "data": { "token": "<JWT>", "user": <User> } }` shape as signup. Missing account and wrong password both return **401 INVALID_CREDENTIALS**, `"Invalid email or password"`.

JWTs use HS256, subject=user ID, issuer=`pennywise`, audience=`pennywise-app`, and a seven-day lifetime. There are no refresh tokens, email verification, password reset, or logout endpoint. Client logout clears the token/cache; an issued token remains valid until expiry.

### GET /me

Token required. No body. Response **200**: `{ "data": <User> }`.

### PATCH /me

Token required. Updates only the authenticated user's display name.

Request:
```json
{ "name": "Alice Smith" }
```

Response **200**: `{ "data": <updated User> }`. Email, password, and identity fields are not accepted. Updating the name does not affect split ordering, which uses stable member IDs.

## Groups and membership

| Method | Endpoint | Access | Request body / query | Success |
| --- | --- | --- | --- | --- |
| POST | `/groups` | JWT | Body: `name` only | 201 — `data: Group` |
| GET | `/groups` | JWT; own groups only | Query: `page`, `limit` | 200 — `data: Group[]`, `pagination` |
| POST | `/groups/join` | JWT | Body: `code` | 200 — `data: Group` |
| GET | `/groups/:id` | Member | None | 200 — `data: Group` |
| GET | `/groups/:id/members` | Member | Query: `page`, `limit`, `search` | 200 — `data: { id, name }[]`, `pagination` |
| PATCH | `/groups/:id` | Group creator | Body: `name` only | 200 — `data: Group` |
| POST | `/groups/:id/join-code` | Group creator | None | 200 — `data: { joinCode }` |

### POST /groups

Token required.

Request:
```json
{ "name": "Weekend trip" }
```

Response **201**: `{ "data": <Group> }`, initially with `memberCount: 1`. Creator is automatically the first member. A unique six-character code is generated with cryptographic randomness from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Collisions regenerate the code.

### GET /groups?page=1&limit=25

Token required. No body. Response **200**: `{ "data": [<Group>], "pagination": { "page": 1, "limit": 25, "total": 1, "totalPages": 1 } }`. Only groups containing the authenticated user are returned. A user may create/join multiple groups.

### POST /groups/join

Token required.

Request:
```json
{ "code": " k7m2qx " }
```

Response **200**: `{ "data": <Group> }`. Code is trimmed and uppercased. Valid codes add the user immediately with atomic `$addToSet`; repeated/concurrent joins never duplicate membership. Already-member requests also return the group. Unknown codes: **404 NOT_FOUND**, `"Group not found"`. Missing/empty/non-string input: **400**. There is no group-full error.

### GET /groups/:id

Member required. No body. Response **200**: `{ "data": <Group> }`. All members can see/share the join code. The backend does not return a huge embedded member list.

### GET /groups/:id/members?page=1&limit=25&search=alice

Member required. No body. Optional search performs a literal, case-insensitive substring match on display name. Regex special characters are escaped, not interpreted.

Response **200**:
```json
{
  "data": [{ "id": "507f1f77bcf86cd799439011", "name": "Alice" }],
  "pagination": { "page": 1, "limit": 25, "total": 1, "totalPages": 1 }
}
```

### PATCH /groups/:id

Creator required.

Request:
```json
{ "name": "Summer trip" }
```

Response **200**: `{ "data": <renamed Group> }`. Members who are not the creator receive **403 FORBIDDEN**.

### POST /groups/:id/join-code

Creator required. No body required. Response **200**:
```json
{ "data": { "joinCode": "R8P4TZ" } }
```

The previous code stops working; existing memberships do not change. The new code is different from the current code and unique across groups. Concurrent rotations use compare-and-set retries, so a request cannot report success while keeping the code another request just installed. A later successful rotation can invalidate a code returned by an earlier request; refresh cached group metadata afterwards.

No group leaving, archiving, transfer of ownership, or deletion endpoints exist in this MVP.

## Expenses

| Method | Endpoint | Access | Request body / query | Success |
| --- | --- | --- | --- | --- |
| POST | `/groups/:id/expenses` | Member + `Idempotency-Key` | `description`, `amountCents`, `paidBy`, `splitMode`; selected mode also needs `splitUserIds` | 201 — `data: Expense` |
| GET | `/groups/:id/expenses` | Member | Query: `page`, `limit` | 200 — `data: Expense[]`, `pagination` |
| PUT | `/groups/:id/expenses/:eid` | Expense author or group creator | Required: `description`, `amountCents`, `paidBy`; optional split settings | 200 — `data: Expense` |
| DELETE | `/groups/:id/expenses/:eid` | Expense author or group creator | None | 204 — no body; soft delete |

### POST /groups/:id/expenses

Member and `Idempotency-Key` required. Payer and every split participant must be group members. Payer participation in the split is optional.

Selected request:
```json
{
  "description": "Shared snacks",
  "amountCents": 100,
  "paidBy": "507f1f77bcf86cd799439011",
  "splitMode": "selected",
  "splitUserIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"]
}
```

Everyone request:
```json
{
  "description": "Shared snacks",
  "amountCents": 100,
  "paidBy": "507f1f77bcf86cd799439011",
  "splitMode": "all"
}
```

Response **201**: `{ "data": <Expense> }` as above. Selected IDs must be non-empty/unique. `splitUserIds` is forbidden unless mode is selected. All-mode snapshots members when the request's group membership is loaded; later joins do not change existing splits.

The server alone derives `splits`: sort user IDs ascending, allocate the floor share, then give one remainder cent to the first members. 100 cents / 3 = 34,33,33. 1 cent / 3 = 1,0,0. Shares sum exactly to the amount; zero shares are allowed. Do not send `splits` or `createdBy`.

### GET /groups/:id/expenses?page=1&limit=25

Member required. No body. Response **200**: `{ "data": [<Expense>], "pagination": ... }`. Excludes soft-deleted expenses.

### PUT /groups/:id/expenses/:eid

Expense author or group creator required. Author means `createdBy`, not necessarily `paidBy`. No idempotency header required.

Request retaining the current participants:
```json
{ "description": "Corrected snacks", "amountCents": 200, "paidBy": "507f1f77bcf86cd799439012" }
```

Response **200**: `{ "data": <updated Expense> }`. Description, amount, and payer are required. Omitting split settings preserves participants and recalculates their equal shares. To change participants, include either `splitMode: "all"`, or `splitMode: "selected"` plus `splitUserIds`. Existing expenses may be edited after settlements; payments remain recorded and balances are recomputed.

### DELETE /groups/:id/expenses/:eid

Expense author or group creator required. No body. Response **204**, including repeated authorized deletion of the same tombstone. Soft deletion hides it from lists and calculations, but retains immutable creation metadata. Editing a deleted expense returns **404**. IDs from another group return **404**.

## Balances and suggested payments

| Method | Endpoint | Access | Request | Success |
| --- | --- | --- | --- | --- |
| GET | `/groups/:id/balances` | Member | No body or pagination | 200 — `data: { userId, balanceCents, name }[]` |
| GET | `/groups/:id/settle-up` | Member | No body or pagination | 200 — `data: { fromUser, toUser, amountCents }[]` |

### GET /groups/:id/balances

Member required. No body or pagination. With only the 100-cent example expense, response **200**:
```json
{
  "data": [
    { "userId": "507f1f77bcf86cd799439011", "balanceCents": 66, "name": "Alice" },
    { "userId": "507f1f77bcf86cd799439012", "balanceCents": -33, "name": "Bob" },
    { "userId": "507f1f77bcf86cd799439013", "balanceCents": -33, "name": "Charlie" }
  ]
}
```

Positive means should receive money; negative means owes money. The server recomputes from **all active expenses and non-deleted settlements**, regardless of pagination. Membership is refreshed after loading the ledger to account for users who joined and recorded data while the request was running. No running balances are stored. BigInt arithmetic protects internal sums; a resulting balance outside safe JSON integer range returns **422 BALANCE_OVERFLOW**, never rounded values.

### GET /groups/:id/settle-up

Member required. No body or pagination. For the same example, response **200**:
```json
{
  "data": [
    { "fromUser": "507f1f77bcf86cd799439012", "toUser": "507f1f77bcf86cd799439011", "amountCents": 33 },
    { "fromUser": "507f1f77bcf86cd799439013", "toUser": "507f1f77bcf86cd799439011", "amountCents": 33 }
  ]
}
```

Greedy matches initially sorted debtors/creditors, breaking ties by ID. Every payment clears at least one remaining balance, so at most n−1 payments for n non-zero members. All-zero groups return `data: []`. This is **not a guarantee of the absolute minimum payment count**. Responses are deterministic for a fixed ledger; concurrently changing ledgers can produce different responses.

## Settlements and corrections

| Method | Endpoint | Access | Request body / query | Success |
| --- | --- | --- | --- | --- |
| POST | `/groups/:id/settlements` | Any member + `Idempotency-Key` | `fromUser`, `toUser`, `amountCents` | 201 — `data: Settlement` |
| GET | `/groups/:id/settlements` | Member | Query: `page`, `limit`; includes deleted records | 200 — `data: Settlement[]`, `pagination` |
| PUT | `/groups/:id/settlements/:sid` | Any member | `fromUser`, `toUser`, `amountCents` | 200 — `data: Settlement` |
| DELETE | `/groups/:id/settlements/:sid` | Any member | None | 204 — no body; soft delete |

### POST /groups/:id/settlements

Any member and `Idempotency-Key` required.

Request:
```json
{ "fromUser": "507f1f77bcf86cd799439012", "toUser": "507f1f77bcf86cd799439011", "amountCents": 20 }
```

Response **201**: `{ "data": <Settlement> }`. Both accounts must be group members and distinct. Any member can enter it on their behalf; `createdBy` comes from the JWT. Partial payments, overpayments, and payments not in the suggestion list are accepted. Sending money increases the sender's net balance and decreases the receiver's. Overpayment can reverse the debt.

This is only a record of an external payment, not a verified transfer or payment-provider integration.

### GET /groups/:id/settlements?page=1&limit=25

Member required. No body. Response **200**: `{ "data": [<Settlement>], "pagination": ... }`. Includes deleted records for shared history. The UI must label/strike through records with non-null `deletedAt`; they do not affect balances.

### PUT /groups/:id/settlements/:sid

Any member required. No idempotency header required.

Request:
```json
{ "fromUser": "507f1f77bcf86cd799439012", "toUser": "507f1f77bcf86cd799439011", "amountCents": 30 }
```

Response **200**: `{ "data": <updated Settlement> }`. All three fields are required. Sender/receiver membership and positive amount are validated again. Creator stays unchanged; latest editor/timestamp are updated. Correcting the record does not reverse any real transfer. Concurrent edits use last successful write wins; this MVP has no version/conflict protocol.

### DELETE /groups/:id/settlements/:sid

Any member required. No body. Response **204**, including repeated authorized deletion. Soft-deletes and records actor/time. History retains it, balances exclude it, and further PUT returns **404**. No restore endpoint exists.

## Health

| Method | Endpoint | Access | Request | Success / unavailable |
| --- | --- | --- | --- | --- |
| GET | `/health` | Public | None | 200 — `data: { status: "ok" }`; 503 — `data: { status: "unavailable" }` |

### GET /health

Public, no body. **200** when connected:
```json
{ "data": { "status": "ok" } }
```
**503** when disconnected: `{ "data": { "status": "unavailable" } }`.

## Errors

Example **403**:
```json
{ "error": { "code": "FORBIDDEN", "message": "You are not a member of this group" } }
```

- **400 VALIDATION_ERROR**: malformed IDs, unknown body fields, invalid cents, missing/invalid UUID key, or invalid pagination.
- **400 INVALID_MEMBERS**: a payer, split user, sender, or receiver is not a group member.
- **400 INVALID_JSON**: invalid JSON body.
- **401 UNAUTHENTICATED**: missing/invalid/expired JWT or nonexistent account.
- **401 INVALID_CREDENTIALS**: login failed.
- **403 FORBIDDEN**: group non-member or unauthorized creator/expense-author action.
- **403 CORS_FORBIDDEN**: browser Origin is not allowed.
- **404 NOT_FOUND**: unknown code, missing record/group, deleted edit target, cross-group record ID, or unknown authenticated endpoint.
- **409 EMAIL_IN_USE**: normalized email already registered.
- **409 IDEMPOTENCY_CONFLICT**: key reused with a different normalized request.
- **413 PAYLOAD_TOO_LARGE**: JSON exceeds 1 MiB.
- **415 UNSUPPORTED_MEDIA_TYPE**: unsupported JSON charset or content encoding.
- **422 BALANCE_OVERFLOW**: aggregate balance cannot be represented safely as integer cents.
- **503 CODE_UNAVAILABLE**: code generation exhausted its bounded collision retries; retry later.
- **500 INTERNAL_ERROR**: generic server error; no database details or stack traces in the response.

Authentication and membership are checked before controller validation on protected group routes. Consequently a non-member receives 403 even if their write body is invalid. Unknown routes without a token may return 401.

**Rate limiting is deferred at the user's request, including group joining. There are no implemented 429 responses yet. Add brute-force protection before public production exposure.**

## cURL walkthrough

Start the server following [backend setup](backend-setup.md). Create Alice:

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@example.com","password":"a-long-passphrase"}'
```

Copy `data.token` into a local shell variable, then create a group:

```bash
export TOKEN='<returned JWT>'
curl -X POST http://localhost:3000/groups \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Weekend trip"}'
```

Sign up Bob in another request, then use Bob's token with `/groups/join` and Alice's returned join code. Copy the returned group ID:

```bash
export GROUP_ID='<returned group ID>'
export ALICE_ID='<Alice user ID>'
curl -X POST "http://localhost:3000/groups/$GROUP_ID/expenses" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: 5e5c502a-d5bd-44d8-9dcf-51d78f793f90' \
  -d "{\"description\":\"Dinner\",\"amountCents\":1000,\"paidBy\":\"$ALICE_ID\",\"splitMode\":\"all\"}"
curl "http://localhost:3000/groups/$GROUP_ID/balances" -H "Authorization: Bearer $TOKEN"
curl "http://localhost:3000/groups/$GROUP_ID/settle-up" -H "Authorization: Bearer $TOKEN"
```

Repeat the expense request with the same key/body to test replay. Use a **different key** for another dinner.

## Frontend integration notes

Frontend changes are not included in this backend task. The app should:

- Keep JWTs in expo-secure-store; never cache tokens in AsyncStorage.
- Preserve an entered join code through login/signup, then POST `/groups/join` with the returned token. If joining fails, keep the account logged in and allow retry.
- Cache only loaded pages, member details, latest balances, and suggestions/history as needed. Namespace cached data by user, group, and query/page.
- Disable writes offline with “You're offline”; show “Showing saved data” and indicate incomplete saved lists. Offline searches cannot find unfetched members.
- Refetch/replace affected cache pages and financial views on reconnect and after successful writes; no offline write queue/conflict resolution.
- On a genuine network failure, show offline/retry behavior. Do not label HTTP validation, authorization, or server errors as offline.
- On expired/invalid-token 401, require login again and clear the old session/cache. Clear all account caches on logout to avoid cross-account leakage.
- Use scrollable/searchable member and split pickers. Everyone mode avoids downloading every member just to submit the split.

No API member cap is imposed, but storage is finite: MongoDB has a 16 MiB document limit, creation snapshots increase ledger document size, and full-ledger calculations can become resource-heavy. Do not interpret unlimited membership as infinite practical capacity.
