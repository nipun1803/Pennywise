# Pennywise backend

Express + TypeScript + MongoDB/Mongoose REST API with bcrypt/JWT authentication.

- [Setup, commands, architecture, and deployment](../docs/backend-setup.md)
- [Every endpoint with request/response examples](../docs/api.md)
- [Backend cross-check and remaining limitations](../docs/backend-audit.md)

Run `npm ci`, configure `.env` from `.env.example`, then `npm run dev`.
Verify with `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test`.

Backend-only Docker: `docker build -t pennywise-api:local server` from the project root. See the setup guide for the single-service Compose configuration and `npm run test:docker`.

Rate limiting is intentionally deferred until frontend completion; add it before public deployment.
