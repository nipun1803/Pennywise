# Pennywise architecture

How the system is put together and why. For endpoint details see [api.md](api.md); for running it see [backend-setup.md](backend-setup.md). Related deep dives: [data-model.md](data-model.md), [balances-and-settlement.md](balances-and-settlement.md), [user-flows.md](user-flows.md), [testing.md](testing.md).

## High-level design

```mermaid
flowchart LR
  subgraph Device["Phone / web browser"]
    App["Expo app<br/>(React Native + expo-router)"]
    Secure[("SecureStore<br/>session token")]
    Cache[("AsyncStorage<br/>read cache + pending intents")]
    App --- Secure
    App --- Cache
  end

  subgraph Server["Pennywise API (Node 22, Express 5, TypeScript)"]
    MW["helmet · CORS · JSON parser<br/>JWT auth · group membership"]
    Ctrl["Controllers<br/>(HTTP in/out, Zod validation)"]
    Svc["Services<br/>(ledger, idempotency, audit, notifications)"]
    Money["shared/money.ts<br/>(pure integer-paise maths)"]
    MW --> Ctrl --> Svc --> Money
  end

  DB[("MongoDB<br/>users · groups · expenses<br/>settlements · categories")]
  Expo["Expo Push service"]
  Cloud["Cloudinary<br/>(image hosting)"]

  App -- "HTTPS JSON + Bearer JWT" --> MW
  Svc -- Mongoose --> DB
  Svc -. "best-effort push, batched by 100" .-> Expo
  Expo -.-> App
  Ctrl -- "signed upload" --> Cloud
  App -- "loads images" --> Cloud
```

| Component | Responsibility |
| --- | --- |
| **Expo client** | All UI. Holds the JWT in SecureStore, caches successful reads per account in AsyncStorage, and blocks writes while offline. |
| **Express API** | Stateless REST API. Every request is authenticated by JWT; group routes additionally load the group and check membership. |
| **MongoDB** | Single source of truth. No running totals are stored; balances are always recomputed from the ledger. |
| **Expo Push** | Delivers notifications for expenses, payments and new members. Failures never affect the write that triggered them. |
| **Cloudinary** | Stores profile and group photos. The server signs uploads so the API secret never reaches the client. |

The server is stateless apart from in-memory rate-limit counters, so it can run as a single Docker container (see `server/Dockerfile` and `server/compose.yaml`).

## Server layers

```mermaid
flowchart TD
  R["routes/<br/>which URL maps to which handler"] --> M["middleware/<br/>authenticate · requireMembership"]
  M --> C["controllers/<br/>parse request, shape response"]
  C --> V["validators/<br/>Zod schemas"]
  C --> S["services/<br/>business rules"]
  S --> SH["shared/money.ts<br/>pure functions, no I/O"]
  S --> MO["models/<br/>Mongoose schemas + indexes"]
  C --> U["utils/<br/>errors · pagination · serialize"]
```

| Folder | Rule of thumb |
| --- | --- |
| `routes/` | One file per resource. No logic, only mounting. |
| `middleware/` | Cross-cutting request checks. `requireMembership` puts the group on `res.locals` so controllers never re-query it. |
| `controllers/` | Thin: validate input with Zod, call a service, serialize the result. |
| `services/` | Everything that touches more than one document or has a business rule (permissions, idempotency, audit, notifications). |
| `shared/money.ts` | Pure, framework-free arithmetic on integer paise using `BigInt`. Easy to unit test. |
| `models/` | One file per collection, plus `shared.ts` for fields that expenses and settlements have in common. `index.ts` re-exports everything. |
| `utils/` | `ApiError` + the global error handler, pagination helpers, and `*View` serializers that decide which fields leave the server. |

### Route map

`routes/index.ts` only composes the per-resource routers. Order matters in two places, called out below.

```mermaid
flowchart LR
  root["apiRoutes()"] --> auth["/auth → auth.ts<br/>signup, login"]
  root --> jwt{{"authenticate<br/>(everything below needs a JWT)"}}
  jwt --> media["/media → media.ts"]
  jwt --> me["/me → users.ts"]
  jwt --> dash["/dashboard, /activity → dashboard.ts"]
  jwt --> groups["/groups → groups.ts<br/>create, list, join"]
  jwt --> member{{"/groups/:id<br/>requireMembership"}}
  member --> gm["groups.ts (member routes)<br/>detail, edit, join-code, members,<br/>balances, settle-up"]
  member --> rec["records.ts<br/>activity, statements"]
  member --> cat["/categories → categories.ts"]
  member --> exp["/expenses → expenses.ts"]
  member --> set["/settlements → settlements.ts"]
```

1. `/auth` is mounted **before** `authenticate`, so signup and login work without a token.
2. `/groups` is mounted **before** `/groups/:id`. Otherwise `POST /groups/join` would be read as a group whose id is `join` and rejected by `requireMembership`.

`/health`, `/openapi.json` and the Swagger UI at `/docs` are registered directly in `app.ts`, outside the authenticated router.

## Request lifecycle

Every request passes the same chain. Errors at any step are thrown and turned into `{ "error": { "code", "message" } }` by one handler in `utils/errors.ts`.

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant A as app.ts
  participant Auth as authenticate
  participant Mem as requireMembership
  participant Ctl as Controller
  participant Svc as Service
  participant DB as MongoDB

  C->>A: HTTP request + Authorization: Bearer JWT
  A->>A: helmet, CORS check, JSON body (1 MB, 7 MB for /media/images)
  A->>Auth: route matched
  Auth->>Auth: verify HS256 signature, issuer, audience, expiry
  Auth->>DB: User.exists(sub)
  Auth->>Mem: res.locals.userId set
  Mem->>DB: Group.findById(:id)
  Mem->>Ctl: res.locals.group set (403 if not a member)
  Ctl->>Ctl: Zod parse body/query (400 VALIDATION_ERROR on failure)
  Ctl->>Svc: call business logic
  Svc->>DB: reads / writes
  Svc-->>Ctl: result
  Ctl-->>C: 2xx { data, pagination? }
  Note over A,C: Any thrown ApiError / ZodError → errorHandler → { error: { code, message } }
```

## Key flows

### Sign up and log in

```mermaid
sequenceDiagram
  participant U as User
  participant App as Expo app
  participant API as API
  participant DB as MongoDB

  U->>App: name, email, password
  App->>API: POST /auth/signup
  API->>API: Zod: password ≥ 8 chars and ≤ 72 bytes (bcrypt limit)
  API->>API: bcrypt.hash(password, 12)
  API->>DB: User.create (unique email index)
  alt email already used
    DB-->>API: duplicate key 11000
    API-->>App: 409 EMAIL_IN_USE
  else created
    API->>API: jwt.sign(sub=userId, 7 days, HS256)
    API-->>App: 201 { token, user }
    App->>App: save session in SecureStore
    App->>API: PUT /me/push-token (if notifications allowed)
  end
```

Login always runs `bcrypt.compare`, even for unknown emails (against a fixed dummy hash). That way response time and the error message (`INVALID_CREDENTIALS`) don't reveal whether an account exists.

### Add an expense (idempotent create)

Mobile networks drop responses. If the client retries a create, the server must not record the expense twice. The client stores an **intent** (the request body plus a UUID key) *before* sending, and reuses that key on any retry, even after an app restart.

```mermaid
sequenceDiagram
  autonumber
  participant App as Expo app
  participant Store as AsyncStorage
  participant API as POST /groups/:id/expenses
  participant Idem as idempotency.createOnce
  participant DB as MongoDB
  participant Push as notifications

  App->>Store: read intent for this payload
  alt no saved intent
    App->>Store: save { payload, key: uuid.v4() }
  end
  App->>API: body + Idempotency-Key
  API->>Idem: scope = (groupId, userId, key), hash = sha256(normalized body)
  Idem->>DB: find record with same scope (including deleted)
  alt found, same hash
    DB-->>App: replay stored creationResponse (no new write)
  else found, different hash
    Idem-->>App: 409 IDEMPOTENCY_CONFLICT
  else not found
    Idem->>DB: insert Expense with requestKey, requestHash, creationResponse, first audit event
    alt parallel retry won the race
      DB-->>Idem: duplicate key on unique (groupId, createdBy, requestKey)
      Idem->>DB: look up the winner
      Idem-->>App: replay winner's response
    else inserted
      Idem--)Push: notifyExpense (fire and forget)
      Idem-->>App: 201 { data: expense }
    end
  end
  App->>Store: clear intent on success or definite 4xx
```

The key, hash and original response live **inside the expense document**, so there is no second collection to keep consistent. That works on a standalone MongoDB without transactions.

### Edit with an audit trail (optimistic concurrency)

Edits, deletes, renames and joins go through `services/audit.ts → auditedUpdate`, which applies the change and appends the audit event in a single document write:

```mermaid
sequenceDiagram
  participant Svc as Service
  participant DB as MongoDB
  loop up to 12 attempts
    Svc->>DB: findOne(filter) → current doc with __v = n
    Svc->>Svc: compute updates + before/after snapshot (permission re-checked)
    Svc->>DB: findOneAndUpdate({ ...filter, __v: n }, $set updates, $push auditEvent, $inc __v)
    alt matched
      DB-->>Svc: updated doc → done
    else someone else wrote first
      DB-->>Svc: null → retry with fresh read
    end
  end
  Svc-->>Svc: 409 WRITE_CONFLICT after 12 misses
```

Because the version check and the audit push happen in the same atomic update, an audit entry can never describe a state that was not actually written.

### Push notification fan-out

```mermaid
sequenceDiagram
  participant Svc as ledger service
  participant N as notifications.ts
  participant DB as MongoDB
  participant Expo as Expo Push API

  Svc--)N: notifyExpense(change, group, actor, expense, previous?)
  Note over Svc: HTTP response is already on its way, push never delays it
  N->>N: recipients = payer + split members (+ previous ones on edit) − actor
  N->>DB: load recipients' pushTokens + notification preferences
  N->>N: drop users who muted this kind (expenses / payments / members)
  loop batches of 100 messages
    N->>Expo: POST /push/send
    Expo-->>N: tickets
    N->>DB: $pull tokens that returned DeviceNotRegistered
  end
```

Push failures are logged and swallowed. Initial sends remain best-effort. Accepted ticket IDs and tokens (no notification bodies) are stored in the `PushReceipt` collection. A background poll claims due receipts with a 15-minute lease, checks Expo delivery receipts, reports provider error codes, and prunes `DeviceNotRegistered` tokens. Missing receipts and failed lookups retry; a 24-hour TTL bounds retention. The lease avoids overlapping processing across polls/replicas. `flushNotifications()` lets tests and graceful shutdown wait for in-flight pushes and receipt checks before disconnecting MongoDB.

## Client architecture

| Piece | File | Role |
| --- | --- | --- |
| Routing | `client/src/app/` | expo-router file-based routes. `_layout.tsx` uses `Stack.Protected` to switch between the signed-out stack (welcome, login, signup) and the signed-in `(app)` stack. |
| App state | `providers/app-provider.tsx` | Session, theme, offline flag, pending join code, and a cache `invalidate()` used after every write. |
| Reads | `hooks/use-resource.ts` | Fetch + per-account cache. Offline reads serve cached data, and a 404/403 drops the cached entry. |
| Writes | `hooks/use-mutation.ts` | Single-flight lock, offline guard, persistent idempotency intents for creates. |
| HTTP | `lib/api.ts` | Adds `Authorization` and `Idempotency-Key`, and expires the session on any 401. |
| Push | `hooks/use-push-notifications.ts`, `lib/push.ts` | Registers the Expo token, removes it on logout, and routes a notification tap to `/group/[id]`. |

## Design decisions

| Decision | Why |
| --- | --- |
| **Money as integer paise** (`amountCents`) with `BigInt` sums | Floating point can't represent 0.1 exactly. Integers plus a `Number.isSafeInteger` check mean balances always sum to exactly zero. Overflow returns `422 BALANCE_OVERFLOW` instead of a silently rounded value. |
| **Server-side splits** | The server computes equal shares, so two clients can never disagree about who owes what. Custom splits must add up to the total exactly. |
| **Balances are derived, never stored** | No running totals to drift out of sync. Editing or deleting an old expense is automatically reflected everywhere. |
| **Soft delete** (`deletedAt`) | Idempotent retries of a deleted record replay the original response instead of re-creating it, and history stays intact. |
| **Audit events embedded in each document** | Action and history commit in one atomic write, without needing replica-set transactions. |
| **Category snapshot on expenses** | Expenses store a copy of the category's name, icon and colour, so renaming or archiving a category never rewrites history. |
| **Best-effort push** | A slow or failing Expo service must never block or fail recording an expense. |

## Known limitations

- Rate limits (global, auth, join, upload) use in-memory counters, so they reset on restart and are per instance. Use a shared store before running more than one instance.
- Logout is device-local. A copied JWT stays valid until it expires (7 days) or `JWT_SECRET` is rotated. There are no refresh tokens or password reset.
- Full-ledger reads (balances, statements) are not a single cross-collection snapshot during concurrent edits.
- Embedded audit histories grow with each change and share MongoDB's 16 MiB document limit.
- No offline write queue. The client disables writes while offline.
