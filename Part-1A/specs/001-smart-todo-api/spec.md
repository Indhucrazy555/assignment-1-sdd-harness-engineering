# Feature Specification: Smart Todo Management API

**Feature Branch**: `not-created`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Create a deterministic REST API for managing tasks, including CRUD, filtering, priority sorting, validation, and local JSON persistence."

## Clarifications

### Session 2026-11-19

- Q: How should the API handle multiple task mutations arriving at the same time? → A: Process them sequentially.
- Q: Should the API be accessible only from the same computer, or from other devices too? → A: Same computer only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage Tasks (Priority: P1)

As a client of the API, I can create, retrieve, update, and delete a task so that task
information can be managed through a consistent REST interface.

**Why this priority**: Task lifecycle operations are the core value of the application.

**Independent Test**: Against an isolated empty task store, create one task, retrieve it, update
one field, retrieve the changed task, delete it, and verify it is no longer available.

**Acceptance Scenarios**:

1. **AC-001 - Create**: Given a valid create request, when the client posts to `/tasks`, then the
   API returns `201 Created`, a `Location: /tasks/{id}` header, and the complete task object.
   The response has a unique UUID v4 `id`, a server-generated `createdAt`, and the submitted
   mutable fields. Omitted `status` and `tags` are `pending` and `[]`; omitted or null
   `dueDate` is returned as `null`.
2. **AC-002 - Retrieve**: Given an existing task, when the client requests
   `GET /tasks/{id}`, then the API returns `200 OK` and the complete task object. For a valid
   but unknown UUID, it returns `404` with code `TASK_NOT_FOUND`.
3. **AC-003 - Update**: Given an existing task, when the client sends a valid non-empty
   `PATCH /tasks/{id}`, then the API returns `200 OK` with the updated task. Supplied fields
   change, omitted fields remain unchanged, and `dueDate: null` clears the due date.
4. **AC-004 - Delete**: Given an existing task, when the client sends `DELETE /tasks/{id}`,
   then the API returns `204 No Content` with an empty body and a later retrieval returns
   `404 TASK_NOT_FOUND`. Deleting an unknown valid UUID also returns `404`.

### User Story 2 - Keep Tasks Valid and Durable (Priority: P1)

As a client, I receive clear errors for invalid requests and can rely on successful task changes
remaining available after the service restarts.

**Why this priority**: Validation and durable storage prevent silent data loss and make the
service reliable for every other task journey.

**Independent Test**: Submit valid and invalid requests to a temporary task store, restart the
service, and compare the resulting task data and prescribed error responses.

**Acceptance Scenarios**:

1. **AC-005 - Error contract**: Given any specified client or storage error, when the request is
   processed, then the response uses the status, code, message, and optional details defined in
   the Error Responses table and never exposes a stack trace or filesystem path.
2. **AC-008 - Invalid input**: Given a request violating any field, body, or query constraint,
   when it is submitted, then the API returns the prescribed 4xx response and the persisted task
   state is unchanged.
3. **AC-009 - Dates**: Given a successful creation, when its response is inspected, then
   `createdAt` is a UTC timestamp in the specified format and cannot be supplied or changed by
   the client. A valid due date is preserved as the same calendar date without timezone
   conversion.
4. **AC-010 - Restart persistence**: Given one or more successful mutations, when the service
   restarts and the same store is used, then every task and field is restored exactly, including
   IDs, creation dates, tags, and due dates.
5. **AC-011 - Storage failures**: Given malformed, unreadable, or unwritable storage, when an
   operation requires that storage, then the API returns `500 STORAGE_ERROR`, does not report a
   successful mutation, and does not replace or truncate existing task data.
6. **AC-012 - Request envelope**: Given a request with an unsupported content type, a body over
   65,536 UTF-8 bytes, or a method not allowed for a known route, then the API returns,
   respectively, `415 UNSUPPORTED_MEDIA_TYPE`, `413 PAYLOAD_TOO_LARGE`, or
   `405 METHOD_NOT_ALLOWED` using the common error envelope.
7. **AC-013 - Overlapping mutations**: Given multiple task mutations received by the same
   service process at overlapping times, when they are handled, then they are processed one at a
   time in the order received. Each successful mutation observes the preceding successful
   mutation, and no successful task change is lost.
8. **AC-014 - Local-only access**: Given the API is running, when a client connects through the
   same computer's loopback interface, then the API is reachable; a client connecting through a
   non-loopback network interface cannot retrieve task data.

### User Story 3 - Find and Order Tasks (Priority: P2)

As a client, I can narrow the task list by task attributes and request a predictable priority
ordering so that relevant tasks are easy to find.

**Why this priority**: Filtering and sorting improve access to task data after the basic task
lifecycle is available.

**Independent Test**: Seed tasks with varied statuses, priorities, tags, and creation dates, then
verify exact list membership and order for each supported query.

**Acceptance Scenarios**:

1. **AC-006 - List and filter**: Given a task collection, when the client requests
   `GET /tasks` with any valid combination of `status`, `priority`, and `tags`, then the API
   returns `200 OK` with exactly the tasks matching every supplied filter and a `count` equal to
   the number of returned tasks. No matches returns `{"tasks":[],"count":0}`.
2. **AC-007 - Sort**: Given multiple matching tasks, when the client requests
   `GET /tasks?sort=priority`, then tasks are ordered `high`, `medium`, `low`; ties are ordered by
   `createdAt` ascending and then `id` ascending. Without `sort`, tasks are ordered by
   `createdAt` ascending and then `id` ascending. Repeating the same query against unchanged
   data produces the identical task ID sequence.

### Edge Cases

- A missing required create field, a whitespace-only title, a title or description over its
  limit, a non-string value, an unknown field, or an invalid enum returns `400` and does not
  change stored tasks.
- A non-object JSON body, malformed JSON, an empty patch object, or a patch containing only
  immutable or unknown fields returns `400`.
- A non-array `tags` value, more than 10 tags, an empty tag, an overlength tag, or tags that
  duplicate one another ignoring case returns `400`.
- An impossible calendar date, datetime value supplied as `dueDate`, or malformed date returns
  `400`; a syntactically valid past due date is accepted.
- A repeated query key, empty tag in a comma-separated filter, invalid enum filter, unknown
  query key, or sort value other than `priority` returns `400`.
- Duplicate tags in a tag filter, ignoring case, return `400`; tag filters follow the same
  1-30 Unicode code-point limit as stored tags.
- Valid but nonexistent task IDs return `404`; malformed task IDs return `400`.
- Combining filters that match no task returns `200` with an empty list, not `404`.
- A missing JSON store represents an empty collection. Invalid JSON, an invalid store shape, or
  file access failure returns `500 STORAGE_ERROR` and never silently resets the store.
- A failed create, update, or delete leaves the previously persisted collection unchanged.
- Overlapping create, update, and delete requests are processed sequentially in service receipt
  order; each request operates on the state left by the preceding successful mutation.
- Requests arriving through a non-loopback network interface cannot access task data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The API MUST represent each task with exactly these response fields:
  `id` (canonical lowercase UUID v4 string), `title` (string), `description` (string),
  `priority` (`low`, `medium`, or `high`), `status` (`pending`, `in_progress`, or `completed`),
  `tags` (array of strings), `createdAt` (UTC timestamp), and `dueDate` (ISO calendar date or
  `null`). Every response MUST include all eight fields.
- **FR-002**: `POST /tasks` MUST accept a JSON object with required `title`, `description`, and
  `priority`; optional `status`, `tags`, and `dueDate`; and no client-supplied `id` or
  `createdAt`. It MUST generate the ID and creation date, apply the documented defaults, persist
  the task before returning success, and return `201` with the task and `Location` header.
- **FR-003**: `GET /tasks/{id}` MUST return the matching complete task with `200`, or
  `404 TASK_NOT_FOUND` for a valid unknown ID. The path ID MUST be a lowercase canonical UUID v4;
  any other format returns `400 INVALID_TASK_ID`.
- **FR-004**: `GET /tasks` MUST return
  `{"tasks":[<task>,...],"count":<integer>}`. It MUST support optional `status`, `priority`,
  and `tags` filters. Each provided filter MUST be combined using AND; a comma-separated `tags`
  filter MUST match tasks containing every requested tag, case-insensitively.
- **FR-005**: `GET /tasks?sort=priority` MUST sort by descending priority (`high`, `medium`,
  `low`), then `createdAt` ascending, then `id` ascending. With no `sort`, list order MUST be
  `createdAt` ascending, then `id` ascending. No other sort value is supported.
- **FR-006**: `PATCH /tasks/{id}` MUST accept a non-empty object containing one or more mutable
  fields (`title`, `description`, `priority`, `status`, `tags`, `dueDate`). It MUST preserve
  omitted fields, reject immutable and unknown fields, persist before success, and return the
  complete updated task with `200`.
- **FR-007**: `DELETE /tasks/{id}` MUST persist removal before returning `204` with no body.
  An unknown valid ID MUST return `404 TASK_NOT_FOUND`.
- **FR-008**: All input MUST be validated as specified in the Field Rules table. Request JSON
  bodies MUST be at most 65,536 bytes when encoded as UTF-8. Unknown body properties and query
  keys MUST be rejected. Validation errors MUST NOT mutate persisted state.
- **FR-009**: `createdAt` MUST be generated in UTC as
  `YYYY-MM-DDTHH:mm:ss.sssZ` and MUST be immutable. `dueDate` MUST be a valid Gregorian calendar
  date in `YYYY-MM-DD` format or `null`; it is a calendar date with no time or timezone
  conversion and may be in the past.
- **FR-010**: All errors MUST use
  `{"error":{"code":"...","message":"..."}}`, optionally adding
  `"details":[{"field":"...","issue":"..."}]`. Error codes, exact messages, and HTTP statuses
  MUST match the Error Responses table. Validation detail entries MUST be ordered by field and
  then issue in ascending lexical order.
- **FR-011**: The authoritative task store MUST be the UTF-8 JSON file `data/tasks.json` under
  the application project directory. Its top-level value MUST be `{"tasks":[...]}`. A missing
  file MUST mean an empty collection; the parent directory and file MUST be created on the first
  successful mutation. A successful mutation MUST be persisted before its success response and
  MUST survive a process restart.
- **FR-012**: Storage writes MUST replace the stored collection without exposing partially
  written JSON. Within one service process, task mutations MUST be processed sequentially in the
  order received, with each mutation operating on the state left by the preceding successful
  mutation. A failed mutation MUST NOT change that state or prevent later queued mutations from
  being processed. A storage read, validation, or write failure MUST return `500 STORAGE_ERROR`,
  leave the last valid file unchanged, and MUST NOT be converted to an empty collection or a
  successful response.
- **FR-013**: The API MUST support only the endpoints and query keys defined in this
  specification. Unknown routes return `404 ROUTE_NOT_FOUND`; a disallowed method on a known
  route returns `405 METHOD_NOT_ALLOWED`. Request bodies for create and update MUST use
  `application/json` (an optional UTF-8 charset parameter is accepted). The API MUST be
  accessible only through the same computer's loopback interface; requests from other devices
  MUST NOT access task data.

### Field Rules

| Field | Create request | Update request | Constraint and response behavior |
|---|---|---|---|
| `id` | Forbidden | Forbidden | Generated unique canonical lowercase UUID v4; immutable |
| `title` | Required | Optional | String, trimmed before storage, 1-100 Unicode code points |
| `description` | Required | Optional | String, 0-2000 Unicode code points; stored as supplied |
| `priority` | Required | Optional | Exact lowercase enum: `low`, `medium`, `high` |
| `status` | Optional | Optional | Exact lowercase enum: `pending`, `in_progress`, `completed`; defaults to `pending` |
| `tags` | Optional | Optional | Array of 0-10 strings; each trimmed, 1-30 Unicode code points; case-insensitive duplicates rejected; defaults to `[]` |
| `createdAt` | Forbidden | Forbidden | Generated UTC RFC 3339 timestamp with milliseconds; immutable |
| `dueDate` | Optional | Optional | Valid `YYYY-MM-DD` calendar date or `null`; omission on create defaults to `null`; `null` on update clears it |

The create and update bodies MUST be JSON objects. An empty update object is invalid. All
properties not listed for the relevant operation are invalid.

### HTTP Endpoints and Response Schemas

| Method and path | Request | Success response |
|---|---|---|
| `POST /tasks` | Create object defined by Field Rules | `201`; one complete task object; `Location: /tasks/{id}` |
| `GET /tasks/{id}` | No body | `200`; one complete task object |
| `GET /tasks` | Optional `status`, `priority`, `tags`, `sort` query keys | `200`; `{"tasks":[<task>,...],"count":<integer>}` |
| `PATCH /tasks/{id}` | Non-empty partial update object defined by Field Rules | `200`; one complete updated task object |
| `DELETE /tasks/{id}` | No body | `204`; empty response body |

The task object returned by create, retrieve, list, and update MUST have this shape:

```json
{
  "id": "lowercase-uuid-v4",
  "title": "Prepare report",
  "description": "Review the draft",
  "priority": "medium",
  "status": "pending",
  "tags": ["work"],
  "createdAt": "2026-11-19T13:00:00.000Z",
  "dueDate": "2026-11-25"
}
```

The example values illustrate the schema; generated IDs and timestamps vary by creation.
List responses MUST include `count` equal to the number of task objects in `tasks`. Pagination
and bulk operations are not part of this feature.

### Filtering and Sorting

- `status` and `priority` accept exactly one enum value each.
- `tags` accepts one comma-separated value containing 1-10 non-empty tags, each 1-30 Unicode
  code points after trimming. Duplicate values ignoring case are invalid. Values are matched
  case-insensitively. A task matches only if it contains every requested tag.
- Multiple different filters combine using AND. Repeated query keys, blank values, malformed
  values, and unknown query keys return `400 VALIDATION_ERROR`.
- `sort` is optional and accepts only `priority`. When present, priority order is high to low;
  ties are resolved by `createdAt` ascending and then canonical `id` ascending. Without it, the
  same tie-break fields define list order, beginning with `createdAt`.
- Returned tag spelling is the trimmed spelling originally stored; matching does not change
  task data.

### Error Responses

| HTTP status | Code | Exact message | Use |
|---|---|---|---|
| `400` | `INVALID_JSON` | `Request body must be valid JSON.` | Malformed JSON |
| `400` | `VALIDATION_ERROR` | `Request validation failed.` | Invalid body fields, values, or query |
| `400` | `INVALID_TASK_ID` | `Task ID must be a UUID.` | Malformed task ID path segment |
| `404` | `TASK_NOT_FOUND` | `Task not found.` | Well-formed UUID not in the store |
| `404` | `ROUTE_NOT_FOUND` | `Route not found.` | Unknown path |
| `405` | `METHOD_NOT_ALLOWED` | `Method not allowed.` | Unsupported method on a known route |
| `413` | `PAYLOAD_TOO_LARGE` | `Request body exceeds 65536 bytes.` | Body exceeds the byte limit |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type must be application/json.` | Missing or unsupported create/update content type |
| `500` | `STORAGE_ERROR` | `Task storage operation failed.` | Store cannot be read, validated, or written |
| `500` | `INTERNAL_ERROR` | `Internal server error.` | Other unexpected server failure |

All errors MUST have the common `error` object. `details` is present only when field or query
validation issues are available. Each detail has exactly `field` and `issue` string properties.
Server responses MUST NOT include stack traces, secret values, or internal filesystem paths.

### Requirement-to-Acceptance Traceability

| Requirement | Acceptance criterion |
|---|---|
| FR-001 Task fields and types | AC-001, AC-009 |
| FR-002 Create task | AC-001 |
| FR-003 Retrieve by ID | AC-002 |
| FR-004 List and filter | AC-006 |
| FR-005 Sort | AC-007 |
| FR-006 Update task | AC-003 |
| FR-007 Delete task | AC-004 |
| FR-008 Input validation and size | AC-008, AC-012 |
| FR-009 Date and time handling | AC-009 |
| FR-010 Error statuses and envelope | AC-005, AC-008, AC-011, AC-012 |
| FR-011 JSON persistence and restart | AC-010, AC-011 |
| FR-012 Safe persistence writes and sequential mutations | AC-011, AC-013 |
| FR-013 Supported routes, media type, and local access | AC-005, AC-012, AC-014 |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of create, retrieve, update, and delete acceptance tests return the specified
  status, response shape, and resulting task state.
- **SC-002**: 100% of filter test cases return exactly the expected task IDs and count; repeated
  requests against unchanged data return the same task ID order.
- **SC-003**: 100% of successful mutation test cases retain the exact task data after a fresh
  process starts with the same store.
- **SC-004**: 100% of invalid-input test cases return their specified status and error code and
  leave the task collection unchanged.
- **SC-005**: Every functional requirement FR-001 through FR-013 maps to at least one identified
  acceptance criterion, and every acceptance criterion can be run independently against a
  deterministic fixture.

## Assumptions

- This is a single-user, single-active-process student assignment. The API is limited to the
  same computer's loopback interface, so authentication is out of scope. Multiple independent
  writer processes, pagination, bulk operations, recurring tasks, and task sharing are also out
  of scope.
- Task priorities are `low`, `medium`, and `high`; task statuses are `pending`, `in_progress`,
  and `completed`. These values are fixed for this version.
- Task titles are trimmed; descriptions are preserved as supplied. Tags are trimmed, retain
  their submitted spelling, and compare case-insensitively.
- Due dates are date-only values with no timezone conversion. Past due dates are allowed.
- Determinism means that identical requests against unchanged data produce identical status,
  error, and list-order results. Generated IDs and creation timestamps are not expected to be
  identical across separate task creations.
- The project constitution governs the implementation stack, architecture, test coverage,
  linting, and security gates; this specification defines externally observable behavior.
- No decisions remain unresolved for version 1. The defaults above deliberately settle the
  product choices identified in the constitution.
