# Inventory Reports API

A small REST API built with Node.js, Express, MongoDB and Docker Compose, in
TypeScript. Users sign in, read their own profile and inventory, and request
an inventory report (`.xlsx`). A separate worker produces the report in the
background and "emails" it through a mock.

## Contents

- [Quick start](#quick-start)
- [Test credentials](#test-credentials)
- [Endpoints](#endpoints)
- [How reports work](#how-reports-work)
- [Configuration](#configuration)
- [Tests](#tests)
- [Design notes](#design-notes)
- [Assumptions](#assumptions)
- [Known limits](#known-limits)
- [Production notes](#production-notes)
- [Project documents](#project-documents)

## Quick start

Requirements: Docker with Docker Compose v2. Nothing else is needed on the
host to run the system.

```sh
cp .env.example .env                    # 1. config (fake values, safe for local use)
docker compose up --build -d            # 2. start mongo, api and worker
docker compose exec api npm run seed    # 3. load users and inventory
```

The API listens on `http://localhost:3000`. MongoDB is **not** reachable from
the host; only the API port is published.

Without `.env` the system does not start. If a required value is missing, the
API and the worker exit and name the missing variable.

Other commands:

```sh
docker compose logs -f worker               # follow report jobs and simulated emails
docker compose up -d --scale worker=3       # run three workers
docker compose down -v                      # stop and delete all data
docker compose -f compose.yaml -f compose.dev.yaml up -d   # also publish Mongo on 27017 (local tools only)
```

The seed can be run again at any time. It resets the seed users and their
items to the documented state, keeps their ids, and does not touch report
requests.

## Test credentials

Loaded by the seed. Passwords are stored only as bcrypt hashes.

| User | Email | Password | Items |
|---|---|---|---|
| Alice Johnson | `alice@example.com` | `Alice#2026` | 10 |
| Bob Smith | `bob@example.com` | `Bob#2026` | 8 |
| Carol White | `carol@example.com` | `Carol#2026` | 0 |

Carol has no items, to show the empty inventory and the "no data" report.
Alice and Bob share one SKU, to show that SKUs are unique per user only.

## Endpoints

| Method | Path | Auth | Success | Errors |
|---|---|---|---|---|
| `POST` | `/auth/login` | — | `200` | `400`, `401` |
| `GET` | `/users/me` | Bearer | `200` | `401` |
| `GET` | `/inventory` | Bearer | `200` | `401` |
| `POST` | `/reports/inventory` | Bearer | `202` | `401` |
| `GET` | `/reports/:jobId` | Bearer | `200` | `401`, `404` |

Any endpoint can also return `500` on an unexpected failure. A body that is
not valid JSON or is larger than 10 kB returns `400` (on protected endpoints,
only after the token is accepted). Any other path or method returns `404`.

### Sign in

```sh
curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Alice#2026"}'
```

```json
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

- The email is matched ignoring case and surrounding spaces.
- Wrong password and unknown email return the same `401`.
- A missing or empty field, a wrong type or an invalid email returns `400`.
- The token expires after one hour by default (`JWT_EXPIRES_IN_SECONDS`).

Save the token for the next calls:

```sh
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"Alice#2026"}' \
  | sed -E 's/.*"token":"([^"]+)".*/\1/')
```

### Read own profile

```sh
curl -s http://localhost:3000/users/me -H "Authorization: Bearer $TOKEN"
```

```json
{
  "id": "665f1c2e9b1e8a0012345678",
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "createdAt": "2026-10-05T12:00:00.000Z"
}
```

### Read own inventory

```sh
curl -s http://localhost:3000/inventory -H "Authorization: Bearer $TOKEN"
```

```json
[
  {
    "id": "665f1c2e9b1e8a0012345679",
    "name": "Desk Lamp",
    "sku": "DL-6006",
    "category": "Furniture",
    "location": "Warehouse C",
    "quantity": 60,
    "unitPrice": 24.75
  }
]
```

- Only the caller's items are returned; a user without items gets `[]`.
- Query parameters, body fields, path segments or headers that name another
  user or item change nothing.
- `unitPrice` is in US dollars. The order of items is not defined.

### Request an inventory report

```sh
curl -s -X POST http://localhost:3000/reports/inventory \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "success": true,
  "message": "Report generation started",
  "jobId": "665f1d009b1e8a0012345680",
  "status": "pending"
}
```

The response comes back immediately (`202`); the report is produced by the
worker afterwards. Each call creates a new, independent request.

### Check a report request

```sh
curl -s http://localhost:3000/reports/<jobId> -H "Authorization: Bearer $TOKEN"
```

```json
{
  "jobId": "665f1d009b1e8a0012345680",
  "status": "done",
  "createdAt": "2026-10-05T12:00:00.000Z",
  "updatedAt": "2026-10-05T12:00:03.120Z"
}
```

- `status` is one of `pending`, `processing`, `done`, `failed`.
- `updatedAt` is when the status last changed.
- `reason` appears only when there is one: a `done` report with no data, or a
  `failed` one.
- Another user's job, an unknown id and a malformed id all return the same
  `404`.

### Errors

Every error has the same shape:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body fails validation (message names the field) |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 400 | `PAYLOAD_TOO_LARGE` | Body is larger than 10 kB |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `UNAUTHORIZED` | Missing, malformed, invalid or expired token, or deleted user |
| 404 | `NOT_FOUND` | Unknown route, or a job the caller cannot see |
| 500 | `INTERNAL_ERROR` | Unexpected failure (details only in the server log) |

Responses never contain stack traces, database details, file paths or
password hashes.

## How reports work

```
POST /reports/inventory ──▶ api inserts a job (pending) ──▶ 202 { jobId }
                                       │
                               reportJobs collection
                                       │
worker: claim job ─▶ stream items to .xlsx ─▶ send email (mock) ─▶ delete file ─▶ done
```

- **Separate process.** The API only inserts a job. The worker (same image,
  different command) does all the work, so the API never slows down while
  reports are produced. The API and the worker never call each other; they
  share only the `reportJobs` collection in MongoDB.
- **States.** `pending → processing → done | failed`. A job can go back from
  `processing` to `pending` for a retry. `done` and `failed` never change.
- **Atomic claim.** A worker takes a job with a single `findOneAndUpdate`
  that moves it to `processing`, sets a lease (`lockedUntil`), a new random
  lock token and increments `attempts`. Two workers can never take the same
  job.
- **Lease and heartbeat.** While working, the worker renews its lease every
  40 s (lease: 2 min by default). If the worker crashes, the lease expires and
  another worker (or the restarted one) takes the job again.
- **Lock token.** Every write that renews or finishes a job filters by the
  job id, `status: "processing"` and the worker's lock token, so a worker that
  lost its job cannot overwrite the new owner's result. It also checks the
  lease before sending the email.
- **Retries.** A temporary failure (for example the email fails) sends the
  job back to `pending`, up to `REPORT_MAX_ATTEMPTS` (3). After that it ends
  `failed` with a readable reason. A job whose last attempt crashed is also
  marked `failed`.
- **No retry for permanent failures.** If the user no longer exists, the job
  ends `failed` right away.
- **No data.** A user without items gets a `done` job with the reason
  `No inventory data to report.` and no email.
- **Email mock.** `ConsoleEmailSender` logs one `email sent` line with the
  `jobId`, recipient, subject, attachment name
  (`inventory-report-<YYYYMMDD-HHmmss>Z.xlsx`) and size. A real provider would
  be another implementation of the same `EmailSender` interface.
- **Spreadsheet.** Columns: `Name`, `SKU`, `Category`, `Location`,
  `Quantity`, `Unit Price`, `Total Value` (= quantity × unit price, in US
  dollars). Items are streamed from a MongoDB cursor, so memory does not grow
  with the inventory size.
- **Cleanup.** The file is written to `/tmp/reports` inside the worker
  container and deleted after every attempt, successful or not. On startup,
  the worker wipes that folder to remove files left by a crash.

Watch it happen:

```sh
docker compose logs -f worker
```

Try a crash: stop the worker, request a report (it stays `pending`), start the
worker again, and the job reaches `done`:

```sh
docker compose stop worker
# POST /reports/inventory → still pending
docker compose start worker
```

## Configuration

All configuration comes from environment variables (`.env`, see
`.env.example`). The app refuses to start if a required value is missing or
invalid, and names it.

| Variable | Required | Default | Used by |
|---|---|---|---|
| `MONGO_URI` | yes | — | api, worker, seed |
| `JWT_SECRET` | yes | — | api (also required by worker and seed, shared config) |
| `PORT` | no | `3000` | api |
| `JWT_EXPIRES_IN_SECONDS` | no | `3600` | api |
| `BCRYPT_COST` | no | `12` | api, seed |
| `REPORT_MAX_ATTEMPTS` | no | `3` | worker |
| `REPORT_LEASE_SECONDS` | no | `120` | worker |
| `WORKER_POLL_INTERVAL_MS` | no | `2000` | worker |
| `REPORTS_DIR` | no | `/tmp/reports` | worker |

Inside Compose, `MONGO_URI` uses the service name:
`mongodb://mongo:27017/inventory`.

## Tests

Tests run on the host with Node.js 24. They start an in-memory MongoDB
(`mongodb-memory-server`, downloaded on the first run) and need no `.env`.

```sh
npm ci
npm run test        # Vitest + supertest
npm run typecheck
npm run lint
```

Covered: sign-in success and failure, token rejection on every protected
route, inventory isolation with manipulated input, `202` on report request,
`404` on another user's job, atomic claim under concurrency, retries, failure
after max attempts, the spreadsheet content, file cleanup, the seed, error
shapes and config validation.

## Design notes

**Authentication and passwords.** Passwords are stored only as bcrypt hashes
(cost 12, async API). Login always runs `bcrypt.compare`, against a dummy hash
when the email is unknown, so timing does not reveal which emails exist. The
JWT is signed with HS256, the algorithm is pinned on verify, and the payload
holds only `sub`, `iat` and `exp`. Every request also checks that the user
still exists. Details: [plan](docs/plan.md) §7.1–§7.3, [decisions](docs/decisions.md) D-008, D-014.

**Authorization.** The user id comes only from the verified token
(`req.auth`). It is placed inside every database query (`{ userId }`), never
applied after loading data. No query, body, path or header value reaches the
filter, so one user cannot read another user's data (no IDOR). Details:
[plan](docs/plan.md) §7.4, [decisions](docs/decisions.md) D-007.

**Data model.** Three collections:

| Collection | Key fields | Indexes |
|---|---|---|
| `users` | `name`, `email` (lowercase), `passwordHash` (hidden by default) | `{ email: 1 }` unique |
| `inventory` | `userId`, `name`, `sku`, `category`, `location`, `quantity`, `unitPriceCents` | `{ userId: 1, sku: 1 }` unique |
| `reportJobs` | `userId`, `status`, `attempts`, `lockedUntil`, `lockToken`, `reason`, `statusChangedAt` | `{ status: 1, createdAt: 1 }`, `{ status: 1, lockedUntil: 1 }` |

Items live in their own collection (not inside the user), so an inventory can
grow without limit and be streamed. Prices are stored in integer cents and
converted to dollars only in responses and in the report. Details:
[plan](docs/plan.md) §5, [decisions](docs/decisions.md) D-016, D-017, D-022.

**Structure.** routes → controllers → services → models, with a central error
handler and typed errors. `app.ts` builds the Express app without listening,
so tests use it directly. Responses are built by explicit mappers (DTOs);
documents are never sent as they are. Details: [plan](docs/plan.md) §2.2, §3,
[decisions](docs/decisions.md) D-013.

**Race conditions and failures.** See [How reports work](#how-reports-work):
atomic claim, lease with heartbeat, lock token on every write, limited
retries, permanent failures, crash recovery and file cleanup. Details:
[plan](docs/plan.md) §8, [decisions](docs/decisions.md) D-001–D-004, D-011, D-023.

**Scaling.** Workers scale horizontally (`--scale worker=N`); the atomic claim
shares jobs safely. The API keeps no state in memory and could run behind a
load balancer (not set up in Compose). For millions of items, the owner
index serves every query, the report streams rows with constant memory, and
the next step would be cursor pagination on `/inventory`. Details:
[decisions](docs/decisions.md) D-004, D-009, D-017, D-021; see also
[Production notes](#production-notes).

**Secure deployment.** Secrets only from the environment, never committed.
MongoDB has no published port. Containers run as a non-root user. The image
holds only compiled code and production dependencies. Details:
[plan](docs/plan.md) §10, [decisions](docs/decisions.md) D-006.

## Assumptions

- Prices are in US dollars, with two decimal places.
- Users exist only through the seed; there is no sign-up, password change or
  logout.
- Email is simulated: the "sent" email is the `email sent` line in the worker
  log.
- The report is not downloadable through the API; it only travels as an email
  attachment.

## Known limits

- **Duplicate email after a crash.** If the worker crashes after sending the
  email but before marking the job `done`, the job runs again and the email is
  sent twice. A report is never lost silently in exchange.
- **A frozen worker** (alive but stuck longer than the lease) can lose its job
  to another worker, which can also lead to a duplicate email.
- **Retries happen right away, with no delay.** A failure that lasts a few
  seconds (for example the email provider is briefly down) can use all
  attempts at once, and the job ends `failed`.
- **Report requests are kept forever**; there is no retention period.
- **Inventory is not paginated** and its order is not defined.
- **One API instance** in Compose; several instances behind a load balancer
  are described, not delivered.
- **Leftover report files have no deadline.** A file left by a crash, or by a
  failed deletion, is removed the next time the worker starts. It is never
  served by the API.
- **Report files are per worker container**, not shared.
- **No rate limiting** on login.
- **Indexes are built at startup** (`Model.init()`), not by migrations.

## Production notes

| Topic | Direction |
|---|---|
| Queue | SQS with visibility timeout, retries and a DLQ instead of polling MongoDB |
| Duplicate emails | Idempotent provider call keyed by `jobId` |
| Retries | Exponential backoff (`availableAt`) |
| Report files | S3 with a lifecycle rule; email a pre-signed link instead of an attachment |
| Email | SES/SMTP implementation of `EmailSender` |
| API | Several instances behind a load balancer (ALB), autoscaling |
| Jobs | TTL index or archival |
| Inventory | Cursor pagination by `_id` on the owner index |
| Login | Rate limiting per IP and per email |
| Indexes | Explicit migrations, `autoIndex: false` |
| Logs | Structured logger (for example pino) and monitoring |

## Project documents

| Document | Content |
|---|---|
| [`docs/context.md`](docs/context.md) | The challenge, scope and constraints |
| [`docs/spec.md`](docs/spec.md) | Required behavior and acceptance criteria |
| [`docs/decisions.md`](docs/decisions.md) | Architecture decisions (ADRs) with trade-offs |
| [`docs/plan.md`](docs/plan.md) | How it is built: architecture, data model, API, jobs, Docker |
| [`docs/tasks.md`](docs/tasks.md) | Implementation tasks and execution order |
