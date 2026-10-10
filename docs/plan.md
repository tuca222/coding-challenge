# Implementation plan

> Source of truth for **how** the system is built. Every section implements
> requirements of `docs/spec.md` (cited as `spec §x`) and follows the decisions
> of `docs/decisions.md` (cited as `D-0xx`). A bare `§x` refers to this plan.
> This document explains what is
> built and how it works; the reasons behind each choice are in the ADRs.
> It adds no requirement of its own.

## 1. Purpose and traceability

| `docs/spec.md` | This plan |
|---|---|
| §3.1 Sign in | §6.3, §7.1, §7.2 |
| §3.2 Authenticated requests | §6.2, §7.3 |
| §3.3 Read own profile | §6.4, §5.5 |
| §3.4 Initial data | §9, §5.2, §5.3 |
| §3.5 Read own inventory | §6.5, §5.5, §7.4 |
| §3.6 Request a report | §6.6, §8 |
| §3.7 Check a report request | §6.7, §8.1 |
| §3.8 Background production | §8 |
| §4.1 Security | §5, §6.2, §7, §10.3 |
| §4.2 Errors | §6.2 |
| §4.3 Configuration | §4 |
| §4.4 Performance | §6.6, §8.3 |
| §4.5 Data lifetime | §8.7, §5.4 |
| §5 Constraints | §2, §6, §10 |
| §7 Acceptance criteria | §12 |
| §8 Known limits | §14 |

## 2. Architecture

### 2.1 Containers (D-002, D-006)

```
                 host :3000
                     │
┌────────────────────┼──────── Compose network ────────────────────┐
│                    ▼                                             │
│   ┌──────────┐            ┌───────────┐           ┌───────────┐  │
│   │   api    │──────────▶│   mongo    │◀─────────│  worker   │  │
│   │ Express  │  users     │ (no port) │ reportJobs│ (no port) │  │
│   └──────────┘  inventory └───────────┘ inventory └─────┬─────┘  │
│                 reportJobs                users         │        │
└─────────────────────────────────────────────────────────┼────────┘
                                                          ▼
                                          EmailSender (mock: stdout)
```

- `api` and `worker` run the **same image** with different commands.
- They never call each other. The only shared state is MongoDB.
- MongoDB listens on port `27017` **inside** the Compose network, where
  `api` and `worker` reach it by service name
  (`mongodb://mongo:27017/inventory`). That port is **not published** to the
  host, so nothing outside the network can connect to the database. Only
  `api` publishes a port (`3000`) to the host.

### 2.2 Layers in the API (D-013)

```
route → [authenticate] → jsonBody → controller → service → model (Mongoose)
                              │
                              └─ errors thrown as AppError subclasses
                                 → errorHandler middleware → JSON response
```

- **Routes** declare paths, methods and middleware. No logic.
- **Controllers** validate input with zod, read `req.auth`, call one service
  function and send the response. They never import models.
- **Services** hold the business logic. They take plain arguments (for
  example `userId: string`) and never see `req`/`res`. They return DTOs.
- **Models** define schemas and indexes.

### 2.3 Request flows

- **Login:** `POST /auth/login` → validate body → `authService.login` →
  find user by normalized email → `bcrypt.compare` (real or dummy hash) →
  sign JWT → `200 { token }`.
- **Authenticated read:** `authenticate` verifies the token and the user's
  existence → `req.auth = { userId }` → service query with
  `{ userId }` in the filter → DTO → `200`.
- **Report request:** `POST /reports/inventory` → `reportService.createJob`
  inserts one `pending` job → `202`. Nothing else happens in the API.
- **Report production:** the worker claims the job (§8.2), streams the
  owner's items into an `.xlsx` file, sends the email through `EmailSender`,
  deletes the file and finishes the job.

## 3. Project structure

```
src/
  app.ts                      # createApp(): builds the Express app, no listen
  server.ts                   # API entrypoint: env, connect, warm dummy hash, listen, shutdown
  config/
    env.ts                    # loadEnv() + env (only place that reads process.env)
  db/
    connect.ts                # connectDb(uri) with retry, ensureIndexes(), disconnectDb()
  models/
    User.ts
    InventoryItem.ts
    ReportJob.ts
  dto/
    userDto.ts                # toUserDto()
    inventoryItemDto.ts       # toInventoryItemDto()
    reportJobDto.ts           # toReportJobDto()
  routes/
    index.ts                  # mounts all routers
    authRoutes.ts
    userRoutes.ts
    inventoryRoutes.ts
    reportRoutes.ts
  controllers/
    authController.ts
    userController.ts
    inventoryController.ts
    reportController.ts
  services/
    authService.ts            # login(), signToken(), verifyToken(), dummy hash
    userService.ts            # getProfile(), userExists()
    inventoryService.ts       # listItems()
    reportService.ts          # createJob(), getJob()
    email/
      EmailSender.ts          # interface + message type
      ConsoleEmailSender.ts   # mock: logs the email
  middleware/
    authenticate.ts
    jsonBody.ts               # express.json({ limit: "10kb" }), used per route
    errorHandler.ts
    notFound.ts
  errors/
    AppError.ts               # AppError + ValidationError, InvalidCredentialsError,
                              #   UnauthorizedError, NotFoundError
  workers/
    reportWorker.ts           # worker entrypoint: env, connect, wipe dir, loop, shutdown
    jobQueue.ts               # claim, renew lease, finish, fail exhausted jobs
    runJob.ts                 # one attempt: heartbeat + processReportJob + outcome
    processReportJob.ts       # load user, write file, send email
    spreadsheet.ts            # writeInventoryReport() with exceljs
    tempFiles.ts              # wipeReportsDir(), removeFileQuietly()
    errors.ts                 # PermanentJobError, LeaseLostError
  seed/
    seedData.ts               # documented users and items
    runSeed.ts                # runSeed(): idempotent load
  utils/
    money.ts                  # centsToDollars()
    logger.ts                 # logger.info/warn/error → one JSON line
  types/
    express.d.ts              # adds req.auth to Express.Request
scripts/
  seed.ts                     # entrypoint: env, connect, runSeed(), disconnect
tests/
  setup/                      # globalSetup (mongodb-memory-server), per-file setup
  *.test.ts
docs/
Dockerfile
compose.yaml
compose.dev.yaml              # optional: publishes Mongo port for local GUI/dev
.env.example
.dockerignore
.gitignore
eslint.config.js
tsconfig.json
tsconfig.build.json
vitest.config.ts
package.json
README.md
```

ESM (D-020): `"type": "module"`, and relative imports end in `.js`
(`import { env } from "./config/env.js"`).

## 4. Configuration (spec §4.3, D-018)

`src/config/env.ts` is the **only** module that reads `process.env`. It
exports `loadEnv(source)` and `env`.

- `loadEnv(source)` validates `source` with a small zod schema: required
  values must be present, numbers must be numbers, and the rest get their
  defaults. If anything is missing or invalid, it **throws** an error whose
  message names the variables (for example
  `Missing or invalid config: MONGO_URI, JWT_SECRET`). It never exits, so
  tests can call it.
- `env` is built at module load by `loadEnv(process.env)`. If it throws, the
  module prints the message and exits with code `1` (spec §4.3.2).

| Variable | Required | Default | Used by |
|---|---|---|---|
| `MONGO_URI` | yes | — | api, worker, seed |
| `JWT_SECRET` | yes | — | api |
| `PORT` | no | `3000` | api |
| `JWT_EXPIRES_IN_SECONDS` | no | `3600` | api |
| `BCRYPT_COST` | no | `12` | api, seed |
| `REPORT_MAX_ATTEMPTS` | no | `3` | worker |
| `REPORT_LEASE_SECONDS` | no | `120` | worker |
| `WORKER_POLL_INTERVAL_MS` | no | `2000` | worker |
| `REPORTS_DIR` | no | `/tmp/reports` | worker |

The worker, the API and the seed share one schema, so `JWT_SECRET` is also
required by the worker and the seed. This keeps one config module; the value
is simply unused there.

`.env.example` holds fake values only. `.env` is in `.gitignore` and
`.dockerignore` (D-006).

## 5. Data model (D-016, D-017, D-022)

Database name: `inventory` (from `MONGO_URI`). Mongoose `timestamps: true`
on every schema adds `createdAt` and `updatedAt`.

### 5.1 `users`

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `name` | string | required, trimmed |
| `email` | string | required, trimmed, **lowercase** |
| `passwordHash` | string | required, **`select: false`** |
| `createdAt`, `updatedAt` | Date | timestamps |

Indexes: `{ email: 1 }` **unique**.

Emails are stored lowercased and trimmed, and login normalizes the input the
same way, so the unique index enforces case-insensitive uniqueness
(spec §3.1).

### 5.2 `inventory`

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId | required, owner (ref `users`) |
| `name` | string | required, trimmed, min length 1 |
| `sku` | string | required, trimmed, min length 1 |
| `category` | string | required, trimmed, min length 1 |
| `location` | string | required, trimmed, min length 1 |
| `quantity` | number | required, integer, ≥ 0 |
| `unitPriceCents` | number | required, integer, ≥ 0 — US cents (D-022) |
| `createdAt`, `updatedAt` | Date | timestamps |

Indexes: `{ userId: 1, sku: 1 }` **unique**. It enforces "SKU unique per
user" (spec §3.4.2) and also serves every owner query (`{ userId }` is its
prefix).

### 5.3 `reportJobs`

| Field | Type | Rules |
|---|---|---|
| `_id` | ObjectId | the public `jobId` |
| `userId` | ObjectId | required, owner, copied from `req.auth` at creation |
| `status` | string | `pending` \| `processing` \| `done` \| `failed` |
| `attempts` | number | starts at 0; incremented by each claim |
| `lockedUntil` | Date \| null | lease end while `processing` |
| `lockToken` | string \| null | random UUID set by each claim (D-003) |
| `reason` | string \| null | public, readable reason (spec §3.7.3) |
| `statusChangedAt` | Date | set explicitly on every status write |
| `createdAt`, `updatedAt` | Date | timestamps |

Indexes:
- `{ status: 1, createdAt: 1 }` — claim of the oldest `pending` job.
- `{ status: 1, lockedUntil: 1 }` — expired leases.
- Lookup by id uses the default `_id` index (the owner is an extra filter on
  the same document).

`statusChangedAt` exists because `updatedAt` also changes on every heartbeat;
the API must report when the **state** last changed (spec §3.7).

Internal error details are **not** stored in the job; they go to the worker
log with the `jobId` (spec §3.8.8, spec §3.7.3).

### 5.4 Index creation

`db/connect.ts` exports `ensureIndexes()`, which awaits `Model.init()` for the
three models. The API, the worker and the seed call it after connecting, so
indexes exist before the first request or job.

Report jobs are never deleted (spec §4.5.2, spec §8.2).

### 5.5 DTOs

Every response is built by an explicit mapper. No Mongoose document is ever
sent directly.

| Mapper | Output | Notes |
|---|---|---|
| `toUserDto` | `{ id, name, email, createdAt }` | `id` is the hex string of `_id`; `createdAt` is ISO 8601 |
| `toInventoryItemDto` | `{ id, name, sku, category, location, quantity, unitPrice }` | `unitPrice = centsToDollars(unitPriceCents)` |
| `toReportJobDto` | `{ jobId, status, createdAt, updatedAt, reason? }` | `updatedAt` comes from `statusChangedAt`; `reason` only when not null; never `attempts`, `lockToken`, `lockedUntil`, `userId` |

`centsToDollars(cents)` returns `cents / 100` as a number (`1999` → `19.99`).
All calculations stay in integer cents; this conversion happens once, at the
edge (D-022).

## 6. HTTP API

### 6.1 App pipeline (`createApp()`)

1. `app.disable("x-powered-by")`
2. Routers (`routes/index.ts`)
3. `notFound` — any unmatched path or method
4. `errorHandler` — last

Middleware is declared **per route**, in this order (spec §3.2.3):

| Route | Chain |
|---|---|
| `POST /auth/login` | `jsonBody` → handler |
| Protected routes | `authenticate` → `jsonBody` → handler |

`jsonBody` is `express.json({ limit: "10kb" })`. Because `authenticate` runs
first, an unauthenticated request gets `401` even with a broken body; an
authenticated one with a broken body gets `400`. An unknown path never runs
`authenticate`, so it always gets `404`.

### 6.2 Errors (spec §4.2, §5.3)

Every error response has this shape and nothing else:

```json
{ "error": { "code": "NOT_FOUND", "message": "Resource not found" } }
```

`AppError` carries `status`, `code` and `message`. Services and middleware
throw subclasses; only `errorHandler` turns them into responses.

| Situation | Status | `code` | `message` |
|---|---|---|---|
| Body fails validation | 400 | `VALIDATION_ERROR` | first zod issue, e.g. `email: Invalid email address` |
| Body is not valid JSON (`entity.parse.failed`) | 400 | `INVALID_JSON` | `Request body is not valid JSON` |
| Body too large (`entity.too.large`) | 400 | `PAYLOAD_TOO_LARGE` | `Request body is too large` |
| Any other body-parser client error | 400 | `BAD_REQUEST` | `Bad request` |
| Wrong email or password | 401 | `INVALID_CREDENTIALS` | `Invalid email or password` |
| Any authentication failure | 401 | `UNAUTHORIZED` | `Authentication required` |
| Unknown route/method; job not visible | 404 | `NOT_FOUND` | `Resource not found` |
| Anything else | 500 | `INTERNAL_ERROR` | `Internal server error` |

`errorHandler`:
- maps `AppError` and body-parser errors as above;
- for anything else, logs the error (message and stack) on the server and
  returns the generic `500`. The request body is never logged (it may hold a
  password, spec §4.1.1);
- if headers were already sent, delegates to Express's default handler.

### 6.3 `POST /auth/login` (spec §3.1)

Request body (zod, unknown fields ignored):

| Field | Rule |
|---|---|
| `email` | string → trim → lowercase → valid email |
| `password` | string, min length 1 (empty → `400`, spec §3.1), used exactly as sent |

Responses:
- `200` `{ "token": "<jwt>" }`
- `400` `VALIDATION_ERROR` (missing field, empty password, wrong type,
  invalid email, missing body or a `Content-Type` other than JSON)
- `400` `INVALID_JSON` / `PAYLOAD_TOO_LARGE` (§6.2)
- `401` `INVALID_CREDENTIALS` — identical body for unknown email and wrong
  password

### 6.4 `GET /users/me` (spec §3.3) — protected

- `200` `{ "id", "name", "email", "createdAt" }` for `req.auth.userId`.
- Query, body and headers are ignored.

### 6.5 `GET /inventory` (spec §3.5) — protected

- `200` with a **JSON array** of `toInventoryItemDto` objects; `[]` when the
  caller owns no items.
- Query: `InventoryItem.find({ userId: req.auth.userId }).lean()`. The
  controller reads nothing from query, body, params or headers; no input can
  reach the filter (D-007).
- Order is not defined (spec §3.5.4); no sort is applied.

### 6.6 `POST /reports/inventory` (spec §3.6, §4.4.1) — protected

- Inserts `{ userId: req.auth.userId, status: "pending", attempts: 0,
  statusChangedAt: now }`. One insert, no inventory read, so response time
  does not depend on inventory size.
- `202`:

  ```json
  {
    "success": true,
    "message": "Report generation started",
    "jobId": "665f1c...",
    "status": "pending"
  }
  ```

- The request body is ignored. Each call creates a new job (spec §3.6.5).

### 6.7 `GET /reports/:jobId` (spec §3.7) — protected

- `jobId` must match `^[a-f0-9]{24}$` (case-insensitive). If not → the same
  `404` as below, without querying.
- Query: `ReportJob.findOne({ _id: jobId, userId: req.auth.userId }).lean()`.
  Not found → `404 NOT_FOUND`.
- `200`:

  ```json
  {
    "jobId": "665f1c...",
    "status": "done",
    "createdAt": "2026-10-05T12:00:00.000Z",
    "updatedAt": "2026-10-05T12:00:03.120Z",
    "reason": "No inventory data to report."
  }
  ```

  `reason` appears only when the job has one (spec §3.7.3).

## 7. Authentication and ownership (D-007, D-008, D-014)

### 7.1 Login

1. Controller validates and normalizes the body (§6.3).
2. `authService.login(email, password)`:
   - `User.findOne({ email }).select("+passwordHash").lean()`
   - `hash = user ? user.passwordHash : await getDummyHash()`
   - `ok = await bcrypt.compare(password, hash)` — always runs, so timing is
     the same for unknown emails (spec §3.1.2)
   - `!user || !ok` → `InvalidCredentialsError`
   - otherwise `signToken(user._id)`
3. Nothing about the attempt is logged except the outcome
   (no email, no password).

`getDummyHash()` returns a memoized promise of
`bcrypt.hash(<random string>, env.BCRYPT_COST)`. `server.ts` awaits it once
at startup, so the first unknown-email login is not slower than the others.

### 7.2 Token (`authService`)

- `signToken(userId)`:
  `jwt.sign({}, env.JWT_SECRET, { algorithm: "HS256", subject: userId,
  expiresIn: env.JWT_EXPIRES_IN_SECONDS })`. Payload: `sub`, `iat`, `exp`
  only (spec §3.1.4).
- `verifyToken(token)`:
  `jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] })`. Returns the
  `sub` only if the payload is an object and `sub` is a 24-hex string;
  otherwise throws `UnauthorizedError`. Any library error (bad signature,
  expired, malformed, `alg: none`) becomes `UnauthorizedError`.

### 7.3 `authenticate` middleware (spec §3.2)

1. Read `Authorization`. It must match `^Bearer (\S+)$` (scheme
   case-insensitive). Otherwise → `UnauthorizedError`.
2. `userId = verifyToken(token)`.
3. `await userService.userExists(userId)` (`User.exists({ _id })`, index
   only). False → `UnauthorizedError`.
4. `req.auth = { userId }`; `next()`.

All failures produce the same `401 UNAUTHORIZED` body.

`types/express.d.ts` declares `auth?: { userId: string }` on
`Express.Request`. Controllers read it through `getAuth(req)`, which throws
`UnauthorizedError` if it is missing (a protected route mounted without the
middleware fails closed).

### 7.4 Ownership rule

Every service function that touches user data receives `userId` as its first
argument and puts it **in the query filter**. No function loads documents and
filters them afterwards. The worker uses the `userId` stored in the job.

## 8. Report jobs (D-001, D-003, D-004, D-011, D-021, D-023)

### 8.1 States

```
          claim                       success / no data
pending ────────▶ processing ───────────────────────────▶ done
   ▲                 │  │
   │  retryable error│  │ permanent error, or no attempts left,
   └─────────────────┘  │ or lease expired with no attempts left
     (attempts left)    └──────────────────────────────────▶ failed
```

`done` and `failed` are final: no write ever matches them again, because
every write filters by `status: "processing"` (and the lock token).

Public reasons (spec §3.7.3):

| Case | Final state | `reason` |
|---|---|---|
| Owner has no items | `done` | `No inventory data to report.` |
| Owner no longer exists | `failed` | `The user who requested this report no longer exists.` |
| Attempts exhausted (error or expired lease) | `failed` | `The report could not be produced after several attempts.` |

While a job is retried it reads `pending` or `processing` with no reason
(`reason` is cleared on claim).

### 8.2 Queue operations (`workers/jobQueue.ts`)

All are single MongoDB operations. `now` is taken once per call.

**`claimNextJob(maxAttempts, leaseMs)`** — one `findOneAndUpdate`:

```ts
filter: {
  attempts: { $lt: maxAttempts },
  $or: [
    { status: "pending" },
    { status: "processing", lockedUntil: { $lt: now } },
  ],
}
update: {
  $set: {
    status: "processing",
    lockedUntil: new Date(now + leaseMs),
    lockToken: randomUUID(),
    reason: null,
    statusChangedAt: now,
  },
  $inc: { attempts: 1 },
}
options: { sort: { createdAt: 1 }, returnDocument: "after" }
```

Returns the claimed job (with its new `lockToken` and `attempts`) or `null`.

**`failExhaustedJobs(maxAttempts)`** — one `updateMany`:

```ts
filter: {
  attempts: { $gte: maxAttempts },
  $or: [
    { status: "pending" },
    { status: "processing", lockedUntil: { $lt: now } },
  ],
}
```

→ `status: "failed"`, exhausted reason, `lockToken: null`,
`lockedUntil: null`, `statusChangedAt: now`. Runs before every claim, so a
job whose last attempt crashed reaches `failed` within one lease plus one
poll interval (spec §3.8.2). The `pending` branch covers jobs left with no
attempts after `REPORT_MAX_ATTEMPTS` is lowered; without it they would never
be claimed and would stay `pending` forever. The filter is the exact
complement of the claim filter for these two states.

**`renewLease(jobId, lockToken, leaseMs)`** — `updateOne` filtered by
`{ _id, status: "processing", lockToken }`, sets `lockedUntil`. Returns
`false` if nothing matched (the lease was lost).

**`finishJob(jobId, lockToken, outcome)`** — `updateOne` filtered by
`{ _id, status: "processing", lockToken }`:
- `done`: `status: "done"`, optional `reason`
- `retry`: `status: "pending"`
- `failed`: `status: "failed"`, `reason`

Every outcome also sets `lockToken: null`, `lockedUntil: null`,
`statusChangedAt: now`. If nothing matched, the worker logs
`lease lost` and does nothing else.

### 8.3 Worker loop (`workers/reportWorker.ts`)

```
load env → connectDb → ensureIndexes → wipeReportsDir()
while (!stopping):
  try:
    await failExhaustedJobs()
    job = await claimNextJob()
    if (!job): await setTimeout(WORKER_POLL_INTERVAL_MS); continue
    await runJob(job)              // never throws
  catch (err):
    log error; await setTimeout(WORKER_POLL_INTERVAL_MS)
disconnectDb → exit 0
```

- `setTimeout` is the promise version from `node:timers/promises`.
- One job at a time (D-004). When a job is found, the next claim happens
  immediately, without sleeping.
- A failure in one job is handled inside `runJob`; a failure in the loop
  itself (for example MongoDB unavailable) is logged and the loop continues
  (spec §3.8.7).
- With a 2 s poll interval, a job leaves `pending` within about 2 s when a
  worker is free (spec §4.4.2).

### 8.4 One attempt (`workers/runJob.ts`, `workers/processReportJob.ts`)

`runJob(job, deps)`:

1. Start the **heartbeat**: `setInterval(leaseMs / 3)` calling
   `renewLease`. If it returns `false`, mark the lease as lost. If it
   throws (for example MongoDB is unavailable), log the error with `jobId`
   and keep the heartbeat running; an error does not mark the lease as lost.
   If the outage lasts longer than the lease, the lease expires and the lock
   token protects the job (§8.2).
2. `await processReportJob(job, deps)` → returns `{ itemCount }`.
3. Stop the heartbeat (in `finally`).
4. Decide the outcome:

| Result | Outcome |
|---|---|
| Success with `itemCount > 0` | `done` |
| Success with `itemCount === 0` | `done` + "no inventory data" reason |
| `PermanentJobError` | `failed` + its reason, no retry (spec §3.8.5) |
| `LeaseLostError` | no write (another worker owns the job) |
| Other error, `attempts < max` | `retry` → `pending` |
| Other error, `attempts >= max` | `failed` + exhausted reason |

5. `finishJob(...)` and log the outcome with `jobId` and `attempt`.

`processReportJob(job, { emailSender, reportsDir, isLeaseLost })`:

1. `User.findById(job.userId).lean()` → missing → `PermanentJobError`.
2. `producedAt = new Date()` (used for the file name, the attachment name and
   the email body).
3. `filePath = <reportsDir>/<jobId>-<attempt>.xlsx` (unique per attempt).
4. `itemCount = await writeInventoryReport(userId, filePath)` (§8.5).
5. If `itemCount === 0` → return `{ itemCount: 0 }` without sending an email
   (spec §3.6). The file is removed by the `finally` below.
6. If `isLeaseLost()` → throw `LeaseLostError` (never send an email for a job
   this worker no longer owns).
7. `await emailSender.send(...)` (§8.6).
8. Return `{ itemCount }`.

In a `finally`, the file is removed with `removeFileQuietly` (deletion errors
are logged, never thrown), for success and failure alike (spec §4.5.1).

`deps` are passed in so tests can inject a fake `EmailSender` and a temporary
directory.

### 8.5 Spreadsheet (`workers/spreadsheet.ts`, spec §3.6.2)

`writeInventoryReport(userId, filePath): Promise<number>`:

- `new ExcelJS.stream.xlsx.WorkbookWriter({ filename: filePath })`, one
  worksheet `Inventory`.
- Columns, in order:

  | Header | Value | Format |
  |---|---|---|
  | `Name` | `name` | text |
  | `SKU` | `sku` | text |
  | `Category` | `category` | text |
  | `Location` | `location` | text |
  | `Quantity` | `quantity` | integer |
  | `Unit Price` | `centsToDollars(unitPriceCents)` | `0.00` |
  | `Total Value` | `centsToDollars(quantity * unitPriceCents)` | `0.00` |

- Rows come from `InventoryItem.find({ userId }).lean().cursor()`; each row is
  committed as it is read, so memory stays constant (D-021). The total is
  computed in integer cents and converted once (D-022).
- No `_id`, no `userId` in the file.
- After the cursor ends: `await workbook.commit()`; return the row count.
- Inventory is read at production time, not at request time
  (spec §3.6.3).

### 8.6 Email (D-011, spec §3.6.4)

```ts
interface EmailMessage {
  jobId: string;
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; path: string };
}
interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
```

The worker builds:

- `jobId`: the job id (for the log; a real provider would use it as the
  deduplication key, §14)
- `to`: the owner's email
- `subject`: `Your inventory report`
- `text`:
  `Hello <name>,\n\nYour inventory report was produced on <YYYY-MM-DD HH:mm:ss> UTC and contains <n> items.\n`
- `attachment.filename`: `inventory-report-<YYYYMMDD-HHmmss>Z.xlsx` from
  `producedAt` in UTC
- `attachment.path`: the temporary file

`ConsoleEmailSender.send` checks that the attachment exists (`fs.stat`) and
logs one line: `email sent` with `jobId`, `to`, `subject`, `attachment` name
and size. This log line is the "recorded simulated email" of spec §7.6, and
the only `email sent` line per email (the worker does not log another one).

Production (D-011): an SES/SMTP implementation of the same interface.

### 8.7 Temporary files (`workers/tempFiles.ts`, D-023, spec §4.5.1)

- `REPORTS_DIR` is created on worker startup if missing.
- `wipeReportsDir()` runs once at startup, before the loop: deletes every
  entry in `REPORTS_DIR`. Safe because the folder is not shared (D-006).
- Each attempt deletes its own file in `finally` (§8.4).
- No API endpoint reads or reveals this folder (spec §3.6.7).

### 8.8 Shutdown

- **Worker:** on `SIGTERM`/`SIGINT`, set `stopping = true`. The current job
  finishes normally, then the loop exits, Mongo disconnects and the process
  exits `0`. If Docker kills the process first, the lease expires and the job
  is claimed again (D-003).
- **API:** on `SIGTERM`/`SIGINT`, `server.close()`, then `disconnectDb()`,
  then exit `0`.

### 8.9 Logging (`utils/logger.ts`)

`logger.info|warn|error(message, fields?)` writes one JSON line to stdout
(`error` to stderr): `{"level":"info","msg":"job claimed","jobId":"…","attempt":1}`.

Worker events, all with `jobId`: `job claimed`, `report written` (rows, ms),
`email sent` (logged by `ConsoleEmailSender`, §8.6), `job done`, `job retry scheduled` (attempt, error message),
`job failed` (attempt, error message and stack), `lease lost`. Plus
`exhausted jobs failed` (count) when `failExhaustedJobs` changes anything.

Never logged: passwords, password hashes, tokens, request bodies.

## 9. Seed (D-015, D-024, spec §3.4)

- `src/seed/seedData.ts` holds the documented data: users with name, email
  and plain password (also listed in the README), and their items with prices
  in cents.
- `src/seed/runSeed.ts` exports `runSeed()`:
  1. `ensureIndexes()`
  2. For each user: `passwordHash = await bcrypt.hash(password, env.BCRYPT_COST)`;
     `User.findOneAndUpdate({ email }, { $set: { name, passwordHash } }, { upsert: true, returnDocument: "after" })`
     — keeps `_id` for existing users.
  3. For each user: `InventoryItem.deleteMany({ userId })`, then
     `InventoryItem.insertMany(items)`.
  4. `reportJobs` and users not in the seed are not touched.
- `scripts/seed.ts`: connect, `runSeed()`, log a summary, disconnect; exit
  `1` on error.

Data:

| User | Email | Password | Items |
|---|---|---|---|
| Alice Johnson | `alice@example.com` | `Alice#2026` | 10 |
| Bob Smith | `bob@example.com` | `Bob#2026` | 8 |
| Carol White | `carol@example.com` | `Carol#2026` | 0 |

The passwords are test credentials, documented in `README.md` (spec §3.4.4).
Only their bcrypt hashes are stored.

At least one SKU appears for both Alice and Bob, to show that SKUs are unique
per user only. Items span several categories and locations, with quantities
including `0` and prices with cents (for example `1999` → `19.99`).

The seed is not transactional (single-node MongoDB). If it stops halfway,
running it again restores the documented state.

Run: `docker compose exec api npm run seed` → `node dist/scripts/seed.js`.

## 10. Docker and Compose (D-005, D-006, D-025)

### 10.1 Dockerfile

```dockerfile
FROM node:24-slim AS build
WORKDIR /app
# Tests do not run in the image: skip the mongod download of mongodb-memory-server
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p /tmp/reports && chown node:node /tmp/reports
USER node
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
```

### 10.2 `compose.yaml`

```yaml
services:
  mongo:
    image: mongo:8
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  api:
    build: .
    image: inventory-app:local
    env_file: .env
    ports:
      - "3000:3000"
    depends_on:
      mongo:
        condition: service_healthy

  worker:
    build: .
    image: inventory-app:local
    command: ["node", "dist/src/workers/reportWorker.js"]
    env_file: .env
    restart: unless-stopped
    depends_on:
      mongo:
        condition: service_healthy

volumes:
  mongo-data:
```

- Both app services use the same `image` name; the second build is a cache
  hit, so there is one image (D-002).
- Mongo publishes no port (D-006). `compose.dev.yaml` adds
  `ports: ["27017:27017"]` to `mongo` for local tools:
  `docker compose -f compose.yaml -f compose.dev.yaml up`.
- `MONGO_URI` in `.env.example` is `mongodb://mongo:27017/inventory`.

### 10.3 Startup resilience

`connectDb(uri)` retries the initial connection (5 attempts, 2 s apart)
before failing, in addition to `depends_on: service_healthy`.

### 10.4 Ignore files

- `.gitignore`: `node_modules`, `dist`, `.env`, `coverage`, `*.xlsx`.
- `.dockerignore`: `node_modules`, `dist`, `.env`, `.git`, `tests`,
  `coverage`, `docs`.

## 11. Tooling

### 11.1 TypeScript

`tsconfig.json` (typecheck, includes `src`, `scripts`, `tests` and
`vitest.config.ts`, so ESLint's type-aware rules can read every TS file):

- `strict: true`
- `target: "ES2023"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- `esModuleInterop: true`, `skipLibCheck: true`
- `rootDir: "."`, `outDir: "dist"`

`tsconfig.build.json` extends it and includes only `src` and `scripts`, so
the output is `dist/src/...` and `dist/scripts/...`.

### 11.2 Lint

ESLint flat config (`eslint.config.js`) with `@eslint/js` recommended and
`typescript-eslint` recommended-type-checked (already forbids `any` and
floating promises). One extra rule, from the code conventions in CLAUDE.md:
`@typescript-eslint/explicit-module-boundary-types: error`.

Plain `.js` files (only `eslint.config.js`) are not in the TypeScript
project, so they use `tseslint.configs.disableTypeChecked`. Ignored: `dist`,
`coverage`.

### 11.3 npm scripts

| Script | Command |
|---|---|
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/src/server.js` |
| `start:worker` | `node dist/src/workers/reportWorker.js` |
| `seed` | `node dist/scripts/seed.js` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |
| `test` | `vitest run` |

`package.json`: `"type": "module"`, `"engines": { "node": ">=24" }`.

There is no local dev server script: the app runs through Docker Compose
(`docker compose up --build`). Only the tests run directly on the host, and
they need no `.env` (§12.1).

## 12. Testing (D-019, spec §7)

### 12.1 Setup

- `vitest.config.ts`: `globalSetup` starts one `MongoMemoryServer` and
  provides its URI; `test.env` sets fake config (`JWT_SECRET`,
  `MONGO_URI` placeholder, `BCRYPT_COST=4` for speed);
  `fileParallelism: false`.
- `tests/setup/db.ts` (setupFiles): connect to the provided URI before all
  tests, `ensureIndexes()`, clear all collections before each test,
  disconnect after all.
- HTTP tests call `createApp()` through supertest. Worker tests call
  `jobQueue`, `runJob` and `processReportJob` directly with a fake
  `EmailSender` and a temporary `reportsDir`.
- Helpers: `createUser()`, `createItems()`, `loginAs()`, `tokenFor()`.

### 12.2 Test files and the criteria they cover

| File | Covers |
|---|---|
| `auth.login.test.ts` | spec §7.1: success; email case/spaces; wrong password; unknown email returns the same body; missing field/empty password/wrong type/invalid email → 400; no hash in response |
| `auth.middleware.test.ts` | spec §7.2: no header; non-bearer; bad signature; `alg: none`; expired token; deleted user — same 401 body on every protected route; no token + invalid JSON body → 401 |
| `users.me.test.ts` | spec §7.3: exactly four fields; another user's id in query/body/header is ignored |
| `inventory.test.ts` | spec §7.5: A sees only A's items with exact fields; B's user id or item id in query/body/header → same response; `/inventory/<B item id>` → 404; empty user → `[]` |
| `reports.api.test.ts` | spec §7.6/spec §7.7: `202` with the four fields and a `pending` job stored; three calls → three ids; owner lookup `200` without `attempts`; other user / unknown / malformed id → identical `404` |
| `worker.queue.test.ts` | atomic claim: many concurrent `claimNextJob` calls on N jobs → each job claimed once; expired lease is reclaimed; exhausted job → `failed` by `failExhaustedJobs`; stale `lockToken` cannot finish a job; `done`/`failed` never change |
| `worker.process.test.ts` | spec §7.6/spec §7.8: success → one email with subject, attachment name pattern, spreadsheet rows read back with exceljs (headers, values, `Total Value`, no ids), file deleted; empty inventory → `done` + reason, no email; missing user → `failed` after one attempt; email fails once → `pending` then `done`; email always fails → `failed` after `max` attempts; lease lost → no email |
| `errors.test.ts` | spec §7.10: invalid JSON → 400 (login, and protected route with a valid token); body over limit → 400; unknown path/method → 404; forced service failure (`vi.mock`) → generic 500 |
| `config.test.ts` | spec §7.10: `loadEnv({})` fails naming `MONGO_URI` and `JWT_SECRET` |
| `seed.test.ts` | spec §7.4: after `runSeed()` the documented users and items exist with hashed passwords; second run → same state, same user ids, no duplicates, existing jobs unchanged |

### 12.3 Manual checks with Compose

Run before calling the work done:

1. `docker compose up --build`, seed, login, call every endpoint.
2. Request a report; `docker compose logs worker` shows the job and the
   `email sent` line; `docker compose exec worker ls /tmp/reports` is empty.
3. `docker compose stop worker`, request a report (stays `pending`),
   `docker compose start worker` → it reaches `done`.
4. `docker compose up -d --scale worker=3`, request several reports → each
   job has exactly one `email sent` line.

## 13. Dependencies

Approval required before installing (CLAUDE.md).

**Runtime**

| Package | Why |
|---|---|
| `express` (5) | HTTP framework required by the challenge (D-012) |
| `mongoose` | ODM, schemas and indexes (D-016) |
| `bcrypt` | Password hashing (D-014) |
| `jsonwebtoken` | Sign/verify JWT with pinned algorithm (D-008) |
| `zod` | Input and config validation (D-018) |
| `exceljs` | Streaming `.xlsx` writer (D-021) |

**Development**

| Package | Why |
|---|---|
| `typescript` | Compiler (D-005) |
| `@types/node`, `@types/express`, `@types/bcrypt`, `@types/jsonwebtoken`, `@types/supertest` | Type definitions |
| `vitest` | Test runner (D-019) |
| `supertest` | HTTP calls against `app` without a port (D-019) |
| `mongodb-memory-server` | Real `mongod` for tests (D-019) |
| `eslint`, `@eslint/js`, `typescript-eslint` | `npm run lint` |

## 14. Known limits and production notes

From spec §8 and the ADRs.

| Limit | Where | Production direction |
|---|---|---|
| Duplicate email possible after a crash between send and `done` | spec §8.1, D-003 | Idempotent provider call keyed by `jobId` |
| A frozen (not crashed) worker longer than the lease can lose its job | D-003 | Same as above; monitoring |
| Retries happen right away, with no delay: a short outage can use all attempts at once | D-003 | `availableAt` with exponential backoff |
| Jobs are kept forever | spec §8.2 | TTL index or archival |
| Inventory not paginated, order undefined | spec §8.3 | Cursor pagination by `_id` on the owner index |
| One API instance in Compose | spec §8.4, D-009 | ALB + several API tasks |
| Leftover temporary file has no deadline: it stays until the next worker start if deletion fails or the worker stays stopped | spec §8.5, D-023 | S3 + lifecycle rule |
| Reports stored per worker container | D-006 | S3 |
| No login rate limiting | decisions backlog | Rate limit per IP and email |
| One user lookup per authenticated request | D-008 | Acceptable; cache only if needed |
| Indexes built by `Model.init()` at startup | §5.4 | Explicit migrations; `autoIndex: false` |
