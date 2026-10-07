# Tasks

> Execution order for `docs/plan.md`. Each task is small, has its own tests
> and becomes **one commit**. Tasks only reference the spec (`spec §x`) and the
> plan (`plan §x`); they add no requirement and no design. If a task cannot be
> done as the plan says, stop and ask (CLAUDE.md).

## 1. Rules

1. **One task = one commit.** Conventional commit message, as given in the
   task. Target size: up to ~200 changed lines, tests included.
2. **Every task has at least one test**, and one test per relevant scenario
   (success, each error case, edge cases). The **Tests** field lists the
   scenarios; all of them must be implemented.
   - Exception: entrypoint, infrastructure and documentation tasks (T02, T22,
     T30, T32–T36) have no Vitest test in `plan §12`. Their **Tests** field is
     a reproducible verification: commands plus expected result.
3. **Definition of done** (CLAUDE.md), for every task:
   `npm run typecheck`, `npm run lint` (from T02 on) and `npm run test` pass;
   no secrets, `node_modules`, `dist` or generated reports committed. From
   T34 on, `docker compose up --build` must still work.
4. Do not edit `spec.md`, `plan.md` or `decisions.md` while implementing.
5. **All npm dependencies are installed in T01** (list in `plan §13`), after
   the user approves them. Later tasks do not touch `package.json` or
   `package-lock.json`, so parallel tasks never conflict on them.

## 2. Execution protocol (subagents)

- The orchestrator runs the waves of §3 in order. Inside a wave, every task
  can run in parallel: **one subagent per task**, each in its own git
  worktree, branched from `main` after the previous wave was merged.
- Each subagent gets: the task text, CLAUDE.md, and the referenced sections of
  `spec.md` and `plan.md`. It implements the task, runs the checks of rule 3,
  commits, and returns a short summary (what changed, how to verify).
- The orchestrator merges the branches of a wave **one at a time** into
  `main`, running `npm run typecheck && npm run lint && npm run test` after
  each merge. The next wave starts only when the whole wave is merged and
  green.
- **Shared files.** These files are edited by more than one task. Conflicts
  are expected to be one-line and are resolved by the orchestrator while
  merging:

  | File | Tasks | Kind of change |
  |---|---|---|
  | `src/routes/index.ts` | T12, T15, T17, T18, T19 | one `router.use(...)` line each |
  | `tests/helpers.ts` | T14, T15 | T15 adds `loginAs()` |
  | `tests/setup/db.ts` | T06, T10 | T10 adds `ensureIndexes()` |
  | `tests/errors.test.ts` | T12, T17 | T17 adds the `500` case |
  | `src/services/authService.ts` | T13, T15 | T15 adds `login()` (different waves) |
  | `src/services/userService.ts` | T16, T17 | T17 adds `getProfile()` (different waves) |
  | `src/services/reportService.ts`, `reportController.ts`, `reportRoutes.ts` | T19, T20 | sequential (T20 depends on T19) |
  | `src/workers/jobQueue.ts` | T26, T27 | sequential (T27 depends on T26) |

## 3. Waves and dependencies

| Wave | Tasks (parallel) | Waits for |
|---|---|---|
| W0 | T01 | — |
| W1 | T02, T03, T04, T05 | W0 |
| W2 | T06, T12, T13, T23, T24 | W1 |
| W3 | T07, T08, T09 | W2 |
| W4 | T10, T11 | W3 |
| W5 | T14, T22, T25, T26, T31 | W4 |
| W6 | T15, T16, T27, T28, T32 | W5 |
| W7 | T17, T18, T19, T29 | W6 |
| W8 | T20, T30 | W7 |
| W9 | T21, T33 | W8 |
| W10 | T34 | W9 |
| W11 | T35 | W10 |
| W12 | T36 | W11 |

```
T01 ─┬─ T02
     ├─ T03 ─┬─ T06 ─┬─ T07 ─┐
     │       │       ├─ T08 ─┼─ T10 ─┬─ T14 ─┬─ T15 ─────────────────┐
     │       │       └─ T09 ─┘       │       └─ T16 ─┬─ T17 ─────────┤
     │       └─ T13 ─────────────────┘               ├─ T18 ─────────┼─ T21
     ├─ T04 ─┬─ T23 ─────────────┐                   └─ T19 ─ T20 ───┘
     │       └─ T24 ─────────────┤
     └─ T05 ── T12               │
                                 │
     T10 ─┬─ T25 ────────────────┴─ T28 ─┐
          ├─ T26 ─ T27 ──────────────────┴─ T29 ─ T30 ─┐
          ├─ T31 ─ T32 ────────────────────────────────┼─ T33 ─ T34 ─ T35 ─ T36
          ├─ T11 (DTOs → T17, T18, T20)                │
          └─ T22 (server.ts) ──────────────────────────┘
```

Exact dependencies are in each task (**Depends on**). Critical path:
T01 → T03 → T06 → T07 → T10 → T26 → T27 → T29 → T30 → T33 → T34 → T35 → T36.

## 4. Tasks

### Phase A — Foundation

#### T01 — Project scaffold and test runner

- **Plan:** §3, §11.1, §11.3, §12.1, §13
- **Depends on:** —
- **Files:** `package.json`, `package-lock.json`, `tsconfig.json`,
  `tsconfig.build.json`, `vitest.config.ts`, `tests/setup/globalSetup.ts`,
  `tests/smoke.test.ts`
- **Work:** `"type": "module"`, `engines.node >=24`, all scripts of
  `plan §11.3`; install the runtime and dev dependencies of `plan §13`
  (**ask for approval first**); TypeScript config of `plan §11.1`
  (`tsconfig.json` also includes `vitest.config.ts`);
  `vitest.config.ts` with `globalSetup` (one `MongoMemoryServer`, URI
  provided to tests), `test.env` with fake config (`JWT_SECRET`, `MONGO_URI`
  placeholder, `BCRYPT_COST=4`) and `fileParallelism: false`.
- **Tests:**
  - smoke test: the URI provided by `globalSetup` is a `mongodb://` URI.
- **Done when:** `npm run typecheck` and `npm run test` pass.
- **Commit:** `chore: scaffold TypeScript project and test runner`

#### T02 — ESLint

- **Plan:** §11.2
- **Depends on:** T01
- **Files:** `eslint.config.js`
- **Work:** flat config, `@eslint/js` recommended, `typescript-eslint`
  recommended-type-checked, `explicit-module-boundary-types: error`;
  `disableTypeChecked` for `.js` files; ignore `dist`, `coverage`.
- **Tests (verification):**
  - `npm run lint` exits 0 on the current code, including
    `eslint.config.js` and `vitest.config.ts`;
  - a temporary file with `const x: any = 1; export function f() { return x; }`
    makes `npm run lint` fail (file removed before commit).
- **Commit:** `chore: add ESLint config`

#### T03 — Configuration

- **Spec:** §4.3 · **Plan:** §4
- **Depends on:** T01
- **Files:** `src/config/env.ts`, `tests/config.test.ts`
- **Work:** zod schema with the variables and defaults of `plan §4`;
  `loadEnv(source)` returns the typed config or **throws**
  `Missing or invalid config: <names>`; `env` built from `process.env`
  catches that error, prints it and exits `1`. Only place that reads
  `process.env`.
- **Tests:**
  - all required values present → defaults applied (`PORT=3000`,
    `JWT_EXPIRES_IN_SECONDS=3600`, `REPORT_MAX_ATTEMPTS=3`, …);
  - `loadEnv({})` → throws naming `MONGO_URI` and `JWT_SECRET`;
  - a non-numeric number (`PORT=abc`) → throws naming `PORT`;
  - numeric strings are converted to numbers.
- **Commit:** `feat(config): load and validate env vars`

#### T04 — Logger and money utils

- **Plan:** §5.5, §8.9
- **Depends on:** T01
- **Files:** `src/utils/logger.ts`, `src/utils/money.ts`,
  `tests/utils.test.ts`
- **Work:** `logger.info|warn|error(msg, fields?)` → one JSON line (`error`
  to stderr); `centsToDollars(cents)`.
- **Tests:**
  - `centsToDollars(1999)` → `19.99`; `0` → `0`; `100` → `1`;
  - `logger.info` writes one JSON line with `level`, `msg` and the fields
    (spy on stdout);
  - `logger.error` writes to stderr.
- **Commit:** `feat(utils): add JSON logger and money helper`

#### T05 — Typed errors

- **Plan:** §6.2
- **Depends on:** T01
- **Files:** `src/errors/AppError.ts`, `tests/appError.test.ts`
- **Work:** `AppError(status, code, message)` and subclasses
  `ValidationError`, `InvalidCredentialsError`, `UnauthorizedError`,
  `NotFoundError` with the codes and messages of `plan §6.2`.
- **Tests:**
  - each subclass has the status, code and default message of the table;
  - `ValidationError` keeps a custom message;
  - every subclass is `instanceof AppError` and `Error`.
- **Commit:** `feat(errors): add AppError and subclasses`

### Phase B — Data

#### T06 — Database connection and test DB setup

- **Plan:** §10.3, §12.1
- **Depends on:** T03, T04
- **Files:** `src/db/connect.ts`, `tests/setup/db.ts`, `vitest.config.ts`
  (register `setupFiles`), `tests/db.test.ts`
- **Work:** `connectDb(uri)` retries 5 times, 2 s apart, logging each
  failure; `disconnectDb()`. Test setup: connect to the provided URI before
  all, clear every collection before each test, disconnect after all.
- **Tests:**
  - `connectDb` with the memory-server URI → connected (`readyState === 1`);
  - `disconnectDb` → disconnected (`readyState === 0`), then reconnect;
  - a document inserted in one test is gone in the next (collections cleared).
- **Commit:** `feat(db): add Mongo connection with retry`

#### T07 — User model

- **Spec:** §3.1, §3.4, §4.1 · **Plan:** §5.1
- **Depends on:** T06
- **Files:** `src/models/User.ts`, `tests/user.model.test.ts`
- **Tests:**
  - email is stored trimmed and lowercased;
  - duplicate email (different case) → duplicate-key error (after
    `User.init()`);
  - `passwordHash` is not returned by default and is returned with
    `select("+passwordHash")`;
  - missing `name`/`email`/`passwordHash` → validation error;
  - `createdAt`/`updatedAt` are set.
- **Commit:** `feat(models): add User model`

#### T08 — InventoryItem model

- **Spec:** §3.4 · **Plan:** §5.2
- **Depends on:** T06
- **Files:** `src/models/InventoryItem.ts`, `tests/inventoryItem.model.test.ts`
- **Tests:**
  - valid item saves;
  - same `sku` for the same user → duplicate-key error;
  - same `sku` for two users → both saved;
  - empty `name`/`sku`/`category`/`location` → validation error;
  - negative or non-integer `quantity` → validation error;
  - negative or non-integer `unitPriceCents` → validation error.
- **Commit:** `feat(models): add InventoryItem model`

#### T09 — ReportJob model

- **Spec:** §3.7 · **Plan:** §5.3
- **Depends on:** T06
- **Files:** `src/models/ReportJob.ts`, `tests/reportJob.model.test.ts`
- **Tests:**
  - a job created as in `plan §6.6` (`userId`, `status: "pending"`,
    `attempts: 0`, `statusChangedAt`) saves and reads back with those values;
  - missing `userId` → validation error;
  - status outside `pending|processing|done|failed` → validation error;
  - indexes `{ status, createdAt }` and `{ status, lockedUntil }` exist
    after `ReportJob.init()`.
- **Commit:** `feat(models): add ReportJob model`

#### T10 — ensureIndexes

- **Plan:** §5.4
- **Depends on:** T07, T08, T09
- **Files:** `src/db/connect.ts`, `tests/setup/db.ts`, `tests/db.test.ts`
- **Work:** `ensureIndexes()` awaits `init()` of the three models; the test
  setup calls it after connecting.
- **Tests:**
  - after `ensureIndexes()`, `users`, `inventory` and `reportJobs` list the
    indexes of `plan §5`.
- **Commit:** `feat(db): create indexes on startup`

#### T11 — DTO mappers

- **Spec:** §3.3, §3.5, §3.7 · **Plan:** §5.5
- **Depends on:** T04, T07, T08, T09
- **Files:** `src/dto/userDto.ts`, `src/dto/inventoryItemDto.ts`,
  `src/dto/reportJobDto.ts`, `tests/dto.test.ts`
- **Tests:**
  - `toUserDto` → exactly `id`, `name`, `email`, `createdAt` (ISO); no
    `passwordHash` even if present in the input;
  - `toInventoryItemDto` → exactly `id` + six business fields;
    `unitPrice` in dollars; no `userId`;
  - `toReportJobDto` → `jobId`, `status`, `createdAt`, `updatedAt` from
    `statusChangedAt`; `reason` only when not null; never `attempts`,
    `lockToken`, `lockedUntil`, `userId`.
- **Commit:** `feat(dto): add response mappers`

### Phase C — HTTP API

#### T12 — App, error handler, not-found

- **Spec:** §4.2, §5.3, §7.10 · **Plan:** §6.1, §6.2
- **Depends on:** T04, T05
- **Files:** `src/app.ts`, `src/routes/index.ts`, `src/middleware/notFound.ts`,
  `src/middleware/errorHandler.ts`, `src/middleware/jsonBody.ts`,
  `tests/errors.test.ts`
- **Work:** pipeline of `plan §6.1`. `jsonBody` is not mounted globally; the
  route tasks add it per route.
- **Tests** (`createApp()` for 404; a test-only app with one
  `jsonBody` route + `errorHandler` for the rest):
  - body that is not valid JSON → `400 INVALID_JSON`;
  - body over 10 kB → `400 PAYLOAD_TOO_LARGE`;
  - thrown `AppError` → its status, code and message;
  - unknown path on `createApp()` → `404 NOT_FOUND`;
  - every error body has exactly `{ error: { code, message } }`;
  - no `x-powered-by` header.
- **Commit:** `feat(api): add app with error and not-found handlers`

#### T13 — Token and dummy hash

- **Spec:** §3.1, §3.2 · **Plan:** §7.1, §7.2
- **Depends on:** T03, T05
- **Files:** `src/services/authService.ts`, `tests/authService.test.ts`
- **Work:** `signToken`, `verifyToken`, `getDummyHash` (memoized).
- **Tests:**
  - `signToken` → payload has only `sub`, `iat`, `exp`; `exp - iat` equals
    the configured lifetime;
  - `verifyToken` of a valid token → the `sub`;
  - expired token → `UnauthorizedError`;
  - wrong signature → `UnauthorizedError`;
  - `alg: none` token → `UnauthorizedError`;
  - `sub` missing or not 24-hex → `UnauthorizedError`;
  - `getDummyHash()` called twice → same promise; result is a bcrypt hash.
- **Commit:** `feat(auth): sign and verify JWT`

#### T14 — Test helpers

- **Plan:** §12.1
- **Depends on:** T10, T13
- **Files:** `tests/helpers.ts`, `tests/helpers.test.ts`
- **Work:** `createUser()` (hashes the password), `createItems(userId, n)`,
  `tokenFor(userId)`.
- **Tests:**
  - `createUser` stores a bcrypt hash, not the plain password;
  - `createItems` creates `n` items owned by the user;
  - `tokenFor` returns a token `verifyToken` accepts.
- **Commit:** `test: add test helpers`

#### T15 — POST /auth/login

- **Spec:** §3.1, §7.1 · **Plan:** §6.3, §7.1
- **Depends on:** T12, T14
- **Files:** `src/services/authService.ts` (`login`),
  `src/controllers/authController.ts`, `src/routes/authRoutes.ts`,
  `src/routes/index.ts`, `tests/helpers.ts` (`loginAs`),
  `tests/auth.login.test.ts`
- **Tests:**
  - valid credentials → `200 { token }` and nothing else;
  - email with other case and spaces → `200`;
  - wrong password → `401 INVALID_CREDENTIALS`, no token;
  - unknown email → `401` with a body identical to wrong password;
  - unknown email still runs `bcrypt.compare` (spy);
  - missing `email`, missing `password`, empty `password`, wrong type,
    invalid email, no body → `400 VALIDATION_ERROR`;
  - body that is not valid JSON → `400 INVALID_JSON`;
  - `GET /auth/login` → `404`;
  - no response contains the password or the hash.
- **Note:** route chain `jsonBody` → handler (`plan §6.1`).
- **Commit:** `feat(auth): add login endpoint`

#### T16 — authenticate middleware

- **Spec:** §3.2 · **Plan:** §7.3
- **Depends on:** T12, T13, T14
- **Files:** `src/middleware/authenticate.ts` (+ `getAuth`),
  `src/services/userService.ts` (`userExists`), `src/types/express.d.ts`,
  `tests/authenticate.test.ts`
- **Tests** (on a test-only Express app with one protected route):
  - valid token → `next()` and `req.auth.userId` is the user;
  - lowercase `bearer` scheme → accepted;
  - no header / `Basic …` / `Bearer` without token → `401 UNAUTHORIZED`;
  - invalid token / expired token / deleted user → same `401` body;
  - `getAuth` without `req.auth` → `UnauthorizedError`.
- **Commit:** `feat(auth): add authenticate middleware`

#### T17 — GET /users/me

- **Spec:** §3.3, §7.3, §7.10 · **Plan:** §6.4
- **Depends on:** T11, T16
- **Files:** `src/services/userService.ts` (`getProfile`),
  `src/controllers/userController.ts`, `src/routes/userRoutes.ts`,
  `src/routes/index.ts`, `tests/users.me.test.ts`, `tests/errors.test.ts`
- **Tests:**
  - `200` with exactly `id`, `name`, `email`, `createdAt` of the caller;
  - another user's id in query, body and header → still the caller;
  - no hash in the response;
  - valid token + body that is not valid JSON → `400 INVALID_JSON`
    (`authenticate` → `jsonBody` → handler, `plan §6.1`);
  - `errors.test.ts`: `getProfile` mocked to throw → `500 INTERNAL_ERROR`,
    generic message, no stack, error logged.
- **Commit:** `feat(users): add GET /users/me`

#### T18 — GET /inventory

- **Spec:** §3.5, §7.5 · **Plan:** §6.5, §7.4
- **Depends on:** T11, T16
- **Files:** `src/services/inventoryService.ts`,
  `src/controllers/inventoryController.ts`, `src/routes/inventoryRoutes.ts`,
  `src/routes/index.ts`, `tests/inventory.test.ts`
- **Tests:**
  - A gets all A's items and none of B's, each with exactly `id` + six
    fields and `unitPrice` in dollars;
  - B's user id or item id in query, body and header → response identical to
    the plain call;
  - `/inventory/<B item id>` → `404`;
  - user without items → `200 []`.
- **Note:** route chain `authenticate` → `jsonBody` → handler.
- **Commit:** `feat(inventory): add GET /inventory`

#### T19 — POST /reports/inventory

- **Spec:** §3.6, §4.4.1, §7.6 · **Plan:** §6.6
- **Depends on:** T16
- **Files:** `src/services/reportService.ts` (`createJob`),
  `src/controllers/reportController.ts`, `src/routes/reportRoutes.ts`,
  `src/routes/index.ts`, `tests/reports.api.test.ts`
- **Tests:**
  - `202` with exactly `success: true`, `message`, `jobId`,
    `status: "pending"`;
  - a `pending` job with `attempts: 0` and the caller's `userId` is stored;
  - a `userId` in the body is ignored (job owned by the caller);
  - three calls → three different `jobId`s;
  - user without items → still `202`;
  - user with many items (e.g. 2 000) → `202` in under 200 ms.
- **Note:** route chain `authenticate` → `jsonBody` → handler.
- **Commit:** `feat(reports): add POST /reports/inventory`

#### T20 — GET /reports/:jobId

- **Spec:** §3.7, §7.7 · **Plan:** §6.7
- **Depends on:** T11, T19
- **Files:** `src/services/reportService.ts` (`getJob`),
  `src/controllers/reportController.ts`, `src/routes/reportRoutes.ts`,
  `tests/reports.api.test.ts`
- **Tests:**
  - owner → `200` with `jobId`, `status`, `createdAt`, `updatedAt`; no
    `attempts`, `lockToken`, `userId`;
  - job with a `reason` → `reason` present; without → absent;
  - another user's job → `404`;
  - unknown valid id → `404`;
  - malformed id → `404`;
  - the three `404` bodies are identical.
- **Commit:** `feat(reports): add GET /reports/:jobId`

#### T21 — Auth on every protected route

- **Spec:** §3.2, §4.1.3, §7.2 · **Plan:** §12.2
- **Depends on:** T15, T17, T18, T20
- **Files:** `tests/auth.middleware.test.ts`
- **Tests** (for each of `GET /users/me`, `GET /inventory`,
  `POST /reports/inventory`, `GET /reports/:jobId`):
  - no header → `401`;
  - non-bearer header → `401`;
  - bad signature, `alg: none`, expired token, deleted user → `401` with the
    same body;
  - no token + body that is not valid JSON → `401`, not `400`.
- **Commit:** `test(auth): cover every protected route`

#### T22 — API entrypoint

- **Plan:** §2.3, §7.1, §8.8
- **Depends on:** T10, T12, T13
- **Files:** `src/server.ts`
- **Work:** load env, `connectDb`, `ensureIndexes`, await `getDummyHash()`,
  listen on `PORT`; on `SIGTERM`/`SIGINT` close the server, disconnect, exit
  `0`.
- **Tests (verification):**
  - `npm run build` produces `dist/src/server.js`;
  - `node dist/src/server.js` without env → exits `1` naming the missing
    variables;
  - full runtime check is done in T34.
- **Commit:** `feat(api): add server entrypoint`

### Phase D — Worker

#### T23 — Email sender

- **Spec:** §3.6.4 · **Plan:** §8.6
- **Depends on:** T04
- **Files:** `src/services/email/EmailSender.ts`,
  `src/services/email/ConsoleEmailSender.ts`, `tests/emailSender.test.ts`
- **Tests:**
  - existing attachment → logs one `email sent` line with `jobId`, `to`,
    `subject`, attachment name and size;
  - missing attachment → rejects and logs nothing.
- **Commit:** `feat(email): add EmailSender and console mock`

#### T24 — Worker errors and temp files

- **Spec:** §4.5.1 · **Plan:** §8.4, §8.7
- **Depends on:** T04
- **Files:** `src/workers/errors.ts`, `src/workers/tempFiles.ts`,
  `tests/tempFiles.test.ts`
- **Work:** `PermanentJobError(reason)`, `LeaseLostError`;
  `wipeReportsDir(dir)` (creates if missing, deletes every entry),
  `removeFileQuietly(path)`.
- **Tests:**
  - `wipeReportsDir` on a missing dir → creates it;
  - on a dir with files → leaves it empty;
  - `removeFileQuietly` on an existing file → removed;
  - on a missing file → does not throw, logs a warning;
  - `PermanentJobError` keeps its public reason.
- **Commit:** `feat(worker): add job errors and temp file helpers`

#### T25 — Spreadsheet writer

- **Spec:** §3.6.1–3, §7.6 · **Plan:** §8.5
- **Depends on:** T08, T10
- **Files:** `src/workers/spreadsheet.ts`, `tests/spreadsheet.test.ts`
- **Tests** (read the file back with exceljs):
  - header row is exactly the 7 columns, in order;
  - one row per item of the user, none of another user;
  - `Unit Price` and `Total Value` in dollars; `Total Value` =
    `Quantity × Unit Price` (e.g. 3 × 19.99 = 59.97);
  - no `_id` or `userId` in any cell;
  - returns the row count; user without items → `0`.
- **Commit:** `feat(worker): stream inventory to xlsx`

#### T26 — Job queue: claim and exhausted jobs

- **Spec:** §3.8.2, §3.8.3, §3.8.6 · **Plan:** §8.2
- **Depends on:** T09, T10
- **Files:** `src/workers/jobQueue.ts`, `tests/worker.queue.test.ts`
- **Tests:**
  - claim takes the oldest `pending` job: `processing`, `attempts + 1`, new
    `lockToken`, `lockedUntil` in the future, `reason` null,
    `statusChangedAt` updated;
  - no eligible job → `null`;
  - N jobs and many concurrent `claimNextJob` calls → each job claimed
    exactly once;
  - `processing` job with expired lease and attempts left → claimed again;
  - `processing` job with a valid lease → not claimed;
  - job with `attempts >= max` → not claimed;
  - `failExhaustedJobs` → expired + exhausted `processing` job becomes
    `failed` with the exhausted reason;
  - `failExhaustedJobs` → `pending` job with `attempts >= max` (max lowered)
    becomes `failed` with the exhausted reason;
  - `failExhaustedJobs` leaves untouched: `pending` with attempts left,
    `processing` with a valid lease, `done`, `failed`.
- **Commit:** `feat(worker): add atomic job claim`

#### T27 — Job queue: lease renewal and finish

- **Spec:** §3.7.5, §3.8.6 · **Plan:** §8.2
- **Depends on:** T26
- **Files:** `src/workers/jobQueue.ts`, `tests/worker.queue.test.ts`
- **Tests:**
  - `renewLease` with the right token → `true`, `lockedUntil` moved;
  - with a stale token → `false`, nothing changed;
  - `finishJob` `done` / `retry` / `failed` → right status, `reason`,
    `lockToken` and `lockedUntil` null, `statusChangedAt` updated;
  - stale `lockToken` → no change;
  - a `done` or `failed` job never changes (finish and renew do not match).
- **Commit:** `feat(worker): add lease renewal and job finish`

#### T28 — Process one report

- **Spec:** §3.6, §3.8.5, §4.5.1, §7.6, §7.8 · **Plan:** §8.4, §8.6
- **Depends on:** T07, T23, T24, T25
- **Files:** `src/workers/processReportJob.ts`,
  `tests/worker.process.test.ts`
- **Tests** (fake `EmailSender`, temp `reportsDir`):
  - success → one email with the job's `jobId`, to the owner, subject
    `Your inventory report`,
    body with name, UTC time and item count, attachment name matches
    `inventory-report-\d{8}-\d{6}Z\.xlsx`; returns `{ itemCount }`;
  - the file is deleted after success;
  - email fails → error thrown and the file is still deleted;
  - empty inventory → no email, `itemCount: 0`, file deleted, no warning
    logged;
  - missing user → `PermanentJobError`;
  - `isLeaseLost()` true → `LeaseLostError`, no email.
- **Commit:** `feat(worker): process a report job`

#### T29 — Run one attempt

- **Spec:** §3.7.3, §3.8.2–5, §3.8.8, §7.8 · **Plan:** §8.1, §8.4
- **Depends on:** T27, T28
- **Files:** `src/workers/runJob.ts`, `tests/worker.process.test.ts`
- **Tests:**
  - success with items → `done`, no reason;
  - empty inventory → `done` with `No inventory data to report.`;
  - missing user → `failed` after one attempt with the user reason;
  - email fails once → `pending`, then next claim → `done`;
  - email always fails → `failed` with the exhausted reason after
    `REPORT_MAX_ATTEMPTS`;
  - lease lost → no write, no email;
  - heartbeat renews the lease while the job runs (fake timers);
  - `runJob` never throws; failures are logged with `jobId`.
- **Commit:** `feat(worker): run a job attempt with heartbeat`

#### T30 — Worker entrypoint

- **Spec:** §3.8.1, §3.8.7, §4.4.2 · **Plan:** §8.3, §8.7, §8.8
- **Depends on:** T06, T29
- **Files:** `src/workers/reportWorker.ts`
- **Work:** env, connect, `ensureIndexes`, `wipeReportsDir`, loop of
  `plan §8.3`, graceful `SIGTERM`/`SIGINT`.
- **Tests (verification):**
  - `npm run build` produces `dist/src/workers/reportWorker.js`;
  - without env → exits `1` naming the missing variables;
  - full runtime check is done in T34/T36.
- **Commit:** `feat(worker): add worker loop entrypoint`

### Phase E — Seed

#### T31 — Seed data and runSeed

- **Spec:** §3.4, §7.4 · **Plan:** §9
- **Depends on:** T07, T08, T10
- **Files:** `src/seed/seedData.ts`, `src/seed/runSeed.ts`,
  `tests/seed.test.ts`
- **Tests:**
  - after `runSeed()`: Alice with 10 items, Bob with 8, Carol with 0;
  - every item has the six fields; one SKU shared by Alice and Bob;
  - stored passwords are bcrypt hashes and match the documented passwords;
  - second run → same user ids, same item counts, no duplicates;
  - existing report jobs are unchanged after a second run;
  - a user not in the seed is not touched.
- **Commit:** `feat(seed): add seed data and idempotent loader`

#### T32 — Seed entrypoint

- **Spec:** §3.4 · **Plan:** §9
- **Depends on:** T06, T31
- **Files:** `scripts/seed.ts`
- **Tests (verification):**
  - `npm run build` produces `dist/scripts/seed.js`;
  - without env → exits `1`;
  - run inside Compose in T34.
- **Commit:** `feat(seed): add seed script`

### Phase F — Delivery

#### T33 — Dockerfile

- **Spec:** §5.1 · **Plan:** §10.1, §10.4
- **Depends on:** T22, T30, T32
- **Files:** `Dockerfile`, `.dockerignore`, `.gitignore` (add `*.xlsx` if
  missing)
- **Tests (verification):**
  - `docker build -t inventory-app:local .` succeeds, and the build log shows
    no `mongod` download (`MONGOMS_DISABLE_POSTINSTALL=1`);
  - the image contains `dist/` and no `src/`, `tests/`, `.env`;
  - `docker run --rm inventory-app:local` without env → exits `1` naming the
    missing variables.
- **Commit:** `build: add Dockerfile`

#### T34 — Compose

- **Spec:** §5.1, §5.2 · **Plan:** §2.1, §10.2
- **Depends on:** T33
- **Files:** `compose.yaml`, `compose.dev.yaml`, `.env.example`
- **Tests (verification):**
  - `cp .env.example .env && docker compose up --build -d` → three services
    up, `mongo` healthy, only port `3000` published;
  - `docker compose exec api npm run seed` succeeds;
  - `curl` login with a seed user → `200 { token }`;
  - `POST /reports/inventory` → `202`; `docker compose logs worker` shows
    `email sent`; `GET /reports/:jobId` → `done`.
- **Commit:** `build: add Docker Compose setup`

#### T35 — README

- **Spec:** §3.9, §7.9, §8 · **Plan:** §10.5, §14
- **Depends on:** T34
- **Files:** `README.md`
- **Tests (verification):**
  - following only the README from a clean clone: start, seed, sign in with
    each documented credential, call every endpoint with the `curl`
    examples, see a report emailed;
  - README has: credentials, endpoints, how reports work (states, retries,
    lease, cleanup), configuration table, tests, decisions summary,
    currency, known limits, production notes.
- **Commit:** `docs(readme): add README`

#### T36 — Final verification

- **Spec:** §7 · **Plan:** §12.3
- **Depends on:** T35
- **Files:** none expected (fixes, if any, as separate commits)
- **Tests (verification):** the four manual checks of `plan §12.3`:
  1. clean `docker compose up --build`, seed, login, every endpoint;
  2. report → `email sent` in worker logs, `/tmp/reports` empty;
  3. worker stopped → job stays `pending`; worker started → `done`;
  4. `--scale worker=3`, several reports → exactly one `email sent` per job.
  Plus `npm run typecheck && npm run lint && npm run test` on `main`.
- **Output:** a proposed diff for the "Commands" section of CLAUDE.md, for
  the user to approve (not applied directly).

## 5. Traceability (spec §7 → tasks)

| Acceptance criteria | Tasks |
|---|---|
| §7.1 Sign in | T13, T15 |
| §7.2 Authenticated requests | T13, T16, T21 |
| §7.3 Read own profile | T11, T17 |
| §7.4 Initial data | T07, T31, T32, T34 |
| §7.5 Read own inventory | T11, T18 |
| §7.6 Request a report | T19, T23, T25, T28, T34 |
| §7.7 Check a report request | T20, T27, T29 |
| §7.8 Background production | T26, T27, T29, T30, T36 |
| §7.9 Documentation | T35 |
| §7.10 Cross-cutting | T03, T12, T17, T22 |
