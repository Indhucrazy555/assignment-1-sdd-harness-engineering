# Data Model: Smart Todo Management API

## Task

One stored task represents one user-managed item. A task has no parent, owner, or relationship to
other tasks in this version.

| Field | Type | Required in stored response | Mutable by client | Rules |
|---|---|---:|---:|---|
| `id` | string | Yes | No | Unique lowercase UUID v4 |
| `title` | string | Yes | Yes | Trimmed; 1-100 Unicode code points |
| `description` | string | Yes | Yes | 0-2000 Unicode code points; preserved as supplied |
| `priority` | enum | Yes | Yes | `low`, `medium`, `high` |
| `status` | enum | Yes | Yes | `pending`, `in_progress`, `completed`; defaults to `pending` on create |
| `tags` | string array | Yes | Yes | Defaults to `[]`; 0-10 tags, each trimmed and 1-30 Unicode code points; case-insensitive duplicates rejected |
| `createdAt` | UTC timestamp string | Yes | No | Generated at creation as `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `dueDate` | date string or `null` | Yes | Yes | Valid `YYYY-MM-DD` calendar date; defaults to `null`; past dates allowed |

## Request Data

- **CreateTaskInput**: Requires `title`, `description`, and `priority`. `status`, `tags`, and
  `dueDate` are optional. Clients cannot provide `id` or `createdAt`.
- **UpdateTaskInput**: A non-empty subset of `title`, `description`, `priority`, `status`,
  `tags`, and `dueDate`. Omitted fields are unchanged; `dueDate: null` clears the due date.
  Immutable and unknown fields are rejected.
- Every status value may transition to any other allowed status; there is no additional workflow
  state machine.

## List Result

`TaskListResponse` contains `tasks: Task[]` and `count: integer`. `count` equals the number of
returned tasks. Filters combine with AND, including all requested tags. List order defaults to
`createdAt` ascending then `id` ascending; `sort=priority` orders high-to-low, then uses those
same tie-breakers.

## Persistence

The authoritative representation is UTF-8 JSON with top-level shape `{"tasks":[...]}` at
`data/tasks.json`. Missing storage means an empty collection. Invalid JSON, invalid stored
records, or duplicate IDs are storage errors and must not silently reset the file. Successful
mutations are serialized within the process and saved through a complete temporary document and
replacement before the HTTP success response.
