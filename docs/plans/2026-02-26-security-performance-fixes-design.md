# Security & Performance Fixes Design

Date: 2026-02-26

## Context

Code review identified 3 critical and 6 important issues in `server.ts` and `file-resolver.ts`. This document captures the approved design for fixing all 9.

## server.ts Fixes

### #2 — Input validation on BrowserFileInfo fields
Add a `isValidBrowserFileInfo` type guard checking:
- `name`: non-empty string
- `webkitRelativePath`: string
- `size`: non-negative number
- `lastModified`: number

Reject the entire request (400) if any item fails validation.

### #3 — Request body size limit
- Add `{ limit: '1mb' }` to `express.json()`
- Cap files array at 1000 items

### #4 — CORS origin allowlist
Replace `origin: true` with explicit allowlist:
- `https://app.evolphin.com`
- `http://localhost:3000`

### #5 — Bind to loopback only
Change `app.listen(port)` to `app.listen(port, '127.0.0.1')` so the service is only reachable from the local machine.

## file-resolver.ts Fixes

### #1 — SQL injection in Windows Search
Pass filename as a PowerShell `$args[0]` parameter instead of interpolating into the SQL string. The filename is passed as an argument to `execFileAsync('powershell', [..., fileName])`, keeping it out of the SQL entirely.

### #6 — Bounded concurrency for file resolution
Replace sequential `for` loop in `resolveFiles` with batched `Promise.allSettled` — 10 files at a time.

### #7 — Replace statSync with async stat
Change `fs.statSync` to `fs.promises.stat` in both `isValidMatch` and the time-matching loop. Both methods become async.

### #8 — Cache isCommandAvailable results
Add `private commandCache: Map<string, boolean>` that stores results on first call. Same for `isWindowsSearchAvailable`.

### #9 — Handle locate exit code 1
Wrap `searchLocate` in try/catch that treats exit code 1 (no results found) as an empty array instead of logging a warning.
