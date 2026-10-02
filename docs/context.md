# Challenge context

> Input document for writing `docs/spec.md`. It describes the **problem**, the
> **scope** and the **constraints**. Technical decisions live in
> `docs/decisions.md`. This file does not define the implementation.

## 1. Goal

Build a small backend service with Node.js, Express, MongoDB and Docker
Compose. Users log in, read their own profile and inventory, and request an
inventory report that is generated in the background and "sent" by email.

AI tools are allowed. Every part of the code must be explainable, changeable
and defensible during a technical review.

## 2. What matters most

1. **Correct authorization:** a user can never access another user's
   inventory (no IDOR).
2. **Real asynchronous work:** report generation does not hold the HTTP
   request and does not block the API event loop. There is a clear plan for
   crashes, retries and multiple instances.
3. **Engineering reasoning:** structure, separation of concerns, data model,
   basic security, and clear reasons and known limits for each choice.

## 3. Required stack

Node.js, Express.js, MongoDB, Docker and Docker Compose. The language is
TypeScript (see D-005). The app must start with `docker compose up`, with
MongoDB and the application as separate services.

## 4. Functional requirements

| ID | Requirement | Notes from the challenge |
|---|---|---|
| FR01 | `POST /auth/login` | Accepts email and password, checks them against a user in MongoDB, returns `{ "token": "..." }`. Proper error for invalid credentials. |
| FR02 | Auth middleware | Validates `Authorization: Bearer <token>`, rejects unauthenticated requests, and makes the user (or user id) available to the next handlers. |
| FR03 | `GET /users/me` (protected) | Returns the current user from the `users` collection, without sensitive fields. |
| FR04 | Inventory seed script | Fills `inventory` with at least 5 meaningful fields per item (besides ids), with items for more than one user. How to run it must be documented. |
| FR05 | `GET /inventory` (protected) | Returns **only** the current user's items. It cannot be bypassed with query, body, ids or headers. |
| FR06 | `POST /reports/inventory` (protected) | Returns a success response right away (`202` with `jobId`, see D-010). Then, asynchronously: reads the user's inventory, creates an `.xlsx` file, saves it in a temporary folder, and simulates sending it by email. |
| FR07 | `GET /reports/:jobId` (protected) | Returns the status of a report job owned by the current user. Not in the original challenge; added for visibility (D-010). |
| FR08 | Background processing | Outside the HTTP request flow. External queues (Redis, RabbitMQ, Kafka) are not required. |
| FR09 | Initial data | At least 2 users, each with their own inventory. Test credentials go in the README. |
| FR10 | README | How to start, how to seed, credentials, endpoints, request examples, how reports work, decisions and assumptions. |

Response body suggested by the challenge for FR06:
`{ "success": true, "message": "Report generation started" }`.

Email mock suggested by the challenge: `sendEmail({ to, subject, attachment })`,
logging to the console.

## 5. Non-functional requirements

- **Basic security:** hashed passwords (bcrypt, D-014), validated tokens,
  protected endpoints require authentication, inventory isolation between
  users, no secrets in the code, no sensitive fields in responses.
- **Errors:** proper HTTP status codes (400, 401, 404, 500) with JSON bodies.
  Unexpected errors never expose stack traces or internal details.
- **Configuration:** environment variables (for example `MONGO_URI`,
  `JWT_SECRET`, `PORT`). No real secrets committed.
- **Network:** the app reaches MongoDB through the Docker Compose network, not
  a locally installed MongoDB.
- **Quality:** structure, naming, separation of concerns, data model,
  readability, maintainability and correct use of async code.
- **Tests:** encouraged, not required. Priorities: successful login, failed
  login, protected endpoint access, inventory isolation, and the report
  request returning immediately.

## 6. Domain entities (conceptual; the final model is in the spec)

- **User:** identity and credentials (email, password hash, name).
- **InventoryItem:** an item assigned to a user (for example name, SKU,
  category, price, quantity, owner). The challenge uses `assignedUserId` as an
  example owner field.
- **ReportJob:** a report request with a state and attempt count. Not required
  by the challenge; it comes from decision D-001.

## 7. Main flows

1. **Login:** the client sends credentials → the API finds the user by email →
   compares the password with the bcrypt hash → issues a token, or returns a
   generic `401`.
2. **Authenticated read:** the client sends the token → the middleware
   validates it and attaches the identity → the handler queries MongoDB with
   the user id from the token → the response has no sensitive fields.
3. **Report:** the client requests a report → the API saves a pending job and
   responds right away → a worker claims the job → reads the inventory of the
   job owner → writes the `.xlsx` to `/tmp/reports` → calls the email mock →
   marks the job as done, or retries / marks it as failed.
4. **Job status:** the client asks for a job by id → the API returns it only if
   it belongs to the current user, otherwise `404`.

## 8. Target architecture (summary; details in decisions.md)

- Three containers on one Compose network: `api`, `worker` and `mongo`.
- The API and the worker use the same image and communicate only through
  MongoDB.
- A real email provider would be an external service outside the Docker
  network, used only by the worker. In this challenge it is a mock.

## 9. Out of scope

- Real email delivery (only a mock behind an interface).
- A load balancer and multiple API replicas in Compose (documented only).
- Refresh tokens, logout and token revocation.
- User sign-up: users exist only through the seed (D-015).
- External queues (Redis, SQS, etc.).

## 10. Review topics the solution and README must cover

- How authentication and password storage work.
- How authorization prevents access to another user's inventory.
- How MongoDB documents are modeled and which indexes exist.
- Why the application is structured this way.
- How the report is generated outside the HTTP request.
- Race conditions and failure scenarios (including a crash during generation).
- Cleanup of temporary files.
- Retries if email delivery fails.
- Background jobs in production with multiple instances.
- Scaling to millions of inventory records.
- Secure deployment.

## 11. High-level acceptance criteria

- `docker compose up` starts the API, the worker and MongoDB from a clean
  clone.
- After seeding, login works with the README credentials.
- User A sees only A's items and User B sees only B's items, even with
  manipulated parameters.
- `POST /reports/inventory` returns `202` in milliseconds. The `.xlsx` file
  appears in the worker's `/tmp/reports`, and the simulated email is logged.
- `GET /reports/:jobId` shows the job moving to `done`. Another user's job
  returns `404`.
- No API response contains a password hash or a stack trace.
