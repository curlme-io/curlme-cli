# curlme CLI

Terminal-first HTTP request debugging.

Capture, inspect, replay, and diff HTTP requests directly from your terminal with minimal typing.

## Installation

```bash
npm install -g @curlme/cli
```

## 60-second quickstart

```bash
curlme
curlme listen
```

If this is your first run, `curlme` creates a temporary bin, sets it active, and prints your endpoint.

If you prefer no auto-create:

```bash
curlme --no-create
curlme init
```

## Core workflow

```bash
curlme init stripe-dev
curlme listen
curlme latest
curlme show 2
curlme replay 1 --to http://localhost:3000/webhook
curlme diff
```

## Context model

- Active bin is remembered per workspace (git root when available).
- Use global context with `--global`.
- After `init`/`new`, created bin becomes active automatically.
- Ref selectors are most-recent-first:
  - `1` = latest
  - `2` = previous
  - short request IDs are resolved inside the active bin

## Command reference

### Setup and context

- `curlme init [name]` create temp/named bin and set active
- `curlme new [name]` alias for `init`
- `curlme bin` show current bin and recent bins (TTY: picker)
- `curlme bin <name|id>` set active bin
- `curlme bin set <name|id>` explicit set form
- `curlme use [name|id]` alias for `bin`
- `curlme status` show auth + active context + endpoint

### Request debugging

- `curlme listen` / `curlme l` stream incoming requests
- `curlme latest` show full latest request
- `curlme latest --summary` compact single row
- `curlme show [ref]` / `curlme s [ref]` show request details
  - In TTY, missing ref opens a picker
- `curlme replay [ref] --to <url>` / `curlme r [ref] --to <url>` replay request
  - In TTY, missing ref opens a picker
- `curlme diff [a] [b]` / `curlme d [a] [b]` compare requests
  - Defaults to `1` vs `2`

### Utilities

- `curlme open [ref]` open dashboard for active bin/request
- `curlme export --format <json|curl>` export request history
- `curlme login` authenticate with API key
- `curlme upgrade` open billing/plan page

## Scriptable output

Use `--json` for machine-readable output where supported.

```bash
curlme latest --summary --json
curlme export --format json --json
```

## Deprecations

Legacy commands still work with warnings and map to new commands. They are planned for removal in `v2.0`.

Examples:

- `curlme auth login` -> `curlme login`
- `curlme request latest` -> `curlme latest`
- `curlme bin create` -> `curlme init`
- `curlme billing` -> `curlme upgrade`

## Environment variables

- `CURLME_API_URL` override API base URL (default: `https://curlme.io`)

## License

MIT