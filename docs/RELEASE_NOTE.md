# ShopSmart Release Note

**Version:** 1.0.0 local release candidate  
**Date:** 2026-11-11  
**Deployment status:** Local only; no staging deployment was performed.

## Working features

- React/Vite product catalog and client-side cart helpers.
- Express product, simulated order, assistant, and database-aware health endpoints.
- Prisma/PostgreSQL persistence, stock validation/decrement, and committed schema migration.
- Catalog-grounded assistant with a deterministic response and optional server-side Gemini draft with validation/fallback.
- Final `npm run check`: lint passed, 4 frontend tests passed, 15 backend tests passed, and Vite build passed.
- Local API smoke checks returned six products, a supported keyboard recommendation with source ID 2, HTTP 422 for invalid order data, HTTP 409 for over-stock order data, and a fictional one-unit simulated order.

## Known limitations

- No authentication or protected customer/order access.
- Cart is in memory and is not restored after page reload.
- Checkout is simulated; do not collect real payment or use real customer details.
- Gemini provider success was not independently confirmed in this run; fallback behavior is covered by unit tests.
- No interactive browser screenshot or live staging smoke test was captured.

## Local startup

Use the installation and PostgreSQL setup in [`README.md`](../README.md). From the project root, configure `backend/.env` using `backend/.env.example`, create the local database, then run `npm install`, `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed` for a fresh disposable development database. **The seed command deletes existing orders and products. Do not run it where data must be preserved.** Start with `npm run dev`, open `http://localhost:5173`, and check `http://localhost:3000/api/health`. The `npm run db:migrate:deploy` command is for deployment of committed migrations, not local schema development.

## Team record

Team member names and individual contributions were not included in the supplied project context. Before submission, add each member's name, one test they ran, one contribution, and one issue they can explain. The verification record is in [`QUALITY_DEPLOYMENT_RECORD.md`](QUALITY_DEPLOYMENT_RECORD.md); the deployment plan is in [`DEPLOYMENT_PLAN.md`](DEPLOYMENT_PLAN.md).
