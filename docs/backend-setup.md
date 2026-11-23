# Pennywise backend setup

API contracts and examples: [api.md](api.md).

## Requirements

- Node.js 22.13+ (tested on 22.23.3) and npm.
- Local MongoDB 8.x or MongoDB Atlas. A standalone local instance is supported; no replica set or transaction setup is required.
- Internet access on the first API test run to download a temporary MongoDB test binary.

## Run locally

From the project root:

```bash
cd server
npm ci
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the generated random value into `JWT_SECRET` in `server/.env`. Do not publish the value. Set `MONGODB_URI` for your database, then:

```bash
npm run dev
```

The server binds to `0.0.0.0:3000` by default. Open `http://localhost:3000/health` to check readiness. Configuration/database/index failures prevent startup instead of leaving a partially ready server.

### Local MongoDB

Install/run MongoDB Community using the installation instructions appropriate to your OS. Start the local service, then use:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/pennywise
```

This repository does not start a permanent database service automatically. Its isolated test server is not your development database.

### MongoDB Atlas

Create a cluster and dedicated database user, permit the backend's IP in Atlas network access, and place the connection string in `.env`:

```dotenv
MONGODB_URI=mongodb+srv://<database-user>:<URL-encoded-password>@<cluster-host>/pennywise?retryWrites=true&w=majority
```

Replace placeholders, including the database name. URL-encode special password characters. Do not paste credentials into chat or commit `.env`. Avoid permanently allowing every IP in production.

## Environment variables

- `NODE_ENV`: development, test, or production; default development.
- `PORT`: integer 1–65535; default 3000.
- `MONGODB_URI`: required database connection URI.
- `JWT_SECRET`: required, at least 32 characters; use a cryptographically random value.
- `TRUST_PROXY`: number of reverse-proxy hops in front of the API (0–10); default 0. Set `1` on hosts such as Render so rate limits count real client IPs. A wrong value lets clients spoof their IP, so leave it 0 when clients connect directly.
- `CORS_ORIGINS`: comma-separated exact browser origins, e.g. `http://localhost:8081`. Empty allows requests without an Origin header (such as native mobile clients), but not arbitrary browser origins.

JWT lifetime is fixed to seven days. No refresh token or token revocation service exists. CORS is a browser policy, not an authorization replacement.

## Docker: backend only

`server/Dockerfile` builds TypeScript in a separate stage and runs only the compiled API and production dependencies as the non-root `node` user. Build tools, tests, cached MongoDB test binaries, and `.env` files are excluded from the runtime image. The container has a `/health` readiness check and accepts SIGTERM for graceful shutdown.

`server/compose.yaml` contains **one API service only**. No frontend or MongoDB service/volume is created. MongoDB must already run on your host or in Atlas.

From the project root:

```bash
cp server/.env.docker.example server/.env.docker
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value into `JWT_SECRET` in `server/.env.docker`. For local MongoDB use `mongodb://host.docker.internal:27017/pennywise`, **not `localhost`**, which refers to the container. Atlas users replace that URI with their Atlas connection string. Photo uploads also need `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in that file; they are optional, and without them `/media` returns 503 `MEDIA_UNAVAILABLE`. The database must accept connections from Docker; on Linux a MongoDB bound only to loopback may need a carefully restricted bind/network configuration. Do not expose an unauthenticated database publicly.

```bash
docker compose --env-file server/.env.docker -f server/compose.yaml config --quiet
docker compose --env-file server/.env.docker -f server/compose.yaml up --build -d
curl http://localhost:3000/health
docker compose --env-file server/.env.docker -f server/compose.yaml logs -f api
```

Stop this API service without touching your external database:

```bash
docker compose --env-file server/.env.docker -f server/compose.yaml down
```

`HOST_PORT` changes the published host port; the container always listens on 3000. The API port is published on host interfaces so development phones can reach it; restrict host/network exposure and put HTTPS in front of it for production. Secrets are injected at runtime rather than baked into the image. Compose configuration rendered without `--quiet` can reveal supplied secrets; do not post that output.

Direct build is also supported:

```bash
docker build -t pennywise-api:local server
```

For reproducible container verification, run `npm run test:docker` from `server/` after building the image and starting Docker Desktop. It launches only the API container, temporarily runs an isolated host-side test database, exercises every endpoint, and removes its own container/database afterwards. It does not use your `.env` or development/Atlas database.

Run that smoke test only on a trusted development network: its temporary MongoDB binds a host port so Docker can connect. It is not a production database setup.

## Verification commands

Run inside `server/`:

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run test:unit
```

Jest runs compiled TypeScript tests, avoiding the scaffold's incompatible ts-jest/TypeScript 7 combination. The runner enables Node VM modules because the installed MongoDB driver dynamically imports its OS adapter. Node may print an experimental VM-module warning.

ESLint checks emitted backend JavaScript; TypeScript 7 checks the source/types. This avoids using a TypeScript ESLint parser whose peer dependency excludes TypeScript 7.

API tests launch an isolated **standalone** MongoDB using mongodb-memory-server, create fixtures, and stop it after testing. They never use `MONGODB_URI` or remove development/Atlas data. Test compilation is under `.test-dist/`; build output is `dist/`. Both are ignored. Test MongoDB binaries are cached by the test dependency, so the first run can be slower.

Coverage includes money validation, remainder cents, zero shares, zero-sum balances, generated ledgers, greedy settlement correctness/bounds, bcrypt/JWT auth, membership isolation, code rotation, pagination/search, permission checks, edits/deletions, partial/overpayments, and concurrent/replayed creations surviving later corrections.

The frontend extensions add categories/exclusions, group/profile presets, reliable concurrent join status, audit failure atomicity, concurrent audit before-images, deleted activity, and full-ledger corrected statements.

Design decisions and known limitations are recorded in [architecture.md](architecture.md).

## Structure

```text
server/
  src/
    app.ts                 Express factory, safe to import in tests
    index.ts               startup, database connection, shutdown
    config/                validated environment
    routes/                endpoint registration, one router per resource
      index.ts             mounts the routers (order matters, see architecture.md)
      auth.ts users.ts media.ts dashboard.ts groups.ts
      records.ts categories.ts expenses.ts settlements.ts
    controllers/           HTTP parsing/response handling
    services/              business rules, ledger loading, idempotency
    models/                Mongoose schemas and indexes, one file per collection
      index.ts             re-exports every model + ensureIndexes()
      shared.ts            audit + idempotent-creation fields shared by expenses/settlements
      user.ts group.ts expense.ts settlement.ts category.ts
    validators/            Zod request schemas
    middleware/            JWT, group membership, permissions
    shared/                pure integer-cent calculation functions
    utils/                 serialization, pagination, errors
  tests/
    unit/
    api/
docs/
  architecture.md              HLD, layers, sequence diagrams, design decisions
  api.md                       every endpoint
  data-model.md                ER diagram, indexes, invariants
  balances-and-settlement.md   split, balance and settle-up algorithms
  user-flows.md                screen-by-screen user flows
  testing.md                   test suites and commands
  backend-setup.md             this file
```

User email and group join code have unique indexes. Membership and ledger group queries are indexed. Ledger pagination uses group/creation-time/ID indexes. Each ledger collection also has a unique `(groupId, createdBy, requestKey)` index. Startup awaits index initialization before serving requests; database credentials must permit creation of these indexes.

## Standalone-compatible idempotency

Each expense/settlement atomically stores immutable request-key/hash/original-response metadata in the same document. Duplicate inserts are caught by the unique index and replay the winning record's response. No separate two-document write or distributed transaction is needed.

Expenses and settlements use soft deletion. Expense tombstones are hidden from normal lists; settlement tombstones remain in shared history. Both are excluded from balance calculations. Do not physically purge records or expire request keys without revising the retry guarantees. Original response snapshots increase storage usage.

Independent edits use version-checked atomic updates with bounded retries and accurate audit before-images. The last successful correction wins; repeated conflicts can return 409. Full-ledger reads are not promised to be a single cross-collection snapshot during concurrent writes. There are no persisted running totals. Embedded activity histories are retained indefinitely and share MongoDB's 16 MiB document limit with the action record.

## Production deployment checklist

Backend-only Docker support is available. The Expo `preview` build profile in `client/eas.json` targets a Render-hosted API (`https://pennywise-vfs4.onrender.com`). On Render set `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV=production`, `TRUST_PROXY=1` and the Cloudinary variables; Render supplies `PORT`. Free instances sleep when idle, so the first request after a pause can take longer than the app's 15-second timeout.

1. Configure the host's secret environment variables, including Atlas URI and a strong JWT secret. Use a least-privilege database user and narrow network access.
2. Install/build with `npm ci` and `npm run build`. Run `npm start`; point readiness checks at `/health`.
3. Terminate **HTTPS** at the hosting provider/reverse proxy and prevent public plain-HTTP access. Local HTTP is for development only.
4. Set `NODE_ENV=production` and explicit browser CORS origins. Native mobile traffic without an Origin still requires JWT/membership checks.
5. Review database backups, indexes, monitoring, error logs, and resource limits. MongoDB document limits still apply despite no application member cap. Large full-ledger requests need monitoring.
6. **Rate limiting is built in** (global, signup/login, join, photo upload; see [api.md](api.md#rate-limits)) and enabled by `src/index.ts`. Set `TRUST_PROXY` for your host. Counters live in process memory, so running several backend instances needs a shared store such as Redis.
7. Re-run `npm audit` and resolve/review advisories before deployment. At implementation time the production dependency audit was clean; the scaffold's Jest 30 dependency tree had moderate development-only glob/minimatch advisories. Do not use forced breaking updates blindly.
8. Avoid logging Authorization headers, passwords, and database URIs. Configure the host to restart failed processes and allow graceful SIGTERM shutdown.

Changing `JWT_SECRET` invalidates all existing tokens. There is no refresh, password reset, verification, payments integration, offline write queue, or social login.

## Deploying to Render (checklist)

The preview client build targets a Render web service. To reproduce or repair it:

1. Create a **Web Service** from `server/` (Docker, using `server/Dockerfile`, or Node with build `npm ci && npm run build` and start `npm start`). Set the health check path to `/health`.
2. Set environment variables: `NODE_ENV=production`, `MONGODB_URI` (Atlas, least-privilege user, Render's outbound IPs allowed), `JWT_SECRET` (random, 32+ characters), `TRUST_PROXY=1`, and optionally `CORS_ORIGINS` (exact web origin), the three `CLOUDINARY_*` values and `EXPO_ACCESS_TOKEN`. Do not set `PORT`; Render provides it.
3. Deploy and open `https://<service>.onrender.com/health`; expect `{"data":{"status":"ok"}}`. A 503 means the database is unreachable.
4. Put that HTTPS URL into `EXPO_PUBLIC_API_URL` (`client/eas.json` preview profile, or `client/.env` locally) and rebuild the client.
5. Free instances sleep after idle time, so the first request can be slow and may hit the client's 15-second timeout. Use a paid instance or an uptime pinger for demos.
6. Rate-limit counters are in memory per instance. Run a single instance, or add a shared store before scaling out.
7. Changing `JWT_SECRET` logs everyone out. Rotating Cloudinary or Atlas credentials needs a redeploy.

## Connecting the mobile client

On a physical phone, `localhost` refers to the phone, not this Mac. Use the Mac's reachable LAN IP and server port, e.g. `http://192.168.1.20:3000`, during development; both devices need network access. Android emulators commonly use `http://10.0.2.2:3000`; iOS simulators can generally access the Mac's localhost. Production clients use the deployed HTTPS URL.

The Android-first Expo SDK 58 client is implemented. See [client setup](../client/README.md) and [API contracts](api.md). `npm run dev:preview` inside `server/` starts a disposable standalone database and API on port 3000 for frontend testing; it never reads `.env` or `MONGODB_URI`, and its data is lost on shutdown. Do not deploy that preview script or use real credentials with it.
