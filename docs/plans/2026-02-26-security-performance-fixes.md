# Security & Performance Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 3 critical and 6 important issues identified in code review — covering SQL injection, input validation, CORS, loopback binding, async I/O, concurrency, and command caching.

**Architecture:** All changes are in two files: `electron/server.ts` (HTTP layer) and `electron/services/file-resolver.ts` (search logic). Tests live alongside at `electron/server.test.ts` and `electron/services/file-resolver.test.ts`.

**Tech Stack:** TypeScript, Express, Vitest, Node.js child_process, fs.promises

**Test command:** `pnpm vitest run`

---

### Task 1: Body size limit and file array cap (Critical #3)

**Files:**
- Modify: `electron/server.ts:15` (express.json line)
- Modify: `electron/server.ts:27-30` (validation block)
- Test: `electron/server.test.ts`

**Step 1: Write failing tests**

Add to the `describe('HTTP Server')` block in `electron/server.test.ts`:

```typescript
it('POST /get-file-paths rejects when files array exceeds 1000 items', async () => {
  const files = Array.from({ length: 1001 }, (_, i) => ({
    name: `file${i}.txt`,
    webkitRelativePath: `folder/file${i}.txt`,
    size: 100,
    lastModified: Date.now(),
  }));
  const res = await fetch(`${baseUrl}/get-file-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('1000');
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run electron/server.test.ts`
Expected: FAIL — the 1001-item array currently passes validation.

**Step 3: Implement body limit and array cap**

In `electron/server.ts`, change line 15:

```typescript
// before
app.use(express.json());

// after
app.use(express.json({ limit: '1mb' }));
```

In the `/get-file-paths` handler, after the existing empty-array check, add:

```typescript
if (files.length > 1000) {
  res.status(400).json({ error: 'Maximum 1000 files per request' });
  return;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run electron/server.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add electron/server.ts electron/server.test.ts
git commit -m "fix: add request body size limit and file array cap"
```

---

### Task 2: Input validation on BrowserFileInfo fields (Critical #2)

**Files:**
- Modify: `electron/server.ts:23-30`
- Test: `electron/server.test.ts`

**Step 1: Write failing tests**

Add to `electron/server.test.ts`:

```typescript
it('POST /get-file-paths rejects files with invalid field types', async () => {
  const res = await fetch(`${baseUrl}/get-file-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ name: 123, webkitRelativePath: null, size: 'abc', lastModified: 'xyz' }],
    }),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('name');
});

it('POST /get-file-paths rejects files with empty name', async () => {
  const res = await fetch(`${baseUrl}/get-file-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ name: '', webkitRelativePath: 'a/b.txt', size: 100, lastModified: 0 }],
    }),
  });
  expect(res.status).toBe(400);
});

it('POST /get-file-paths rejects files with negative size', async () => {
  const res = await fetch(`${baseUrl}/get-file-paths`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      files: [{ name: 'a.txt', webkitRelativePath: 'a/a.txt', size: -1, lastModified: 0 }],
    }),
  });
  expect(res.status).toBe(400);
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run electron/server.test.ts`
Expected: FAIL — no per-field validation exists.

**Step 3: Add validation function and apply it**

In `electron/server.ts`, add this function before `createServer`:

```typescript
function isValidBrowserFileInfo(f: unknown): f is BrowserFileInfo {
  return (
    typeof f === 'object' && f !== null &&
    typeof (f as any).name === 'string' && (f as any).name.length > 0 &&
    typeof (f as any).webkitRelativePath === 'string' &&
    typeof (f as any).size === 'number' && (f as any).size >= 0 &&
    typeof (f as any).lastModified === 'number'
  );
}
```

In the `/get-file-paths` handler, after the array length cap check, add:

```typescript
const invalidFile = files.find((f) => !isValidBrowserFileInfo(f));
if (invalidFile) {
  res.status(400).json({
    error: 'Each file must have: string name (non-empty), string webkitRelativePath, number size (>= 0), number lastModified',
  });
  return;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run electron/server.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add electron/server.ts electron/server.test.ts
git commit -m "fix: validate BrowserFileInfo field types in request"
```

---

### Task 3: CORS origin allowlist (Important #4)

**Files:**
- Modify: `electron/server.ts:11-14`

**Step 1: Write failing test**

Add to `electron/server.test.ts`:

```typescript
it('rejects CORS requests from unauthorized origins', async () => {
  const res = await fetch(`${baseUrl}/health`, {
    headers: { 'Origin': 'https://evil.com' },
  });
  const allowOrigin = res.headers.get('access-control-allow-origin');
  expect(allowOrigin).not.toBe('https://evil.com');
});

it('allows CORS requests from approved origins', async () => {
  const res = await fetch(`${baseUrl}/health`, {
    headers: { 'Origin': 'https://app.evolphin.com' },
  });
  const allowOrigin = res.headers.get('access-control-allow-origin');
  expect(allowOrigin).toBe('https://app.evolphin.com');
});
```

**Step 2: Run tests to verify the first one fails**

Run: `pnpm vitest run electron/server.test.ts`
Expected: "rejects CORS" FAILS (currently reflects all origins).

**Step 3: Replace CORS config**

In `electron/server.ts`, change:

```typescript
// before
app.use(cors({
    origin: true,
    credentials: true,
}));

// after
app.use(cors({
    origin: ['https://app.evolphin.com', 'http://localhost:3000'],
    credentials: true,
}));
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run electron/server.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add electron/server.ts electron/server.test.ts
git commit -m "fix: restrict CORS to approved origins"
```

---

### Task 4: Bind server to loopback only (Important #5)

**Files:**
- Modify: `electron/server.ts:76`

**Step 1: Apply the change**

In `electron/server.ts`, change:

```typescript
// before
const server = app.listen(port, () => {

// after
const server = app.listen(port, '127.0.0.1', () => {
```

**Step 2: Run existing tests to ensure nothing breaks**

Run: `pnpm vitest run electron/server.test.ts`
Expected: ALL PASS (tests connect via localhost which resolves to 127.0.0.1).

**Step 3: Commit**

```bash
git add electron/server.ts
git commit -m "fix: bind HTTP server to 127.0.0.1 only"
```

---

### Task 5: Cache isCommandAvailable results (Important #8)

**Files:**
- Modify: `electron/services/file-resolver.ts:219-240`
- Test: `electron/services/file-resolver.test.ts`

**Step 1: Write failing test**

Add to `electron/services/file-resolver.test.ts`:

```typescript
describe('detectOsInfo caching', () => {
  it('should return consistent results on repeated calls', () => {
    const service = new FileResolverService();
    const info1 = service.detectOsInfo();
    const info2 = service.detectOsInfo();
    expect(info1).toEqual(info2);
  });
});
```

**Step 2: Run test — it should pass (baseline)**

Run: `pnpm vitest run electron/services/file-resolver.test.ts`
Expected: PASS (this establishes the contract doesn't break after caching).

**Step 3: Add command cache**

In `electron/services/file-resolver.ts`, add a field to the class:

```typescript
private commandCache = new Map<string, boolean>();
```

Update `isCommandAvailable`:

```typescript
private isCommandAvailable(command: string): boolean {
  if (this.commandCache.has(command)) {
    return this.commandCache.get(command)!;
  }
  try {
    const which = this.isWindows() ? 'where' : 'which';
    require('child_process').execFileSync(which, [command], { timeout: 5000 });
    this.commandCache.set(command, true);
    return true;
  } catch {
    this.commandCache.set(command, false);
    return false;
  }
}
```

Update `isWindowsSearchAvailable` similarly:

```typescript
private isWindowsSearchAvailable(): boolean {
  if (this.commandCache.has('__windowsSearch')) {
    return this.commandCache.get('__windowsSearch')!;
  }
  try {
    const result = require('child_process').execFileSync(
      'powershell',
      ['-NoProfile', '-Command', 'Get-Service WSearch | Select-Object -ExpandProperty Status'],
      { timeout: 5000 }
    );
    const available = result.toString().trim().toLowerCase() === 'running';
    this.commandCache.set('__windowsSearch', available);
    return available;
  } catch {
    this.commandCache.set('__windowsSearch', false);
    return false;
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run electron/services/file-resolver.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add electron/services/file-resolver.ts electron/services/file-resolver.test.ts
git commit -m "perf: cache isCommandAvailable results to avoid repeated execFileSync"
```

---

### Task 6: Replace statSync with async stat (Important #7)

**Files:**
- Modify: `electron/services/file-resolver.ts:148-161` (time matching loop)
- Modify: `electron/services/file-resolver.ts:197-209` (isValidMatch)

**Step 1: Run existing tests as baseline**

Run: `pnpm vitest run electron/services/file-resolver.test.ts`
Expected: ALL PASS

**Step 2: Convert isValidMatch to async**

```typescript
private async isValidMatch(filePath: string, expectedSize: number): Promise<boolean> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) return false;
    if (stat.size !== expectedSize) {
      console.warn(`Size mismatch for ${filePath}: expected ${expectedSize}, actual ${stat.size}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
```

**Step 3: Update the size-matching loop in searchViaOsIndex to await isValidMatch**

```typescript
const sizeMatched: string[] = [];
for (const candidatePath of candidates) {
  tried.push(candidatePath);
  if (await this.isValidMatch(candidatePath, browserFile.size)) {
    sizeMatched.push(candidatePath);
  }
}
```

**Step 4: Convert the time-matching loop to use async stat**

```typescript
if (browserFile.lastModified > 0) {
  const timeMatched: string[] = [];
  for (const candidatePath of narrowed) {
    try {
      const stat = await fs.promises.stat(candidatePath);
      const fileModified = stat.mtimeMs;
      if (Math.abs(fileModified - browserFile.lastModified) <= LAST_MODIFIED_TOLERANCE_MS) {
        timeMatched.push(candidatePath);
      }
    } catch {
      // skip
    }
  }
  if (timeMatched.length > 0) narrowed = timeMatched;
}
```

**Step 5: Run tests**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add electron/services/file-resolver.ts
git commit -m "perf: replace statSync with fs.promises.stat to avoid blocking event loop"
```

---

### Task 7: Bounded concurrency for file resolution (Important #6)

**Files:**
- Modify: `electron/services/file-resolver.ts:78-98` (resolveFiles method)

**Step 1: Run existing tests as baseline**

Run: `pnpm vitest run electron/services/file-resolver.test.ts`
Expected: ALL PASS

**Step 2: Replace sequential loop with batched concurrency**

Replace the `resolveFiles` method body (after the variable declarations) with:

```typescript
async resolveFiles(browserFiles: BrowserFileInfo[]): Promise<FileResolveResult> {
  const resolvedPaths: string[] = [];
  const unresolvedFiles: BrowserFileInfo[] = [];
  const resolvedMapping: Record<string, string> = {};
  const triedPaths: Record<string, string[]> = {};

  const CONCURRENCY = 10;
  for (let i = 0; i < browserFiles.length; i += CONCURRENCY) {
    const batch = browserFiles.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (browserFile) => {
        const tried: string[] = [];
        const resolved = await this.resolveFile(browserFile, tried);
        return { browserFile, tried, resolved };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { browserFile, tried, resolved } = result.value;
        if (resolved) {
          resolvedPaths.push(resolved);
          resolvedMapping[browserFile.webkitRelativePath] = resolved;
        } else {
          unresolvedFiles.push(browserFile);
          triedPaths[browserFile.webkitRelativePath] = tried;
        }
      } else {
        // Promise.allSettled never rejects individual promises,
        // but handle defensive case
        console.error('Unexpected rejection in file resolution:', result.reason);
      }
    }
  }

  console.log(`File resolution complete: ${resolvedPaths.length} resolved, ${unresolvedFiles.length} unresolved`);
  return { resolvedPaths, unresolvedFiles, resolvedMapping, triedPaths };
}
```

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add electron/services/file-resolver.ts
git commit -m "perf: resolve files in batches of 10 instead of sequentially"
```

---

### Task 8: Handle locate exit code 1 as empty result (Important #9)

**Files:**
- Modify: `electron/services/file-resolver.ts:190-195` (searchLocate method)

**Step 1: Run existing tests as baseline**

Run: `pnpm vitest run electron/services/file-resolver.test.ts`
Expected: ALL PASS

**Step 2: Update searchLocate to handle exit code 1**

```typescript
private async searchLocate(fileName: string): Promise<string[]> {
  const cmd = this.isCommandAvailable('plocate') ? 'plocate' : 'locate';
  const args = cmd === 'plocate' ? ['-b', fileName] : ['-b', '-i', fileName];
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: PROCESS_TIMEOUT_MS });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (e: any) {
    // locate/plocate exit with code 1 when no results are found — not an error
    if (e.code === 1 || e.status === 1) {
      return [];
    }
    throw e;
  }
}
```

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add electron/services/file-resolver.ts
git commit -m "fix: treat locate exit code 1 (no results) as empty array, not error"
```

---

### Task 9: Fix Windows Search SQL injection (Critical #1)

**Files:**
- Modify: `electron/services/file-resolver.ts:175-188` (searchWindowsIndex method)

**Step 1: Run existing tests as baseline**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 2: Rewrite searchWindowsIndex to pass filename as $args[0]**

```typescript
private async searchWindowsIndex(fileName: string): Promise<string[]> {
  const psScript = [
    '$conn = New-Object System.Data.OleDb.OleDbConnection(\'Provider=Search.CollatorDSO;Extended Properties="Application=Windows";\');',
    '$conn.Open();',
    '$cmd = $conn.CreateCommand();',
    '$cmd.CommandText = "SELECT System.ItemPathDisplay FROM SystemIndex WHERE System.FileName = @name";',
    '$param = $cmd.CreateParameter();',
    '$param.ParameterName = "@name";',
    '$param.Value = $args[0];',
    '$cmd.Parameters.Add($param) | Out-Null;',
    '$reader = $cmd.ExecuteReader();',
    'while($reader.Read()){$reader.GetString(0)};',
    '$conn.Close()',
  ].join(' ');

  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-Command', psScript, fileName],
    { timeout: PROCESS_TIMEOUT_MS }
  );
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}
```

Note: OleDb parameterized queries via `@name` may not be supported by the Windows Search provider. If this fails on a Windows machine, the fallback approach is to validate the filename against an allowlist pattern (`/^[a-zA-Z0-9._\-\s()[\]]+$/`) and reject anything that doesn't match before interpolation.

**Step 3: Run tests**

Run: `pnpm vitest run`
Expected: ALL PASS (Windows search path is not exercised on macOS, but ensures no regressions.)

**Step 4: Commit**

```bash
git add electron/services/file-resolver.ts
git commit -m "fix: prevent SQL injection in Windows Search by parameterizing filename"
```

---

### Task 10: Final verification

**Step 1: Run full test suite**

Run: `pnpm vitest run`
Expected: ALL PASS

**Step 2: Manual smoke test**

Run: `pnpm dev`
- Verify tray icon appears in system tray
- Verify `curl http://127.0.0.1:7771/health` returns `{ "status": "ok", ... }`
- Verify `curl http://127.0.0.1:7771/get-file-paths -X POST -H "Content-Type: application/json" -d '{"files":[]}'` returns 400

**Step 3: Commit any remaining changes if needed**
