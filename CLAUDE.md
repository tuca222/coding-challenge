# CLAUDE.md

Backend coding challenge: a small REST API with Node.js, Express, MongoDB and
Docker Compose, written in TypeScript. Users log in (JWT), read their own
profile and inventory, and request an inventory report (.xlsx) that is
generated asynchronously by a separate worker and "emailed" by a mock.

## Project documents (Spec-Driven Development)

Flow: `context.md` → `spec.md` → `plan.md` → `tasks.md` → code.
Each document has **one role**. Never mix them.

| File | Answers | Contains | Must NOT contain |
|---|---|---|---|
| `docs/context.md` | Why? | The challenge, scope, constraints | Solution design |
| `docs/spec.md` | **WHAT** must be done | Observable behavior, business rules, acceptance criteria | Libraries, data model, collections, internal architecture, code structure |
| `docs/decisions.md` | Why this technical choice? | ADRs with trade-offs (input for the plan) | Requirements |
| `docs/plan.md` | **HOW** it will be done | Architecture, data model, API contracts, job processing, Docker, project structure | New requirements |
| `docs/tasks.md` | In what order? | Small tasks linked to spec and plan sections | Design changes |

Where a statement belongs: if it would change when a technology or the
internal architecture changes, it belongs in `plan.md`, not in `spec.md`.

Editing rules:
- Edit a document **only in its phase**, and only when I ask for that phase.
- While writing the spec, do not read or apply `decisions.md`.
- While writing the plan, if you find a missing or unclear requirement,
  **stop and propose a change to `spec.md`**. Do not add requirements to
  the plan.
- While implementing, **do not edit `spec.md`, `plan.md` or
  `decisions.md`**. If code cannot follow them, stop and tell me.
- New technical decisions go to `decisions.md` (ADR format) and are then
  reflected in `plan.md`.
- Once approved, `spec.md` and `plan.md` are the source of truth. If code,
  spec and plan disagree, stop and ask.

## How to work with me

- **Keep it simple.** This is a small backend. Do what the spec requires,
  in the most direct way, and stop there. No extra layers, options,
  validations, configuration or "future-proofing" the spec does not ask
  for. When unsure between two solutions, pick the simpler one.
- Prefer simple, explicit code over clever abstractions or patterns
  I did not ask for.
- Be objective in replies and documents: short explanations, plain words,
  and only the decisions I really need to make.
- Talk to me in **Portuguese (pt-BR)**. Write code, identifiers, comments,
  commit messages, README and API error messages in **English**.
- For any non-trivial task: **plan first, wait for my approval, then code**.
- Work in **small, reviewable steps**: one task at a time. After each task,
  summarize what changed, why, and how to verify it.
- When you make a non-obvious choice, explain the reason in your reply.
  Keep code comments short: explain *why*, not *what*.
- **Do not add dependencies without asking.** For each one, say why it is
  needed and what the alternative is.
- If something is ambiguous or missing in the spec, **ask; do not guess**.
- If a task requires a new architectural decision, propose a new entry for
  `docs/decisions.md` before implementing it.

## Implementing a task (`docs/tasks.md`)

For every task `Txx`, in this order:

1. **Implement** the task, following its spec and plan sections.
2. **Write the tests** listed in the task's **Tests** field (unit tests when
   the task has them; the verification commands otherwise).
3. **Review** the code and the tests: does the code follow spec, plan and the
   rules of this file, and do the tests cover every scenario of the task?
4. **Fix** any evident problem found in step 3. If the fix would change
   spec, plan or decisions, stop and ask instead.
5. **Commit**: at least one `feat(Txx)` commit for the implementation, and
   one `test(Txx)` commit for the tests when the task has unit tests.
   Run `npm run typecheck`, `lint` and `test` before each commit.

Then summarize what changed, why, and how to verify it (see above).

## Commit messages

Conventional commits, in English, short imperative message:

| Change | Format | Example |
|---|---|---|
| Project document (`docs/*`, `CLAUDE.md`, `README.md`) | `docs(<file>): ...` | `docs(plan): add seed passwords` |
| Task implementation (code, config, Docker) | `feat(Txx): ...` | `feat(T03): load and validate env vars` |
| Tests of a task | `test(Txx): ...` | `test(T03): cover missing and invalid config` |

One commit per document when several documents change.

## Stack

- Node.js 24 LTS (`node:24-slim`) + TypeScript (`strict: true`), ES modules
  (`"type": "module"`, NodeNext; relative imports end in `.js`)
- Express 5
- bcrypt (native package, async API) for password hashing
- MongoDB 8 (`mongo:8`) with Mongoose
- zod for request and config validation
- exceljs (streaming writer) for the `.xlsx` report
- Vitest + supertest + mongodb-memory-server for tests
- Docker + Docker Compose

Rationale for each choice: `docs/decisions.md`. Details: `docs/plan.md`.

## Architecture (summary)

Three containers on one Compose network:

- `api`: Express app. Port 3000 is published to the host. Handles HTTP only.
- `worker`: report worker. **Same image as `api`, different command.**
  No published ports.
- `mongo`: database. **No published port.** It is reachable only through the
  internal network at `mongodb://mongo:27017`.

**The API and the worker never call each other.** They communicate only
through the `reportJobs` collection:

1. `POST /reports/inventory` inserts a job with `status: "pending"` and
   returns `202` with a `jobId` immediately. `GET /reports/:jobId` returns
   the job status (owner-filtered; another user's job, an unknown id and a
   malformed id all return the same `404`).
2. The worker polls and claims jobs **atomically**, generates the `.xlsx`
   file in `/tmp/reports`, calls the email mock, deletes the file, and marks
   the job `done`, back to `pending` (retry) or `failed`. While processing it
   renews its lease (heartbeat).

The email provider is an external service. In this challenge it is a mock
behind an `EmailSender` interface (`ConsoleEmailSender` logs to stdout).

## Target project structure

```
src/
  app.ts                 # builds the Express app (no listen); used by tests
  server.ts              # API entrypoint: load config, connect DB, listen
  config/env.ts          # reads and validates env vars; fails fast
  db/                    # connection helpers
  models/                # data models and indexes
  routes/                # route definitions only
  controllers/           # HTTP layer: parse input, call service, send response
  services/              # business logic (auth, inventory, reports, email)
  middleware/            # auth, error handler, not-found
  errors/                # AppError and subclasses
  dto/                   # response mappers (no document is sent directly)
  seed/                  # seed data and runSeed()
  utils/                 # money (cents → dollars), logger
  types/                 # Express request augmentation (req.auth)
  workers/               # reportWorker.ts (entrypoint), queue, job processing
scripts/seed.ts          # seed entrypoint
tests/
docs/
```

File-by-file structure: `docs/plan.md` §3.

## Commands (target; keep this section updated as scripts are created)

```sh
cp .env.example .env                            # first time only
docker compose up --build                       # run everything
docker compose exec api npm run seed            # seed users + inventory
docker compose up --scale worker=3              # scale the worker
docker compose down -v                          # stop and delete volumes
docker compose -f compose.yaml -f compose.dev.yaml up  # also publish Mongo port (dev only)
npm run build | start | start:worker | seed
npm run typecheck | lint | test
```

The production image contains only compiled code (`dist/`), so every script
that runs inside a container (including the seed) must be compiled and run
with `node`, not with a TS runner.

Compiled entrypoints: `dist/src/server.js` (api),
`dist/src/workers/reportWorker.js` (worker), `dist/scripts/seed.js` (seed).

## Non-negotiable rules

IMPORTANT: these come from the challenge's security requirements. Never break them.

- **Ownership comes only from the verified token.** The user id used to
  filter data comes from `req.auth` (set by the auth middleware). Never read
  it from query, body, params or headers. Apply the owner filter **inside the
  database query**, never after loading data.
- **Passwords:** store only a bcrypt hash (cost from config, async API).
  Never log or return password hashes. Responses go through explicit DTOs or
  projections. There is no sign-up endpoint; users come only from the seed.
- **JWT:** verify signature and expiration, pin the algorithm on verify, and
  put only non-sensitive claims in the payload (`sub`, `iat`, `exp`).
- **Login errors:** return the same `401` message for "unknown email" and
  "wrong password". For an unknown email, still run `bcrypt.compare` against
  a dummy hash, so response time does not reveal which emails exist.
- **Secrets and config:** only from environment variables, read in
  `src/config/env.ts`. No `process.env` anywhere else. Never commit `.env`;
  keep `.env.example` with fake values.
- **Errors:** a central error middleware returns JSON
  `{ "error": { "code": string, "message": string } }`. Never return stack
  traces or internal details. Unknown errors become `500` with a generic
  message and are logged on the server.
- **Job claim must be atomic:** claim with a single `findOneAndUpdate`.
  Never use `findOne` followed by `update`. Every write that renews or
  finishes a job filters by `_id`, `status: "processing"` and the job's
  `lockToken`.
- **No CPU-heavy work in the API process.** Report generation runs only in
  the worker.
- **Inside containers, use service names (`mongo`), never `localhost`**,
  to reach other services.

## Code conventions

- TypeScript strict. No `any`; use `unknown` + narrowing. Explicit return
  types on exported functions.
- `async/await` only; no unhandled promises. The worker loop must catch and
  log errors per job and keep running.
- Layers: routes → controllers → services → models. Controllers do not touch
  models directly. Services do not know about `req`/`res`.
- Throw typed errors (`AppError` subclasses with HTTP status) from services;
  translate them only in the error middleware.
- Validate request input at the boundary (controller/middleware) and return
  `400` with a clear message.
- Logs: short and useful. The worker always logs the `jobId`.
- Money: store and compute in integer US cents; convert to dollars (two
  decimals) only in DTOs and in the report.
- Responses are built by mappers in `src/dto/`; never send a Mongoose
  document.

## Testing priorities

Test these first, with Vitest + supertest against `createApp()` and
mongodb-memory-server:

1. Login success and failure.
2. Protected endpoints reject missing or invalid tokens.
3. Inventory isolation: User A never sees User B's items, even with
   manipulated query, body or params.
4. `POST /reports/inventory` returns `202` immediately and creates a pending
   job; `GET /reports/:jobId` returns `404` for another user's job.
5. Worker: atomic claim, retry, and failure after max attempts.

## Definition of done (per task)

- `npm run typecheck`, `lint` and `test` pass.
- `docker compose up --build` works from a clean clone, following the README.
- README updated if endpoints, commands or env vars changed.
- No secrets, no `node_modules`, no generated reports committed.

## README

Audience: reviewers. It shows how to run and use the system and gives a short
overview of the design. Required content: `docs/spec.md` §3.9.

- Sections: quick start, test credentials, endpoints (curl + example
  responses), how reports work, configuration, tests, design notes,
  assumptions, known limits, production notes, links to `docs/`.
- Summarize and link to `docs/plan.md` / `docs/decisions.md`; do not copy
  their details.
- Keep it in sync with the code (see Definition of done).
