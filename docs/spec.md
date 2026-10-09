# Specification

> Source of truth for **what** the system must do. Derived only from
> `docs/context.md`. It describes observable behavior at the API boundary,
> business rules and acceptance criteria. It does not describe how the system
> is built; that belongs to `docs/plan.md`. A bare `§x` refers to this
> specification.

## 1. Overview

### 1.1 Problem

A company gives each of its users a personal inventory of items. Users need a
way to sign in, read their own data, and receive a spreadsheet of their
inventory by email. Building the spreadsheet takes time and grows with the
number of items, so a user must not have to wait for it while the request is
open, and a failure while building it must not be silent.

The data is private per user: one user's inventory must never be reachable by
another user, no matter what the client sends.

### 1.2 Goal

Provide an HTTP API where an authenticated user can:

- sign in with email and password and receive an access token;
- read their own profile;
- read their own inventory;
- request an inventory report and get an immediate confirmation, while the
  report is produced in the background and emailed to them;
- check the state of a report request they made.

### 1.3 Scope of this document

This specification defines, for each requirement: the observable behavior, the
business rules, and the acceptance criteria. Response status codes and
guarantees visible to the client are part of the specification. Internal
structure, data modeling and tooling are not.

## 2. Actors

| Actor | Description |
|---|---|
| **User** | A person with credentials and a personal inventory, acting through an HTTP client. The only actor that calls the API. |
| **Operator** | A person who starts the system and loads the initial data. Does not use the API. |
| **Email provider** | An external service that accepts a message with an attachment and delivers it to the user. In this challenge it is simulated: messages are recorded instead of delivered. |

There are no roles, permissions or administrative users. Every authenticated
user has exactly the same capabilities over their own data and no access to
anybody else's.

## 3. Functional requirements

Requirement ids match `docs/context.md` §4.

### 3.1 FR01 — Sign in

`POST /auth/login`

A user sends an email and a password and receives an access token that proves
their identity to the rest of the API.

**Behavior**

- Given a request with a well-formed body and credentials that match an
  existing user, the API returns `200` with an access token.
- Given a request whose body is not well formed — a missing `email`, a missing
  or empty `password`, a value of the wrong type, or an `email` that is not a
  valid email address — the API returns `400` and no token.
- Given a well-formed request whose credentials do not match an existing user,
  the API returns `401` and no token.
- The email is matched ignoring letter case and leading or trailing spaces:
  `Alice@Example.com ` signs in the user `alice@example.com`. The password is
  matched exactly.

**Business rules**

1. The response to a failed sign-in is identical whether the email is unknown
   or the password is wrong: same status, same message, no field that
   distinguishes the two cases.
2. The time the API takes to answer a failed sign-in does not reveal whether
   the email exists.
3. The token is valid for a limited period, one hour by default, and the
   period is configurable per environment.
4. The token carries no sensitive data.
5. The response never contains the stored password in any form.
6. There is no endpoint to create, change or recover a password. Users exist
   only through the initial data of §3.4.

### 3.2 FR02 — Authenticated requests

Every endpoint in §3.3, §3.5, §3.6 and §3.7 is protected.

**Behavior**

- Given a request carrying a valid, unexpired token for an existing user, the
  request proceeds and the API treats that user as the caller.
- Given a request with no token, a token that is not presented as a bearer
  token, a token the API does not accept as genuine, an expired token, or a
  token that identifies a user who no longer exists, the API returns `401` and
  does not perform the requested action.

**Business rules**

1. All authentication failures produce the same `401` response with the same
   generic message. The response never says which of the failure cases
   happened.
2. The identity of the caller comes only from the verified token. Any user
   identifier present in the query string, body, path or other headers is
   ignored for authorization purposes and never widens what the caller can
   reach.
3. Authentication is checked before the request body. An unauthenticated
   request receives `401` even if its body is not valid JSON or is too large.

### 3.3 FR03 — Read own profile

`GET /users/me`

**Behavior**

- Given an authenticated request, the API returns `200` with the profile of the
  caller: identifier, name, email and the date the user was created.

**Business rules**

1. The response contains exactly those four fields. Any other field of the
   user, now or in the future, is only exposed if this specification says so.
2. The response never contains the password or any form of it.
3. The endpoint always returns the caller's own profile. There is no way to ask
   for another user's profile.

### 3.4 FR04, FR09 — Initial data

The system ships with data an Operator can load before using the API.

**Behavior**

- Given a system that holds no users and no inventory, the Operator runs one
  documented action and afterwards users can sign in and read a non-empty
  inventory.

**Business rules**

1. The initial data contains at least two users who each own inventory items,
   and one user who owns no items.
2. Each inventory item has exactly these business fields:

   | Field | Meaning | Rule |
   |---|---|---|
   | `name` | Item name | Non-empty text |
   | `sku` | Stock keeping unit code | Non-empty text, unique among the items of the same user |
   | `category` | Item category | Non-empty text |
   | `location` | Where the item is stored | Non-empty text |
   | `quantity` | Units in stock | Integer, zero or more |
   | `unitPrice` | Price of one unit | Number, zero or more, two decimal places, in US dollars (USD) |

3. Each inventory item belongs to exactly one user.
4. The credentials of every initial user, including the one without items, are
   documented for reviewers, and the stored passwords are not readable from the
   stored data.
5. Loading the initial data again leaves the initial users and their items
   exactly in the documented state, without duplicates, and does not affect
   existing report requests.

### 3.5 FR05 — Read own inventory

`GET /inventory`

**Behavior**

- Given an authenticated request, the API returns `200` with the items that
  belong to the caller.
- Given an authenticated caller who owns no items, the API returns `200` with
  an empty list.

**Business rules**

1. The response contains every item owned by the caller and no item owned by
   anybody else.
2. The result is identical whether or not the request carries extra query
   parameters, body fields, path segments or headers that name a user or an
   item. Such input cannot add another user's items to the response, remove the
   caller's own items, or cause an error that reveals whether another user's
   items exist.
3. Each returned item exposes exactly its own identifier and the six business
   fields of §3.4. It does not expose its owner or any data belonging to other
   users.
4. This specification does not define the order of the items, and clients must
   not rely on it.

### 3.6 FR06 — Request an inventory report

`POST /reports/inventory`

A user asks for a spreadsheet of their inventory. The API confirms the request
immediately and the report is produced afterwards, outside the request.

**Behavior**

- Given an authenticated request, the API returns `202` with a success flag, an
  identifier for the request (`jobId`), the initial state of the request, and a confirmation
  message. The response does not wait for the report to be produced.
- After the response, and independently of it, the system reads the inventory
  of the user who made the request, produces a spreadsheet of those items, and
  sends it to that user's email address as an attachment.
- Given a caller who owns no items, the request is still accepted with `202`.
  The request later reaches the successful state, no email is sent, and the
  recorded reason states that there was no inventory data to report.

**Business rules**

1. The report contains only items owned by the user who made the request.
2. The report has one header row followed by one row per item. The columns are,
   in this order: `Name`, `SKU`, `Category`, `Location`, `Quantity`,
   `Unit Price`, `Total Value`. `Total Value` is `quantity × unitPrice`.
   `Unit Price` and `Total Value` are amounts in US dollars with two decimal
   places. The report does not contain internal identifiers or the owner of
   the items.
3. The inventory used is the inventory as it stands when the report is
   produced, not when it was requested.
4. The email:
   - is addressed to the requesting user's own email address;
   - has the subject `Your inventory report`;
   - has a body that greets the user by name and states when the report was
     produced (UTC) and how many items it contains;
   - carries the spreadsheet as an attachment named
     `inventory-report-<YYYYMMDD-HHmmss>Z.xlsx`, where the timestamp is the
     UTC moment the report was produced.
5. Each call creates a new, independent request. A user may have several
   requests outstanding at the same time, and an earlier request is never
   replaced or cancelled by a later one.
6. Without interruptions, a successful report is emailed exactly once per
   request. If the system is interrupted after the email is sent but before
   the request is recorded as finished, the same report may be emailed again
   (see §8). An accepted report is never lost silently: it is either emailed or
   the request ends `failed`.
7. The produced file is temporary: it is not kept indefinitely, and no endpoint
   of the API serves it or discloses its location.

### 3.7 FR07 — Check a report request

`GET /reports/:jobId`

**Behavior**

- Given an authenticated request for an identifier that belongs to a request
  the caller made, the API returns `200` with: the identifier, the current
  state, when the request was created, when its state last changed, and a
  human-readable reason when there is one.
- Given an identifier that does not exist, belongs to another user, or is not a
  well-formed identifier, the API returns `404`.

**Business rules**

1. The possible states are exactly:
   - `pending` — accepted, not started;
   - `processing` — being produced;
   - `done` — finished successfully;
   - `failed` — finished unsuccessfully and will not be retried.
2. The `404` response is identical in all three failure cases, so a caller
   cannot tell an unknown identifier from one belonging to another user.
3. A reason is present only when the request finished successfully without
   data to report, and when it failed. While an attempt is being retried, the
   request reads as `pending` or `processing` with no reason. The reason is
   readable by a user and does not expose internal details of the system.
4. The response does not expose how many times the system tried to produce the
   report.
5. A request may move between `pending` and `processing` while it is being
   retried. Once `done` or `failed`, it never changes again.

### 3.8 FR08 — Background production of reports

This requirement states the guarantees a user can rely on once a report request
has been accepted. It says nothing about the mechanism that provides them.

**Business rules**

1. Producing a report never happens inside the HTTP request that asked for it,
   and never delays unrelated requests to the API.
2. Every accepted request eventually reaches `done` or `failed`. No request
   stays in `pending` or `processing` forever.
3. A request interrupted while being produced — for example because the system
   restarted — becomes eligible to be produced again within a limited,
   configurable period (two minutes by default) and still reaches a finished
   state.
4. A failure that may be temporary, including a failure to send the email, is
   retried. The number of attempts is limited and configurable. When the limit
   is reached, the request becomes `failed` with a reason.
5. A failure that cannot be fixed by retrying is not retried: if the user who
   made the request no longer exists when the report is produced, the request
   becomes `failed` with a reason.
6. A report request is produced by one producer at a time, however the system
   is scaled. The email guarantee of §3.6 rule 6 holds with any number of
   producers.
7. A failure of one request does not stop other requests from being produced.
8. A failure to produce a report is recorded on the server with enough
   information to investigate it, including the identifier of the request.

### 3.9 FR10 — Documentation for users of the project

A reviewer starting from a clean copy of the project must be able, using only
the project's README, to: start the system; load the initial data; sign in with
documented credentials; call every endpoint of this specification with example
requests; understand how reports are produced and what happens when they fail;
and read the assumptions and known limits of the solution.

The README also explains the review topics of `docs/context.md` §10, briefly
or by linking to the project document that covers each one.

## 4. Non-functional requirements

Each requirement below is stated so that it can be checked.

### 4.1 Security

1. Stored passwords are not readable: the stored data does not allow recovering
   a password, and no response, log or report ever contains a password or its
   stored form.
2. No response of any endpoint contains fields that this specification does not
   list for that endpoint.
3. Every endpoint except sign-in rejects unauthenticated requests with `401`.
4. For every endpoint that returns user data, a request authenticated as user A
   returns only data owned by A, for every combination of query, body, path and
   header values a client can send.
5. Credentials and other configuration values are not part of the project's
   source; they are supplied to each environment separately, and the project
   contains only example values that are not real.

### 4.2 Errors

1. Every error response has the same shape: a JSON body with an error code and
   a human-readable message.
2. Status codes are used consistently: `400` for a request the client got
   wrong, `401` for a request that is not authenticated, `404` for a resource
   the caller cannot see or that does not exist, `500` for an unexpected
   failure.
3. An unexpected failure returns `500` with a generic message. No response
   contains a stack trace, an internal error text, a database detail, a file
   path or a configuration value.
4. Every unexpected failure is recorded on the server.

### 4.3 Configuration

1. The values that change between environments — at least where the data is
   stored, the secret used to issue tokens, the port the API listens on, the
   token lifetime, the maximum number of report attempts and the period after
   which an interrupted report request becomes eligible again — are supplied
   by the environment.
2. The system refuses to start when a required configuration value is missing,
   and says which one.

### 4.4 Performance

1. `POST /reports/inventory` answers in under 200 ms under normal conditions,
   and its response time does not grow with the size of the caller's
   inventory.
2. Under normal conditions, an accepted report request leaves `pending` within
   5 seconds. With the default configuration and no failures, a request for
   any user of the initial data reaches `done` within 30 seconds. For larger
   inventories the time to finish grows with the size of the inventory.
3. The API keeps answering requests while reports are being produced.

### 4.5 Data lifetime

1. A produced report file is removed as soon as its email is sent, and when its
   request becomes `failed`. A file left behind for any other reason — for
   example an interruption — is removed later, when the system recovers from
   it. Usually this takes minutes, but no maximum delay is guaranteed (see §8).
2. Report requests are kept across restarts of the system and remain readable
   through §3.7 indefinitely (see §8).

## 5. Constraints

Imposed by the challenge, not chosen by this specification.

1. The service is written for Node.js with Express, stores its data in
   MongoDB, and runs through Docker Compose, with the database as a service
   separate from the application. One command starts everything.
2. The application reaches the database over the Compose network, not a
   database installed on the host.
3. The endpoints and status codes are exactly:
   - `POST /auth/login` → `200`, `400`, `401`
   - `GET /users/me` → `200`, `401`
   - `GET /inventory` → `200`, `401`
   - `POST /reports/inventory` → `202`, `401`
   - `GET /reports/:jobId` → `200`, `401`, `404`

   Any unexpected failure on any endpoint → `500`. A request whose body is not
   valid JSON or is too large → `400` (on protected endpoints, only after
   authentication succeeds; see §3.2). Any other path or method → `404`. All
   of these use the error shape of §4.2.
4. Protected endpoints take the token as a bearer token in the `Authorization`
   header.
5. A successful sign-in returns the body `{ "token": "<token>" }`.
6. The report is a spreadsheet in `.xlsx` format.
7. Email is not actually delivered; sending is simulated.
8. No external queue or message broker is used.

## 6. Out of scope

- Real email delivery.
- User sign-up, password change and password recovery.
- Refresh tokens, sign-out and token revocation.
- Roles, permissions and administrative access.
- Creating, changing or deleting inventory items through the API.
- Downloading a produced report through the API.
- Cancelling or deleting a report request.
- Listing a user's report requests; only lookup by identifier is specified.
- Running several instances of the API behind a load balancer.
- Pagination, filtering, searching and sorting of the inventory, and any
  guarantee about the order of items.
- Rate limiting and quotas on report requests.
- Retention and removal of old report requests.

## 7. Acceptance criteria

### 7.1 FR01 — Sign in

- **Given** a user from the initial data, **when** a client posts that user's
  email and password to `/auth/login`, **then** the response is `200` and its
  body is `{ "token": "<token>" }`.
- **Given** a user from the initial data, **when** a client posts that email
  in different letter case and with surrounding spaces, plus the correct
  password, **then** the response is `200` with a token.
- **Given** a user from the initial data, **when** a client posts that email
  with a wrong password, **then** the response is `401` and contains no token.
- **Given** an email that belongs to no user, **when** a client posts it with
  any password, **then** the response is `401` and is byte-for-byte the same as
  the wrong-password response, except for values that do not identify the
  failure cause.
- **Given** a request body without `password`, or with an empty `password`,
  or without `email`, or with a value of the wrong type, or with an `email`
  that is not a valid email address, **when** it is posted to `/auth/login`,
  **then** the response is `400`.
- **Given** any sign-in response, **when** its body is inspected, **then** it
  contains no password and no stored form of a password.

### 7.2 FR02 — Authenticated requests

- **Given** no `Authorization` header, **when** a client calls any protected
  endpoint, **then** the response is `401`.
- **Given** an `Authorization` header that does not present a bearer token,
  **when** a client calls any protected endpoint, **then** the response is
  `401`.
- **Given** a token the API does not accept as genuine, a token that has
  expired, or a token naming a user who does not exist, **when** a client calls
  any protected endpoint, **then** the response is `401` and its body is the
  same in all three cases.
- **Given** a token issued with the configured lifetime, **when** that lifetime
  has passed and the token is used, **then** the response is `401`.
- **Given** no valid token and a body that is not valid JSON, **when** a
  client calls any protected endpoint, **then** the response is `401`, not
  `400`.

### 7.3 FR03 — Read own profile

- **Given** a valid token for user A, **when** a client calls `/users/me`,
  **then** the response is `200` and describes A, with exactly the identifier,
  name, email and creation date.
- **Given** a valid token for user A, **when** the client also sends another
  user's identifier in the query string, body or headers, **then** the response
  still describes A.

### 7.4 FR04, FR09 — Initial data

- **Given** a system that holds no users and no inventory, **when** the Operator
  performs the documented load action, **then** at least two users exist who
  each own inventory items, one user exists who owns none, and each item has
  exactly the six business fields of §3.4.
- **Given** the loaded data, **when** a client signs in with each documented
  credential pair, **then** each sign-in succeeds.
- **Given** the loaded data, **when** the Operator performs the load action a
  second time, **then** the initial users and their items match the documented
  state, with no duplicates, and existing report requests are unchanged.
- **Given** the loaded data, **when** the stored user data is inspected outside
  the API, **then** no readable password is present. This is the one criterion
  that cannot be checked at the API boundary.

### 7.5 FR05 — Read own inventory

- **Given** users A and B each owning items, **when** a client with A's token
  calls `/inventory`, **then** the response is `200`, contains every item of A
  and no item of B, and each item has exactly its identifier and the six
  business fields.
- **Given** A's token, **when** the client calls `/inventory` adding B's user
  identifier or an item identifier of B's in the query string, the body, a path
  segment or a header, **then** the response is identical to the plain call and
  reveals nothing about B.
- **Given** a user who owns no items, **when** a client with that user's token
  calls `/inventory`, **then** the response is `200` with an empty list.

### 7.6 FR06 — Request an inventory report

- **Given** a valid token, **when** a client posts to `/reports/inventory`,
  **then** the response is `202` within 200 ms and contains a request
  identifier.
- **Given** that accepted request, **when** the system has finished producing
  the report, **then** a simulated email is recorded addressed to that user,
  with the subject `Your inventory report` and an attachment named
  `inventory-report-<YYYYMMDD-HHmmss>Z.xlsx`; the spreadsheet has the header
  row of §3.6 rule 2 and one row per item of that user, with no item of
  another user and no internal identifier, and each `Total Value` equals
  `Quantity × Unit Price`.
- **Given** a report whose email was sent, **when** the report folder is
  inspected afterwards, **then** the file is no longer there.
- **Given** a user who owns no items, **when** that user posts to
  `/reports/inventory`, **then** the response is `202`, the request later reads
  as `done` with a reason stating there was no inventory data, and no email is
  recorded for it.
- **Given** a valid token, **when** a client posts to `/reports/inventory`
  three times, **then** three different identifiers are returned and each one
  can be looked up separately.
- **Given** a finished report, **when** the API is inspected for a way to
  download the file, **then** no endpoint serves it or discloses its location.

### 7.7 FR07 — Check a report request

- **Given** a request made by user A, **when** A looks it up, **then** the
  response is `200` and contains its identifier, a state among `pending`,
  `processing`, `done` and `failed`, its creation time and its last change
  time.
- **Given** a request made by user A, **when** user B looks it up with B's
  token, **then** the response is `404`.
- **Given** an identifier that exists for nobody, and an identifier that is not
  well formed, **when** either is looked up, **then** the response is `404`
  with the same body as the other-user case.
- **Given** an accepted request, **when** it is looked up repeatedly, **then**
  its state reaches `done` or `failed` and does not change afterwards.
- **Given** an accepted request, **when** the system is restarted and the
  request is looked up, **then** it is still found.
- **Given** a request that failed, **when** it is looked up, **then** the
  response carries a readable reason and no internal detail, and no attempt
  count.

### 7.8 FR08 — Background production of reports

- **Given** a report request accepted while the caller's inventory is large,
  **when** other endpoints are called immediately afterwards, **then** they
  answer normally.
- **Given** a request for a user of the initial data and the default
  configuration, **when** it is looked up, **then** it leaves `pending` within
  5 seconds and reads `done` within 30 seconds.
- **Given** a request being produced, **when** the producing process is killed
  and the system is started again, **then** the request becomes eligible again
  within the configured period, still reaches `done` or `failed`, and does not
  stay in `processing`.
- **Given** a request whose user no longer exists when it is produced, **when**
  it is looked up, **then** it reads `failed` with a reason, without retries.
- **Given** email sending that fails temporarily, **when** the request is
  looked up over time, **then** it is retried and eventually reaches `done`, or
  reaches `failed` with a reason after the configured maximum number of
  attempts.
- **Given** several instances producing reports at the same time and no
  interruptions, **when** one request is accepted, **then** exactly one
  successful email is recorded for it.
- **Given** one request that fails, **when** other requests are looked up,
  **then** they are still produced and finish.

### 7.9 FR10 — Documentation

- **Given** a clean copy of the project and only its README, **when** a
  reviewer follows it, **then** they start the system, load the initial data,
  sign in, call every endpoint, observe a report being produced and emailed,
  and find the stated assumptions and limits.
- **Given** the README, **when** a reviewer looks for each review topic of
  `docs/context.md` §10, **then** each one is explained or linked.

### 7.10 Cross-cutting

- **Given** any endpoint, **when** an unexpected failure happens, **then** the
  response is `500` with a generic message and no stack trace, and the failure
  is recorded on the server.
- **Given** any error response of the API, **when** its body is inspected,
  **then** it has an error code and a human-readable message and nothing else.
- **Given** a request to a path or method this specification does not list,
  **when** it is sent, **then** the response is `404` with the error shape.
- **Given** a request whose body is not valid JSON or is too large, **when** it
  is sent to sign-in, or to a protected endpoint with a valid token, **then**
  the response is `400` with the error shape.
- **Given** a missing required configuration value, **when** the system is
  started, **then** it refuses to start and names the missing value.

## 8. Known limits

Accepted consequences of this specification. The README must state them.

1. **Duplicate email after an interruption.** If the system is interrupted
   after a report email is sent but before the request is recorded as
   finished, the same report may be emailed again (§3.6 rule 6). A report is
   never lost silently in exchange.
2. **Report requests are kept indefinitely.** No retention period is defined;
   their storage grows with use (§4.5, §6).
3. **Inventory order is not defined** and the whole inventory is returned in
   one response, without pagination (§3.5, §6).
4. **One API instance.** Running several API instances behind a load balancer
   is described but not delivered (§6).
5. **Leftover report files have no deadline.** A file left behind by an
   interruption, or by a failed removal, is removed later, but it may stay for
   a long time, for example while the system stays stopped (§4.5). It is never
   served by the API (§3.6 rule 7).
