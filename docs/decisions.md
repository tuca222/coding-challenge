# Architecture Decision Records (ADR)

Each decision follows this format: context → decision → alternatives →
trade-offs → production notes. The **In short** line gives a one-sentence
summary.

ADRs explain **why** a technical choice was made. **How** it is built (data
model, fields, indexes, queries, API contracts, configuration values, files)
lives in `docs/plan.md`. Required behavior lives in `docs/spec.md`, which wins
over any ADR.

**Status values**
- **Accepted:** decided and confirmed.
- **Open:** not decided yet (see the Backlog at the end).

An accepted ADR changed before implementation keeps its id and carries an
**Amended** line with the date and the reason.

| ID | Decision | Status |
|---|---|---|
| D-001 | Persisted job queue in MongoDB (`reportJobs`) | Accepted (amended) |
| D-002 | Separate worker container, same image as the API | Accepted |
| D-003 | Atomic claim with lease, lock token, heartbeat and limited attempts | Accepted (amended) |
| D-004 | One job at a time per worker; scale with replicas | Accepted |
| D-005 | TypeScript | Accepted |
| D-006 | Three-container topology and Compose setup | Accepted (amended) |
| D-007 | Data owner comes only from the verified token | Accepted |
| D-008 | Stateless JWT authentication (HS256) with a user existence check | Accepted (amended) |
| D-009 | Stateless API, horizontally scalable (documented only) | Accepted |
| D-010 | `POST /reports/inventory` returns `202` with `jobId`; `GET /reports/:jobId` | Accepted (amended) |
| D-011 | Email as an adapter with a mock implementation | Accepted |
| D-012 | Express 5 | Accepted |
| D-013 | Layered architecture and `app.ts` / `server.ts` split | Accepted |
| D-014 | Password hashing with bcrypt | Accepted |
| D-015 | No sign-up endpoint; users are created by the seed | Accepted |
| D-016 | Mongoose as the MongoDB library | Accepted |
| D-017 | Inventory in its own collection, referenced by owner | Accepted |
| D-018 | Request and config validation with zod | Accepted |
| D-019 | Tests with Vitest, supertest and mongodb-memory-server | Accepted |
| D-020 | ES modules (ESM) | Accepted |
| D-021 | `.xlsx` generation with exceljs in streaming mode | Accepted |
| D-022 | Money stored as integer cents | Accepted |
| D-023 | Report file lifecycle: delete after use, wipe on worker startup | Accepted |
| D-024 | Idempotent seed that preserves user ids | Accepted |
| D-025 | Runtime images: `node:24-slim` and `mongo:8` | Accepted |

---

## D-001: Persisted job queue in MongoDB

**Status:** Accepted

**Amended 2026-10-05:** removed the list of planned fields. The job data model
is defined in `plan.md`, not here and not in the spec.

**In short:** Each report request is saved as a job document in MongoDB, and
the worker reads jobs from this collection. It works like a simple durable
queue: if the API or the worker crashes, the job is not lost.

**Context.** The report must be generated outside the HTTP request. The
challenge does not require an external queue, but it asks what happens on a
crash and how this works with many instances.

**Decision.** `POST /reports/inventory` inserts a document in the
`reportJobs` collection with `status: "pending"`. The worker consumes these
documents. States: `pending → processing → done | failed` (a job may go back
from `processing` to `pending` for a retry). The fields and indexes are in
`plan.md`.

**Alternatives considered**
- *Fire-and-forget* (promise without `await`): the CPU work still runs in the
  API process, and the job is lost on a crash.
- *In-memory queue + `worker_threads`*: CPU is isolated, but the job is lost
  on a crash and there is no coordination between instances.
- *External queue (SQS)*: the most robust option, but it adds
  infrastructure the challenge does not require (and spec §5.8 excludes).

**Trade-offs**
- ✅ Durable: the request survives API or worker crashes.
- ✅ Observable: job history can be queried in the database.
- ✅ No new infrastructure.
- ❌ Polling latency: a job may wait until the next polling cycle.
- ❌ Constant queries. Mitigation: an index that serves the claim query.
- ❌ A "home-made" queue: no built-in DLQ, backoff or metrics.

**In production.** The API publishes a message to SQS. Workers (ECS or Lambda)
consume it with visibility timeout, retries and a DLQ. The file goes to S3 and
the email goes through SES.

---

## D-002: Separate worker container, same image as the API

**Status:** Accepted

**In short:** The worker runs in its own container, using the same image as
the API with a different start command. The API and the worker never call each
other; they only share the jobs collection.

**Context.** Generating an `.xlsx` file is CPU work. In Node.js, CPU-bound code
on the main thread blocks the event loop and slows down every request.

**Decision.** Three Compose services: `api`, `worker` and `mongo`. The worker
uses the **same image** as the API with a different command. The API and the
worker **do not talk to each other directly**, only through MongoDB.

**Alternative.** Run the worker inside the API process (with
`worker_threads`). It saves one container, but it couples the lifecycle and
scaling of both.

**Trade-offs**
- ✅ Full CPU and failure isolation: if the worker fails, the API keeps
  working.
- ✅ Independent scaling, because the load profiles are different.
- ✅ One Dockerfile and shared code (models, config, connection).
- ❌ One more service to run and monitor.
- ❌ Both processes depend on the same job schema, so format changes must stay
  compatible.

---

## D-003: Atomic claim with lease, lock token, heartbeat and limited attempts

**Status:** Accepted

**Amended 2026-10-05:** aligned with the spec. The lease default is now
2 minutes (spec §3.8.3, was 5 minutes). Added a lock token and a heartbeat,
because spec §3.8.6 requires one producer at a time for any inventory size.
Added non-retryable failures (spec §3.8.5). The mechanism for jobs that run
out of attempts is defined in `plan.md` (the old text pointed to the spec).

**In short:** The claim is one atomic operation: find an available job and
mark it as processing in the same step, so two workers can never take the same
job. While a worker processes a job, it keeps renewing its lease. If the
worker dies, the lease expires and another worker can take the job.

**Context.** With more than one worker, two of them may try to process the
same job (a *check-then-act* race condition). A worker can also crash in the
middle of processing, or a job can take longer than its lease.

**Decision**
- The claim uses **one single** `findOneAndUpdate`. It filters available jobs
  and, in the same step, sets `status: "processing"`, sets the lease
  (`lockedUntil`), sets a new random **lock token** and increments `attempts`.
  MongoDB guarantees atomicity per document, so only one worker wins the
  claim.
- A job is available when it has attempts left and it is `pending`, or it is
  `processing` with an **expired lease**, which means its worker crashed.
- **Heartbeat:** while processing, the worker renews `lockedUntil` at regular
  intervals, filtering by its lock token. A long job therefore keeps its
  lease, and the lease only expires when the worker is really gone.
- **Lock token:** every write that finishes an attempt (`done`, `failed` or
  back to `pending`) filters by the job id, `status: "processing"` and the
  lock token. A worker that lost its job can never overwrite the state written
  by the worker that took over.
- **Retryable failure** (for example, email sending fails): if attempts are
  left, the job goes back to `pending`; otherwise it becomes `failed` with a
  readable reason.
- **Non-retryable failure** (the requesting user no longer exists): the job
  becomes `failed` right away, without using the remaining attempts.
- A job whose lease expired with no attempts left is marked `failed` by the
  worker, so no job stays in `processing` forever (spec §3.8.2).
- Lease, polling interval and maximum attempts are configurable. Values are
  in `plan.md`.

**Alternatives**
- *Lease only, no heartbeat:* simpler, but a job longer than the lease is
  claimed by a second worker while the first is still running. The lock token
  stops the late worker from changing the state, but not from sending a second
  email, which breaks spec §3.8.6.
- *Very long lease instead of a heartbeat:* avoids double processing, but
  delays recovery after a crash beyond what spec §3.8.3 allows.

**Trade-offs**
- ✅ Two workers never process the same job at the same time while the owner
  is alive, for any inventory size.
- ✅ Automatic recovery after a crash, within one lease period.
- ❌ **At-least-once:** if the worker crashes after sending the email but
  before marking the job `done`, the job runs again and the email is
  duplicated (spec §8.1). Production fix: idempotent sending, with the
  `jobId` as the deduplication key.
- ❌ A worker that is alive but frozen (for example a long GC pause or a
  network partition) longer than the lease can still lose its job while it
  runs. The lock token limits the damage to a possible duplicate email.
- ❌ Retries happen right away, without backoff. Production fix: exponential
  backoff (for example, an `availableAt` field).
- ❌ One extra small write per heartbeat interval while a job runs.

---

## D-004: One job at a time per worker; scale with replicas

**Status:** Accepted

**In short:** Each worker handles one job at a time. For more throughput, we
add more worker containers.

**Decision.** Each worker processes one job at a time. To increase
throughput, run more replicas (`docker compose up --scale worker=N`). The
atomic claim (D-003) lets the replicas share the jobs without conflict.

**Alternatives**
- Many concurrent jobs in one worker (`Promise.all`): this helps with I/O
  (database, disk, email), but it does not run the Excel generation in
  parallel, because JavaScript runs on a single thread.
- `worker_threads` inside the worker: real CPU parallelism, but more
  complexity (messages between threads, error handling per thread).

**Trade-offs**
- ✅ Simple and predictable; each container uses about one CPU core.
- ✅ Scaling is handled by the orchestrator (Compose, ECS, Kubernetes).
- ❌ Lower throughput per instance.

---

## D-005: TypeScript

**Status:** Accepted

**In short:** TypeScript makes contracts clear (token payload, DTOs, job
states) and catches errors before the code runs.

**Decision.** TypeScript with `strict: true`, compiled with `tsc` to `dist/`.
The Dockerfile uses a **multi-stage build**: one stage compiles the code with
dev dependencies, and the final stage has only `dist/` and production
dependencies.

**Trade-offs**
- ✅ Types document contracts and catch errors early.
- ❌ A build step in Docker and in local development.
- ❌ Extra setup (tsconfig, Express types, module system; see D-020).
- ❌ Every script that runs inside a container, including the seed, must be
  compiled too (see D-024).

---

## D-006: Three-container topology and Compose setup

**Status:** Accepted

**Amended 2026-10-05:** removed the optional `reports-data` volume. Report
files stay in each worker container's own filesystem, because the startup
cleanup of D-023 is only safe when no other worker shares the folder.

**In short:** Only the API port is published. MongoDB is reachable only
inside the Docker network, and the app waits for MongoDB to be healthy before
it starts.

**Decision**
- Services `api`, `worker` and `mongo` on the default Compose network.
  Services find each other by name: `mongodb://mongo:27017/<db>`, never
  `localhost`.
- Only the API publishes a port. **MongoDB publishes no port.** To use a GUI
  client during development, publish the port in a separate override file,
  not in the main Compose file.
- Named volume for MongoDB data, for persistence. **No volume for report
  files**: each worker container keeps its temporary files in its own
  filesystem (D-023).
- `healthcheck` on MongoDB. The API and the worker use
  `depends_on: condition: service_healthy`. The app also retries the
  connection.
- The worker uses `restart: unless-stopped`.
- Configuration comes from `.env` (in `.gitignore`). A `.env.example` with fake
  values is committed. `.dockerignore` excludes `node_modules`, `.env` and
  `dist`.
- Containers run as a non-root user (`USER node`).
- The email provider is outside the Docker network and only the worker talks
  to it. In this challenge it is a mock (see D-011).

**Trade-offs**
- ✅ The database is not exposed, config is outside the code, and everything
  starts with one command.
- ❌ Report files are local to each container. With many worker replicas,
  each one has its own files. In production, storage would be shared (S3).

---

## D-007: Data owner comes only from the verified token

**Status:** Accepted (challenge requirement)

**In short:** The user id always comes from the verified token, never from the
request, and the owner filter is part of the database query.

**Decision.** The user id used in any filter comes only from the identity set
by the auth middleware (`req.auth`). Query, body, params and headers never
define the owner. The filter is applied **inside the database query**. The
worker uses the `userId` saved in the job, which came from the token when the
report was requested.

**Trade-offs**
- ✅ Prevents IDOR by design: the client has no input that changes the filter.
- ❌ Nothing relevant for this scope. Admin access would need a role model
  (out of scope).

---

## D-008: Stateless JWT authentication (HS256) with a user existence check

**Status:** Accepted

**Amended 2026-10-05:** spec §3.2 requires `401` for a valid token whose user
no longer exists. The middleware now checks that the user exists, which adds
one indexed lookup per request. The API still keeps no session state (D-009).

**In short:** The token is signed, not encrypted. It only carries the user id
and the expiry time. The server checks the signature and expiration on every
request, and then checks that the user still exists.

**Decision.** JWT signed with HMAC-SHA256 using `JWT_SECRET`. Minimal payload:
`sub` (user id), `iat` and `exp`, with a short, configurable expiration.
Verification pins the algorithm (`HS256`). After verifying the token, the
middleware checks that a user with that id exists, reading only the `_id`.
Every failure returns the same `401`. Login returns the same `401` message for
"unknown email" and "wrong password".

**Alternatives**
- *Token check only, no database lookup:* fully stateless, but a deleted user
  keeps access until the token expires, which the spec does not allow.
- *Server-side sessions:* revocable, but they add state to the API and work
  against D-009.

**Trade-offs**
- ✅ No session storage: any instance can authenticate a request.
- ✅ Deleted users lose access immediately.
- ❌ One indexed query per authenticated request (by `_id`, so it is cheap).
- ❌ A token cannot be revoked before `exp` for a user who still exists.
  Mitigations: short expiration, refresh tokens or a denylist (out of scope).
- ❌ Anyone can read the payload (signed, not encrypted), so it holds nothing
  sensitive.

---

## D-009: Stateless API, horizontally scalable (documented only)

**Status:** Accepted

**In short:** The API keeps no state in memory, so it can run as many
instances behind a load balancer.

**Decision.** The API keeps no in-memory state: the session comes from the JWT
and the jobs live in MongoDB. This is **not** implemented in Compose, because
a fixed published host port blocks several replicas without a load balancer.
It is documented in the README.

**In production.** An ECS service behind an ALB, with auto scaling on CPU or
request count. Workers scale on queue depth.

---

## D-010: `POST /reports/inventory` returns `202` with `jobId`; job status route

**Status:** Accepted

**Amended 2026-10-05:** aligned with spec §3.6 and §3.7. A malformed `jobId`
now returns `404` (was `400`), the status response no longer exposes
`attempts`, and the `202` response includes the initial state.

**In short:** The report request returns `202 Accepted` right away with a
`jobId`, and the client can check the job status with `GET /reports/:jobId`.

**Decision**
- `POST /reports/inventory` returns `202 Accepted` with the body suggested by
  the challenge plus the job id and its initial state. The exact contract is
  in `plan.md`.
- `GET /reports/:jobId` (protected) returns the job state, its timestamps and
  a readable reason when there is one. It does not return the attempt count,
  internal file paths or internal error details.
- The status query is always filtered by owner (D-007). A job that belongs to
  another user, a job that does not exist and a malformed `jobId` all return
  the **same `404`**. Returning `403` or `400` would let a caller tell these
  cases apart.

**Trade-offs**
- ✅ Correct HTTP meaning, and the `jobId` makes the job traceable.
- ✅ The status route makes the async flow visible and easy to test.
- ❌ A client with a typo in the id gets `404` instead of a more specific
  `400`; this is the price of not leaking information.

---

## D-011: Email as an adapter with a mock implementation

**Status:** Accepted

**In short:** The worker depends on an `EmailSender` interface. In this
challenge it logs the email; a real provider would be another implementation.

**Decision.** The worker depends on an `EmailSender` interface. This
challenge uses `ConsoleEmailSender`, which logs the email. A real provider
(SES, SendGrid) would be another implementation, with no change to the worker.
Tests use a fake implementation to simulate failures.

**In production.** The provider is outside the Docker network and only the
worker reaches it, over HTTPS or SMTP with TLS. Attachments have size limits,
so a better pattern is to upload the file to S3 and send a pre-signed link
that expires. Email failures count as job failures and use the retry flow
(D-003).

---

## D-012: Express 5

**Status:** Accepted

**In short:** In Express 5, errors thrown in `async` handlers go to the error
middleware automatically.

**Decision.** Use Express 5. Rejected promises in `async` handlers are passed
to the error middleware automatically. In Express 4 a wrapper is needed, or
the request hangs.

**Trade-offs.** ✅ Less boilerplate and fewer unhandled errors. ❌ Some online
material still targets Express 4.

---

## D-013: Layered architecture and `app.ts` / `server.ts` split

**Status:** Accepted

**In short:** Routes, controllers, services and models each have one job, and
the Express app is built separately from the server so tests can use it
directly.

**Decision.** Flow: routes → controllers → services → models, with central
auth and error middleware and typed errors (`AppError`). `app.ts` builds the
Express app without calling `listen`. `server.ts` connects to the database and
starts the server, so tests use the `app` directly. All config is read and
validated in `config/env.ts`, and the app fails at startup if a required
variable is missing.

**Trade-offs.** ✅ Testable, with clear responsibilities. ❌ More files for a
small project.

---

## D-014: Password hashing with bcrypt

**Status:** Accepted

**In short:** Only a bcrypt hash of the password is stored. bcrypt is slow on
purpose and adds a random salt, so stolen hashes are expensive to crack.

**Context.** The challenge requires that passwords are not stored in plain
text. Fast hashes (MD5, SHA-256) are not safe for passwords: a GPU can test
billions of them per second.

**Decision**
- Store only a bcrypt hash. The salt is random and stored inside the hash
  string, so no separate salt field is needed.
- The cost factor comes from config (each +1 doubles the time). The default
  value is in `plan.md`.
- Use the native `bcrypt` package with its **async API**. The hash runs on the
  libuv thread pool, so it does not block the event loop during login.
- The seed hashes the test passwords before inserting users. Plain passwords
  exist only in the README, as test credentials.
- Login: find the user by email, then compare with `bcrypt.compare`. If the
  email does not exist, still compare against a dummy hash with the same
  cost, so the response time does not reveal which emails exist. Both cases
  return the same `401`.
- The hash is never returned by the API and never logged. Responses use
  explicit DTOs or projections.

**Alternatives**
- *argon2id*: the current OWASP first choice and memory-hard (more resistant
  to GPUs). Not chosen because bcrypt is simpler, very common and still
  accepted by OWASP for this scope.
- *`bcryptjs`* (pure JavaScript): no native build, but slower, and it does the
  work on the JavaScript thread instead of the thread pool.

**Trade-offs**
- ✅ Slow by design, with a salt per password and a cost that can grow.
- ❌ bcrypt only uses the first **72 bytes** of the password. Risk is low here
  (no sign-up), but a public sign-up would need a max-length check.
- ❌ The native package needs a compiled binary in the Docker image (see
  D-025).
- ❌ Each login costs about 100–300 ms of CPU. This is intended, but it also
  makes login a target for abuse. Production fix: rate limiting.

---

## D-015: No sign-up endpoint; users are created by the seed

**Status:** Accepted

**In short:** The only users are the ones created by the seed script.

**Decision.** There is no registration endpoint. Users and inventory are
created only by the seed. The README lists the test credentials.

**Trade-offs.** ✅ Smaller attack surface and scope focused on what the
challenge evaluates. ❌ Testing with new users requires changing the seed.

---

## D-016: Mongoose as the MongoDB library

**Status:** Accepted

**In short:** Mongoose schemas document the data model in code and make it
easy to hide the password hash by default.

**Context.** The API, the worker and the seed share three collections. The
model must be easy to read during a review, and the password hash must never
leak by accident.

**Decision.** Use Mongoose. Schemas declare fields, types, constraints and
indexes in one place. The password hash field uses `select: false`, so it is
only loaded when a query asks for it explicitly. Read paths use `lean()` and
map documents to DTOs. The job claim and other critical writes use
`findOneAndUpdate` / `updateOne` / `updateMany` with explicit filters, which
Mongoose passes straight to MongoDB.

**Alternatives**
- *Native `mongodb` driver:* fewer layers and no hidden behavior, but schemas,
  validation and index declarations would have to be written by hand.

**Trade-offs**
- ✅ The model is readable in one file per collection.
- ✅ `select: false` makes "hash not returned" the default.
- ❌ An extra abstraction with its own behaviors (casting, middleware,
  `timestamps`) that must be understood.
- ❌ Slightly slower than the native driver; irrelevant at this scale.

---

## D-017: Inventory in its own collection, referenced by owner

**Status:** Accepted

**In short:** Each inventory item is its own document with the owner's user
id, instead of an array inside the user document.

**Context.** Inventories can grow large ("millions of records" is a review
topic), every inventory read must be filtered by owner, and the worker must
read a user's items without loading the whole set into memory.

**Decision.** Three collections: `users`, `inventory` (one document per item,
with the owner id) and `reportJobs`. The owner filter is an indexed field in
every inventory query. The exact fields and indexes are in `plan.md`.

**Alternatives**
- *Embed items in the user document:* one read per user, but the document
  grows without limit (16 MB cap), every item change rewrites the user, and
  the user document would carry inventory data into places that only need
  the profile.

**Trade-offs**
- ✅ No document size limit; items can be streamed with a cursor.
- ✅ The owner filter is explicit in every query and backed by an index.
- ✅ A unique index on owner + SKU enforces "SKU unique per user".
- ❌ Two queries when both profile and items are needed (never in this API).

---

## D-018: Request and config validation with zod

**Status:** Accepted

**In short:** zod schemas validate input at the boundary and give the
TypeScript types for free.

**Decision.** Use zod to validate request bodies and params in the HTTP layer
and to validate environment variables in `config/env.ts`. Validation failures
become `400` (requests) or a startup failure that names the variable (config).

**Alternatives**
- *Manual checks:* no dependency, but verbose and easy to get wrong with
  `unknown` input.
- *joi / express-validator:* mature, but they do not infer TypeScript types.

**Trade-offs**
- ✅ One schema gives the runtime check and the static type.
- ❌ One more runtime dependency.

---

## D-019: Tests with Vitest, supertest and mongodb-memory-server

**Status:** Accepted

**In short:** HTTP tests run the real Express app against a real MongoDB
server started in memory, with a fast TypeScript-native runner.

**Decision.** Vitest as the test runner, supertest to call the Express `app`
without opening a port, and mongodb-memory-server to start a real `mongod`
for the test run. Worker logic is tested by calling its functions directly,
with a fake `EmailSender`.

**Alternatives**
- *Jest:* widely known, but needs `ts-jest` or Babel and extra setup for ESM
  (D-020).
- *MongoDB from Docker Compose:* closest to production, but tests would depend
  on Docker being up.

**Trade-offs**
- ✅ Runs TypeScript and ESM without extra transforms.
- ✅ Real MongoDB semantics (atomic `findOneAndUpdate`, unique indexes).
- ❌ mongodb-memory-server downloads a `mongod` binary on first run.

---

## D-020: ES modules (ESM)

**Status:** Accepted

**In short:** The project uses native ES modules, the current Node.js
standard.

**Decision.** `"type": "module"` in `package.json` and
`module`/`moduleResolution: "NodeNext"` in `tsconfig.json`. Relative imports
use the `.js` extension, as Node requires for ESM.

**Alternatives**
- *CommonJS:* no extensions in imports and familiar to many readers, but it is
  the legacy format, and ESM-only packages need extra care.

**Trade-offs**
- ✅ Standard module system; works with Vitest without transforms.
- ❌ Relative imports in TypeScript end in `.js`, which surprises some readers.
- ❌ No `__dirname`; use `import.meta` when a path is needed.

---

## D-021: `.xlsx` generation with exceljs in streaming mode

**Status:** Accepted

**In short:** The worker streams items from MongoDB straight into the
spreadsheet file, so memory use does not grow with the inventory size.

**Decision.** Use exceljs with its streaming workbook writer. The worker reads
the inventory with a MongoDB cursor and writes each row to the file as it
arrives, then commits the workbook.

**Alternatives**
- *SheetJS (`xlsx`):* popular, but it builds the whole workbook in memory
  before writing, so memory grows with the inventory. Also, the `xlsx` package
  on the npm registry is frozen at an old version (0.18.5) with known,
  unpatched vulnerabilities; newer versions are only distributed from the
  vendor's own CDN, which `npm audit` and dependency bots track poorly.
- *CSV:* trivial to stream, but the spec requires `.xlsx` (spec §5.6).

**Trade-offs**
- ✅ Constant memory for any inventory size.
- ✅ Supports number formats (two decimal places for prices).
- ❌ Many transitive dependencies (zip, XML and CSV libraries), which means
  more code in the image and more packages to audit.

---

## D-022: Money stored as integer cents

**Status:** Accepted

**In short:** Prices are stored as whole cents, so totals are exact.

**Context.** The spec requires prices in US dollars with two decimal places
and a `Total Value = quantity × unitPrice` column with two decimal places
(spec §3.4, §3.6). JavaScript numbers are binary floating point, so values
like `0.1 + 0.2` are not exact.

**Decision.** Store the unit price as an integer number of US cents. All
calculations are done in cents, with integer arithmetic. Only at the edge
(the API response and the report) the result is converted once to dollars
with two decimal places, for example `1999` cents → `19.99`.

**Alternatives**
- *Number with two decimals:* simplest, but needs rounding at every
  calculation and can still produce off-by-one-cent results.
- *Decimal128:* exact, but needs manual conversion in every read and in JSON
  output.

**Trade-offs**
- ✅ Exact arithmetic with plain integers.
- ❌ The stored field differs from the business field name; the mapping lives
  in one DTO function and in the report writer.

---

## D-023: Report file lifecycle: delete after use, wipe on worker startup

**Status:** Accepted

**In short:** The worker deletes the report file after each attempt, and on
startup it deletes every file left in its reports folder.

**Context.** Spec §4.5.1 requires the file to be removed after the email is
sent and when the job fails, and any file left behind (for example after a
crash) to be removed within one hour.

**Decision**
- After every attempt, successful or not, the worker deletes the file it
  created.
- When the worker process starts, it deletes **everything** in its reports
  folder before taking jobs. At that moment the process has no job in
  progress, so every file there is an orphan from a previous run.
- This is only safe because the folder is **not shared** between worker
  replicas (D-006).

**Alternatives**
- *Periodic sweeper by file age:* also covers the rare cases below, but adds a
  timer and an age setting for little gain in this scope.
- *Shared volume + external cron:* more infrastructure, and a startup wipe
  would delete files another worker is using.

**Trade-offs**
- ✅ Simple: no timers, no age calculation.
- ✅ Covers the main case: a crash followed by a container restart
  (`restart: unless-stopped`).
- ❌ **Known limit:** a file can stay longer than one hour only if deleting
  it fails while the worker keeps running, or if the worker stays stopped for
  more than one hour after a crash. In both cases it is removed the next time
  the worker starts. The README states this.

**In production.** Files go to S3 with a lifecycle rule that expires them.

---

## D-024: Idempotent seed that preserves user ids

**Status:** Accepted

**In short:** Running the seed again resets the seed users and their items to
the documented state, without duplicates and without touching report jobs.

**Context.** Spec §3.4.5 requires that loading the initial data again leaves
the documented state, without duplicates, and does not affect existing report
requests.

**Decision**
- Users are upserted by email. An existing user keeps its `_id`, so jobs that
  reference it stay valid.
- The inventory of each seed user is replaced (delete that user's items, then
  insert the documented items). Other users and `reportJobs` are not touched.
- The seed is TypeScript compiled to `dist/` and run with `node`, because the
  production image has no TS runner (D-005).

**Alternatives**
- *Drop the database and re-insert:* simplest, but changes user ids and
  deletes report jobs, which the spec forbids.
- *Insert only if empty:* never restores items that were changed.

**Trade-offs**
- ✅ Safe to run many times.
- ❌ Changes made to the seed users' items are lost on every run (intended).

---

## D-025: Runtime images: `node:24-slim` and `mongo:8`

**Status:** Accepted

**In short:** Use the current Node.js LTS (slim variant) and MongoDB 8, with
the major version fixed in the image tags.

**Decision.** Base image `node:24-slim` for both build and runtime stages, and
`mongo:8` for the database. Node 24 is the most recent LTS line, and `slim` is
the official image without build tools the app does not need. The tags fix
the **major version only**: a rebuild gets the latest patch release (security
fixes) of the same major, but never jumps to a new major. JavaScript
dependencies are locked separately by `package-lock.json` and `npm ci`.

**Alternatives**
- *Smaller or larger image variants (`alpine`, full image):* not needed; the
  default slim variant is the most common choice and image size is not a
  concern in this challenge.
- *Exact version tags:* fully reproducible, but security patches only arrive
  when someone updates the tag by hand.

**Trade-offs**
- ✅ Patch updates arrive on rebuild without changing the Dockerfile.
- ❌ Two builds at different times may use different patch versions.

---

## Backlog

No open decisions. Items considered and **not implemented**, with the reason:

| Topic | Status | Notes |
|---|---|---|
| Pagination on `/inventory` | Not implemented — out of scope (spec §6, §8.3) | Production: cursor pagination by `_id`, using the owner index |
| Login rate limiting | Not implemented — out of scope (spec §6) | Production: rate limit per IP and per email; reduces brute force and bcrypt CPU abuse (D-014) |
| Logging library | Not needed | A small `logger` module over `console`; a structured logger (pino) in production |
