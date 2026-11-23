# Pennywise API reference

This documents the implemented backend. Development base URL: `http://localhost:3000`. Production must use HTTPS. IDs in examples are illustrative valid ObjectId strings; replace them with IDs returned by your server. Tokens and request keys below are examples, not credentials.

## Swagger (backend)

Open `http://localhost:3000/docs/` for interactive Swagger UI. Obtain a token with signup/login, click **Authorize**, and enter the token (without the `Bearer` prefix). Authorization is not persisted across browser reloads. Try it out makes real requests to this backend, so use the isolated preview server for experiments. No frontend server is required.

| Method | Path | Permission | Input | Response |
|---|---|---|---|---|
| GET | `/openapi.json` | Public | None | 200 — raw OpenAPI 3.1 JSON (not wrapped in `data`) |

## Conventions

- Send `Content-Type: application/json` for JSON bodies.
- Except signup, login, and health, send `Authorization: Bearer <token>`.
- Success: `{ "data": ... }`. Paginated success also includes `pagination`.
- DELETE success is **204 No Content**, with no JSON body.
- Errors: `{ "error": { "code": "...", "message": "..." } }`.
- Money is JSON **number** integer hundredths of INR (paise), from 1 through `9007199254740991`. Existing field names retain the `Cents` suffix. Decimal amounts and numeric strings are rejected. No currency conversion or real payment processing.
- Dates are UTC ISO 8601 strings. API `id` fields represent MongoDB `_id`.
- Names: 1–80 characters after trimming. Expense descriptions: 1–200. Search: at most 80.
- Unknown JSON body fields are rejected. Do not send database-only fields such as `createdBy` or hashes. Explicit shares are allowed only in `custom` split mode.
- Signup passwords: at least 8 Unicode characters, at most 72 UTF-8 bytes. Passwords are not trimmed. Login also rejects passwords beyond 72 bytes to avoid bcrypt truncation.
- Group-specific endpoints require membership, even when retrying a write.

### Pagination

Groups, members, expenses, categories, activity, statements, and settlement history use `?page=1&limit=25`.
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
- Selected and excluded split IDs are sorted for fingerprinting; reordering the same IDs is a matching retry.
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
  "avatar": "initials",
  "avatarColor": "emerald",
  "image": null,
  "notifications": { "expenses": true, "payments": true, "members": true },
  "createdAt": "2026-11-19T10:00:00.000Z"
}
```

Only authentication and `/me` expose the authenticated user's email. Member lists contain only `id`, `name` and `image`. Password hashes are never returned.

### Group

```json
{
  "id": "507f191e810c19729de860ea",
  "name": "Weekend trip",
  "description": "A weekend by the sea",
  "icon": "airplane",
  "color": "emerald",
  "image": null,
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
  "category": { "id": "food", "name": "Food & drinks", "icon": "food", "color": "amber" },
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

`createdBy` is who entered the payment, not necessarily the sender. It never changes. Corrections set `updatedBy` and `updatedAt`; deletion also sets `deletedAt` and `deletedBy`. Complete changes recorded after activity tracking was introduced are available through `/groups/:id/activity`.

## Authentication and profile
Both User and Group responses include `image`: `null` (initials), `preset:people|airplane|home|restaurant|briefcase|heart`, or a Cloudinary HTTPS image URL from the configured cloud. PATCH `/me`, POST `/groups` and PATCH `/groups/:id` accept this field. Group editing remains creator-only.

| Method | Endpoint | Access | Request body | Success |
| --- | --- | --- | --- | --- |
| POST | `/auth/signup` | Public | `name`, `email`, `password` | 201 — `data: { token, user }` |
| POST | `/auth/login` | Public | `email`, `password` | 200 — `data: { token, user }` |
| GET | `/me` | JWT | None | 200 — `data: User` |
| PATCH | `/me` | JWT | Any of `name`, `image`, `avatar`, `avatarColor` | 200 — `data: User` |
| PATCH | `/me/notifications` | JWT | Any of `expenses`, `payments`, `members` (booleans) | 200 — `data: User` |
| PUT | `/me/push-token` | JWT | `token` (Expo push token) | 204 |
| DELETE | `/me/push-token` | JWT | `token` (Expo push token) | 204 |

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

### Push notifications

Pushes are sent through the Expo push service (backed by Firebase Cloud Messaging on Android) after a write succeeds; a failed push never fails the request. The acting user is never notified of their own action.

| Type (`notifications.*`) | Sent to | When |
| --- | --- | --- |
| `expenses` | Payer and everyone in the split (including members removed by an edit) | Expense added, edited or deleted |
| `payments` | The sender and receiver of the payment | Payment added, edited or deleted |
| `members` | Every other group member | Someone joins via invite code |

Each push carries `data: { type, groupId }` so the app can open the group. Idempotent replays of a create do not notify twice. `PUT /me/push-token` moves a token off any other account, so a shared device only alerts whoever signed in last. Set `EXPO_ACCESS_TOKEN` on the server to use Expo's enhanced push security.

### GET /me

Token required. No body. Response **200**: `{ "data": <User> }`.

### PATCH /me

Token required. Updates the authenticated user's display name, photo or preset avatar. Provide at least one field. `avatar`: `initials`, `leaf`, `sun`, `sparkles`, `coffee`. `avatarColor`: `emerald`, `blue`, `amber`, `violet`, `rose`. `image`: `null`, a `preset:` value or a URL returned by `POST /media/images` (see below).

Request:
```json
{ "name": "Alice Smith" }
```

Response **200**: `{ "data": <updated User> }`. Email, password, and identity fields are not accepted. Updating the name does not affect split ordering, which uses stable member IDs.

## Groups and membership
### Cross-group data and photos

| Method | Path | Permission | Input | Response |
|---|---|---|---|---|
| GET | `/dashboard` | JWT | None | 200 — `data: { groups: Group[], summaries: { [groupId]: { expenseCount, spendingCents, balanceCents } }, totals: { expenseCount, spendingCents, balanceCents } }` |
| GET | `/activity` | JWT | `kind=all|expenses|payments`, `page`, `limit` | 200 — paginated expense/payment audit entries with `group`, `fromName`, `toName` |
| POST | `/media/images` | JWT | `{ image: "data:image/jpeg;base64,..." }` (JPEG/PNG/WebP, up to 5 MB) | 201 — `data: { image: "https://res.cloudinary.com/..." }` |

Dashboard includes all your groups and the full non-deleted ledger; activity is globally sorted and paginated, not a truncated merge of each group's first page. Neither endpoint accepts a different user ID. Totals exceeding safe integer cents return 422. Counts and ledger reads are not transaction snapshots.

Photo uploads require the three Cloudinary server environment variables in `server/.env.example`. The server signs/uploads images itself; no API secret is sent to the app. Missing configuration returns 503 and presets remain usable. Upload attempts are limited to five per authenticated user per minute per server process (429); use a shared rate limiter before scaling to multiple instances. Images are publicly accessible to anyone with the URL: do not upload sensitive documents. Removing/replacing an image clears its reference, not its Cloudinary asset; unused uploads require periodic Cloudinary cleanup. No database reseeding is needed.

| Method | Endpoint | Access | Request body / query | Success |
| --- | --- | --- | --- | --- |
| POST | `/groups` | JWT | Body: `name`; optional `description`, `icon`, `color` | 201 — `data: Group` |
| GET | `/groups` | JWT; own groups only | Query: `page`, `limit` | 200 — `data: Group[]`, `pagination` |
| POST | `/groups/join` | JWT | Body: `code` | 200 — `data: Group`, `alreadyMember` |
| GET | `/groups/:id` | Member | None | 200 — `data: Group` |
| GET | `/groups/:id/members` | Member | Query: `page`, `limit`, `search` | 200 — `data: { id, name, image }[]`, `pagination` |
| PATCH | `/groups/:id` | Group creator | Any of `name`, `description`, `icon`, `color` | 200 — `data: Group` |
| POST | `/groups/:id/join-code` | Group creator | None | 200 — `data: { joinCode }` |

### POST /groups

Token required.

Request:
```json
{ "name": "Weekend trip" }
```

Response **201**: `{ "data": <Group> }`, initially with `memberCount: 1`. Creator is automatically the first member. A unique six-character code is generated with cryptographic randomness from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Collisions regenerate the code.

Description defaults to empty and is at most 200 trimmed characters. Icons: `people`, `airplane`, `home`, `restaurant`, `briefcase`, `heart`; default `people`. Colors: `emerald`, `blue`, `amber`, `violet`, `rose`; default `emerald`. PATCH accepts any non-empty subset of these metadata fields.

### GET /groups?page=1&limit=25

Token required. No body. Response **200**: `{ "data": [<Group>], "pagination": { "page": 1, "limit": 25, "total": 1, "totalPages": 1 } }`. Only groups containing the authenticated user are returned. A user may create/join multiple groups.

### POST /groups/join

Token required.

Request:
```json
{ "code": " k7m2qx " }
```

Response **200**: `{ "data": <Group>, "alreadyMember": false }` for a new membership, or `true` for an existing one. Code is trimmed and uppercased. Atomic version-checked writes commit membership and its audit entry together. Of concurrent first joins by the same user, exactly one returns `false`; retries never duplicate membership or join events. Unknown codes: **404 NOT_FOUND**, `"Group not found"`. Missing/empty/non-string input: **400**. There is no group-full error.

### GET /groups/:id

Member required. No body. Response **200**: `{ "data": <Group> }`. All members can see/share the join code. The backend does not return a huge embedded member list.

### GET /groups/:id/members?page=1&limit=25&search=alice

Member required. No body. Optional search performs a literal, case-insensitive substring match on display name. Regex special characters are escaped, not interpreted.

Response **200**:
```json
{
  "data": [{ "id": "507f1f77bcf86cd799439011", "name": "Alice", "image": null }],
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
Custom splits use `splitMode: "custom"` with `customSplits: [{ userId, shareCents }]`. Shares must be non-negative integers, member IDs must be unique and belong to the group, and the shares must sum exactly to `amountCents`. Do not include `splitUserIds` or `excludedUserIds` in custom mode. Custom share order is normalized for idempotency. Omitted mode on edits continues to preserve the original participants and divide equally; choose custom mode explicitly to preserve unequal amounts.

| Method | Endpoint | Access | Request body / query | Success |
| --- | --- | --- | --- | --- |
| POST | `/groups/:id/expenses` | Member + `Idempotency-Key` | `description`, `amountCents`, `paidBy`, `categoryId`, `splitMode`; selected needs `splitUserIds`, allExcept needs `excludedUserIds` | 201 — `data: Expense` |
| GET | `/groups/:id/expenses` | Member | Query: `page`, `limit` | 200 — `data: Expense[]`, `pagination` |
| GET | `/groups/:id/expenses/:eid` | Member | None | 200 — `data: Expense` |
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
  "categoryId": "food",
  "splitUserIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"]
}
```

Everyone request:
```json
{
  "description": "Shared snacks",
  "amountCents": 100,
  "paidBy": "507f1f77bcf86cd799439011",
  "splitMode": "all",
  "categoryId": "food"
}
```

Response **201**: `{ "data": <Expense> }` as above. Selected IDs must be non-empty/unique. `splitUserIds` is forbidden unless mode is selected. All-mode snapshots members when the request's group membership is loaded; later joins do not change existing splits.

Everyone except selected members uses `splitMode: "allExcept"` and a non-empty, unique `excludedUserIds` array of current group members. Exclusions are forbidden in other modes. At least one participant must remain; the payer can be excluded. The backend computes the included IDs without the client downloading every member. Saved participants are still snapshots.

New expenses require an active standard or group-specific `categoryId`. Category metadata is saved as a snapshot. Omitting `categoryId` on edits preserves the existing category; editing with the same archived category is allowed, but an archived category cannot be selected for another expense. Old expenses return `category: null` and display as Uncategorized. Explicitly choosing an active category refreshes its name/icon/color snapshot.

The server alone derives `splits`: sort user IDs ascending, allocate the floor share, then give one remainder cent to the first members. 100 cents / 3 = 34,33,33. 1 cent / 3 = 1,0,0. Shares sum exactly to the amount; zero shares are allowed. Do not send `splits` or `createdBy`.

### GET /groups/:id/expenses?page=1&limit=25

Member required. No body. Response **200**: `{ "data": [<Expense>], "pagination": ... }`. Excludes soft-deleted expenses.

### PUT /groups/:id/expenses/:eid

Expense author or group creator required. Author means `createdBy`, not necessarily `paidBy`. No idempotency header required.

Request retaining the current participants:
```json
{ "description": "Corrected snacks", "amountCents": 200, "paidBy": "507f1f77bcf86cd799439012" }
```

Response **200**: `{ "data": <updated Expense> }`. Description, amount, and payer are required. Omitting split settings preserves participants and recalculates their equal shares. To change participants, include `splitMode: "all"`, `"selected"` plus `splitUserIds`, or `"allExcept"` plus `excludedUserIds`. Existing expenses may be edited after settlements; payments remain recorded and balances are recomputed.

### DELETE /groups/:id/expenses/:eid

Expense author or group creator required. No body. Response **204**, including repeated authorized deletion of the same tombstone. Soft deletion hides it from lists and calculations, but retains immutable creation metadata. Editing a deleted expense returns **404**. IDs from another group return **404**.

## Balances and suggested payments

| Method | Endpoint | Access | Request | Success |
| --- | --- | --- | --- | --- |
| GET | `/groups/:id/balances` | Member | No body or pagination | 200 — `data: { userId, balanceCents, name, image }[]` |
| GET | `/groups/:id/settle-up` | Member | No body or pagination | 200 — `data: { fromUser, toUser, amountCents }[]` |

### GET /groups/:id/balances

Member required. No body or pagination. With only the 100-cent example expense, response **200**:
```json
{
  "data": [
    { "userId": "507f1f77bcf86cd799439011", "balanceCents": 66, "name": "Alice", "image": null },
    { "userId": "507f1f77bcf86cd799439012", "balanceCents": -33, "name": "Bob", "image": null },
    { "userId": "507f1f77bcf86cd799439013", "balanceCents": -33, "name": "Charlie", "image": null }
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

Response **200**: `{ "data": <updated Settlement> }`. All three fields are required. Sender/receiver membership and positive amount are validated again. Creator stays unchanged; latest editor/timestamp are updated. Correcting the record does not reverse any real transfer. Concurrent edits use bounded compare-and-set retries to keep audit before-images accurate; the last successful write wins. Exhausted retries return **409 WRITE_CONFLICT**.

### DELETE /groups/:id/settlements/:sid

Any member required. No body. Response **204**, including repeated authorized deletion. Soft-deletes and records actor/time. History retains it, balances exclude it, and further PUT returns **404**. No restore endpoint exists.

## Categories

| Method | Endpoint | Access | Request body / query | Success |
| --- | --- | --- | --- | --- |
| GET | `/groups/:id/categories` | Member | `page`, `limit`, `search`, `includeArchived=true\|false` | 200 — `data: Category[]`, `pagination` |
| POST | `/groups/:id/categories` | Member | `name`; optional `icon`, `color` | 201 — `data: Category` |
| PATCH | `/groups/:id/categories/:cid` | Group creator | Any of `name`, `icon`, `color`, `archived` | 200 — `data: Category` |

Category: `{ id, name, icon, color, standard, archivedAt }`. Standard categories appear first, then custom categories sorted by name/ID. Search is literal and case-insensitive. Archives are omitted by default. Icons: `food`, `cart`, `bus`, `home`, `bulb`, `bag`, `game`, `airplane`, `heart`, `grid` (default); colors use the same five presets as groups.

Standards are read-only: `food` (Food & drinks), `groceries`, `transport`, `rent`, `utilities`, `shopping`, `entertainment`, `travel`, `health`, `other`. Any member can create a custom category. Only the group creator can rename/archive one. Normalized names are unique within a group, including archived names, and cannot conflict with standards. Duplicates return **409 CATEGORY_NAME_IN_USE**. Unknown, archived new choices or cross-group choices return **400 INVALID_CATEGORY**. Archive, do not delete; `archived: false` can restore a custom category. Existing expense snapshots are not rewritten on category changes.

## Activity and corrected statements

| Method | Endpoint | Access | Query | Success |
| --- | --- | --- | --- | --- |
| GET | `/groups/:id/activity` | Member | `page`, `limit`, `kind=all\|expenses\|payments\|group\|categories` | 200 — `data: AuditEvent[]`, `pagination` |
| GET | `/groups/:id/statements` | Member | `page`, `limit`, `view=member\|spending`, `userId` (defaults to self) | 200 — `data: Statement`, `pagination` |

Audit events: `{ id, actorId, actorName, action, at, before, after }`, newest first. Actor names are captured at action time. Group creation/update/invite regeneration, joins, category creation/update/archive, and expense/payment creation/edit/deletion are recorded. Each event commits **in the same atomic document write** as its action, compatible with standalone MongoDB. Optimistic version retries preserve before-images; failed actions add no events. Deleted records remain queryable here. Invite codes, emails, password hashes, and idempotency keys/snapshots are never stored in audit details. Reliable activity starts when this feature is introduced; earlier actions are not reconstructed or invented.

Events are embedded on the changed document and merged using MongoDB `$unionWith` (MongoDB 4.4+). MongoDB's 16 MiB document limit still applies. No pruning is performed because that would lose history; a record that fills up fails its entire action rather than dropping audit events. Larger-scale deployment needs monitored document sizes and a transactional separate audit collection.

Statement: `{ view, userId, rows, openingBalanceCents, closingBalanceCents, overallBalanceCents, generatedAt }`. Rows sort by original creation time then ID ascending. Row: `{ id, type, createdAt, description, category, amountCents, paidCents, shareCents, sentCents, receivedCents, deltaCents, balanceCents }`.

- Member delta = paid − share + sent − received. Positive balance means credit (should receive), negative means debt (owes).
- Group spending includes expenses only; delta = expense amount, running balance = cumulative spending. Repayments never reduce it.
- Calculations use **the full current ledger**, before slicing the page. Opening/closing balances refer to this page; overall balance includes every matching row. Internal arithmetic is BigInt; overflow returns 422 instead of rounding.
- Corrections replace values at the **original transaction dates**, and deleted records are excluded. Historical running balances can therefore change. Activity is the historical change log; statements are not immutable snapshots.
- Concurrent ledger reads are not a cross-document transaction snapshot; refresh after changes.

## Health check

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
- **429 RATE_LIMITED / AUTH_RATE_LIMITED / JOIN_RATE_LIMITED / UPLOAD_LIMIT**: see [Rate limits](#rate-limits).
- **415 UNSUPPORTED_MEDIA_TYPE**: unsupported JSON charset or content encoding.
- **422 BALANCE_OVERFLOW**: aggregate balance cannot be represented safely as integer cents.
- **503 CODE_UNAVAILABLE**: code generation exhausted its bounded collision retries; retry later.
- **500 INTERNAL_ERROR**: generic server error; no database details or stack traces in the response.

Authentication and membership are checked before controller validation on protected group routes. Consequently a non-member receives 403 even if their write body is invalid. Unknown routes without a token may return 401.

## Rate limits

Limits are per client IP unless noted, counted in server memory over a 15-minute window, and every limited response is **429** with the standard error body plus `RateLimit` headers.

| Scope | Limit | Code |
| --- | --- | --- |
| Every route except `/health` | 1500 requests | `RATE_LIMITED` |
| `POST /auth/signup` and `/auth/login` (shared budget) | 20 requests | `AUTH_RATE_LIMITED` |
| `POST /groups/join` (per signed-in user) | 15 requests | `JOIN_RATE_LIMITED` |
| `POST /media/images` (per signed-in user) | 5 per minute | `UPLOAD_LIMIT` |

Behind a reverse proxy, set `TRUST_PROXY` to the number of proxy hops; otherwise every client shares the proxy's IP. Counters reset on restart and are not shared between instances.

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
