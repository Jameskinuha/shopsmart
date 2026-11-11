# ShopSmart Quality and Deployment Record

**Release candidate:** Local only  
**Date:** 2026-11-11  
**Project root:** repository root; follow the setup steps in [`../README.md`](../README.md)

## Feature inventory

| Area | Implemented and observed |
| --- | --- |
| Product catalog and search | Product listing and search API are implemented. Six seeded catalog products were returned by the local API. |
| Cart | Add, quantity update, remove, and subtotal/total helpers are implemented in the React client. Cart is in memory and does not survive a page reload. |
| Checkout | Simulated order creation validates input, recalculates totals from database prices, checks and decrements stock transactionally, and stores an order. No payment is collected. |
| Assistant | Catalog-grounded product answers, linked product records, no-match responses, optional server-side Gemini provider, and deterministic fallback are implemented. The API returned a matching keyboard and its catalog source. |
| Authentication and ownership | **Absent.** There are no sign-in, roles, or customer-owned order access routes. |
| Live AI | Provider integration is implemented and a Gemini key is configured locally. The local question route was exercised; whether its answer came from Gemini or the deterministic fallback is not exposed by the API and was not independently verified. Provider success and outage behavior are covered by backend unit tests using controlled inputs. |

## Baseline and final checks

The baseline was recorded before the health-check change. Both baseline and final `npm run check` completed successfully. The final run passed frontend and backend lint, 4 frontend tests, 15 backend tests, and the Vite production build. Vite printed two non-fatal warnings that React Router's `use client` directives were ignored during bundling.

| Case | Starting state and action | Expected result | Observed result and evidence | Decision |
| --- | --- | --- | --- | --- |
| Baseline project checks | Run `npm run check` before changes. | Lint, tests, and frontend build complete. | Frontend and backend lint passed; 4 frontend and 13 backend tests passed; Vite build passed. | Pass |
| Frontend and health | Start with `npm run dev`; request `http://localhost:5173` and `http://localhost:3000/api/health`. | Frontend serves and health reports service availability. | Frontend HTTP 200; health returned `{"status":"ok"}` while local PostgreSQL was running. | Pass |
| Products and search | Request `/api/products`; catalog had existing local seed data. | Products are returned; a search can filter the catalog. | Six products returned, IDs 1–6. Search UI was not exercised in a graphical browser. | Partial |
| Assistant match | POST `{"question":"Which keyboard is below PHP 2000?"}` to `/api/assistant/questions`. | Answer identifies an in-stock matching catalog product and source. | Answer recommended Compact Mechanical Keyboard at ₱1,850, 8 in stock; source ID 2 and link `/products/2`. Provider versus fallback was not independently distinguished. | Pass |
| Invalid checkout | POST a one-character name, malformed email, short address, and empty items to `/api/orders`. | Invalid order is refused. | HTTP 422. | Pass |
| Stock limit | POST fictional customer details with product ID 1 and quantity 20. | Request above current stock is refused; stock stays unchanged. | HTTP 409; then a valid one-unit order succeeded with stock going from 12 to 11. | Pass |
| Simulated checkout | POST one unit of product ID 1 using `Test User`, `test@example.com`, `123 Fictional Street, Test City`. | One order is created using the database price and stock decreases by one. | Order ID 1, total 650, status `PENDING`; stock decreased 12 → 11. This is a local test order retained in the local database. | Pass |
| Database health failure | Automated test injects a failing database query into `/api/health`. | Health must not advertise availability when PostgreSQL is unreachable. | HTTP 503 with a generic database-unavailable message. Healthy-database test returns HTTP 200. | Pass; regression covered by `backend/test/health.test.js` |
| Final project checks | Run `npm run check` after changes. | All checks pass or failures are listed. | Frontend and backend lint passed; 4 frontend and 15 backend tests passed; Vite build passed. | Pass |

The API requests above were run directly against the local service. No interactive browser session or screenshots were available in this environment, so visual layout, search interaction, cart refresh behavior, and visible loading/error states remain unverified. The order API journey was exercised with fictional data. No seed or migration command was run during verification; the existing local products and orders were not reset.

## Defect fixed

**Reproduction:** start the API with PostgreSQL unavailable, then GET `/api/health`.  
**Before:** the route returned HTTP 200 without checking its database dependency, so a host could route customers to an API that could not read products or create orders.  
**After:** health runs a minimal database query and returns 503 with a generic message if it fails. Tests cover both paths. The route does not disclose database connection details.

## Security and privacy checks

- Only fictional checkout details were used.
- `.gitignore` excludes `.env` and `.env.local`; only `.env.example` templates are tracked. No actual `.env` file is tracked.
- `DATABASE_URL` and `GEMINI_API_KEY` are backend settings. The Vite `VITE_API_URL` is public configuration and must not contain a secret.
- The local production build was checked for the strings `DATABASE_URL` and `GEMINI_API_KEY`; neither was found in emitted frontend assets.
- Authentication and order ownership are absent. Do not expose a public checkout or order data until access control and privacy safeguards are implemented.
- The seed script deletes all orders and products before inserting sample products. Do not run it against any database whose records must be retained.

## Unresolved limitations

- Cart state is in memory and is lost on reload.
- Authentication, roles, and protected customer order access are absent.
- Checkout is simulated and stores customer contact/address data; it is suitable only for controlled evaluation with fictional details.
- Live Gemini availability was not independently verified. The deterministic fallback and provider failure handling have unit coverage.
- Interactive browser evidence and live staging verification were not completed.
- No team member names or individual contributions were provided. Add each member's name, one test run, one contribution, and one issue they can explain before submission.
