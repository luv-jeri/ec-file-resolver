# Electron File Resolver App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone Electron desktop app that provides an HTTP API for resolving browser file metadata (name, webkitRelativePath, size, lastModified) to absolute filesystem paths using OS-level indexes (macOS Spotlight, Windows Search).

**Architecture:** Electron app with an Express HTTP server running in the main process (port 7771). React + Vite dashboard in the renderer process. System tray integration with auto-launch at login. Packaged as .dmg (macOS) and .msi (Windows) via electron-builder.

**Tech Stack:** Electron 34+, Node.js, TypeScript, Express, React 19, Vite, Tailwind CSS, electron-builder, Vitest

**Project Location:** `/Users/sanjaykumar/Documents/p0/ec-file-resolver` (new repo, sibling to project-x-connector)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `.gitignore`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

**Step 1: Initialize project directory**

```bash
mkdir -p /Users/sanjaykumar/Documents/p0/ec-file-resolver
cd /Users/sanjaykumar/Documents/p0/ec-file-resolver
git init
```

**Step 2: Create package.json**

```json
{
  "name": "ec-file-resolver",
  "version": "1.0.0",
  "description": "Local file path resolver for browser-based uploads",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "Evolphin Software",
  "license": "UNLICENSED",
  "private": true
}
```

**Step 3: Install dependencies**

```bash
cd /Users/sanjaykumar/Documents/p0/ec-file-resolver

# Core
npm install electron@latest --save-dev
npm install vite@latest @vitejs/plugin-react@latest --save-dev
npm install typescript@latest --save-dev
npm install electron-builder@latest --save-dev
npm install vite-plugin-electron@latest vite-plugin-electron-renderer@latest --save-dev

# Main process deps
npm install express cors
npm install @types/express @types/cors --save-dev

# Renderer deps
npm install react react-dom
npm install @types/react @types/react-dom --save-dev

# Styling
npm install tailwindcss @tailwindcss/vite --save-dev

# Testing
npm install vitest --save-dev

# Auto-launch
npm install auto-launch
npm install @types/auto-launch --save-dev
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

**Step 5: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "outDir": "dist-electron",
    "rootDir": "."
  },
  "include": ["electron", "vite.config.ts"]
}
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
dist-electron/
release/
*.log
.DS_Store
```

**Step 7: Create minimal electron/main.ts**

```typescript
import { app, BrowserWindow } from 'electron';
import path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Don't quit on macOS — keep running in tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
```

**Step 8: Create electron/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  getResolutionHistory: () => ipcRenderer.invoke('get-resolution-history'),
});
```

**Step 9: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
      },
    ]),
    renderer(),
  ],
});
```

**Step 10: Create minimal React app**

Create `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EC File Resolver</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <h1 className="text-2xl font-bold">EC File Resolver</h1>
    </div>
  );
}
```

Create `src/index.css`:
```css
@import "tailwindcss";
```

**Step 11: Verify the app launches**

```bash
cd /Users/sanjaykumar/Documents/p0/ec-file-resolver
npm run dev
```

Expected: Electron window opens with "EC File Resolver" heading.

**Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + React + Vite + Tailwind project"
```

---

## Task 2: File Resolver Service (Core Logic)

**Files:**
- Create: `electron/services/file-resolver.ts`
- Create: `electron/services/file-resolver.test.ts`

**Step 1: Write the test file**

```typescript
// electron/services/file-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { FileResolverService } from './file-resolver';
import type { BrowserFileInfo } from './file-resolver';

describe('FileResolverService', () => {
  describe('detectOsInfo', () => {
    it('should return OS info with index tool name', () => {
      const service = new FileResolverService();
      const info = service.detectOsInfo();

      expect(info.osName).toBeTruthy();
      expect(info.osVersion).toBeTruthy();
      expect(info.indexTool).toBeTruthy();
      expect(typeof info.indexAvailable).toBe('boolean');
    });
  });

  describe('resolveFiles', () => {
    it('should return empty results for empty input', async () => {
      const service = new FileResolverService();
      const result = await service.resolveFiles([]);

      expect(result.resolvedPaths).toEqual([]);
      expect(result.unresolvedFiles).toEqual([]);
      expect(result.resolvedMapping).toEqual({});
      expect(result.triedPaths).toEqual({});
    });

    it('should reject path traversal attempts', async () => {
      const service = new FileResolverService();
      const files: BrowserFileInfo[] = [
        { name: 'evil.sh', webkitRelativePath: '../../etc/evil.sh', size: 100, lastModified: 0 },
      ];
      const result = await service.resolveFiles(files);

      expect(result.resolvedPaths).toEqual([]);
      expect(result.unresolvedFiles).toHaveLength(1);
    });

    it('should report unresolved files for non-existent files', async () => {
      const service = new FileResolverService();
      const files: BrowserFileInfo[] = [
        { name: 'ghost-file-that-doesnt-exist.xyz', webkitRelativePath: 'nowhere/ghost-file-that-doesnt-exist.xyz', size: 999999, lastModified: 0 },
      ];
      const result = await service.resolveFiles(files);

      expect(result.resolvedPaths).toEqual([]);
      expect(result.unresolvedFiles).toHaveLength(1);
      expect(result.unresolvedFiles[0].name).toBe('ghost-file-that-doesnt-exist.xyz');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /Users/sanjaykumar/Documents/p0/ec-file-resolver
npx vitest run electron/services/file-resolver.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the file resolver service**

```typescript
// electron/services/file-resolver.ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface BrowserFileInfo {
  name: string;
  webkitRelativePath: string;
  size: number;
  lastModified: number;
}

export interface FileResolveResult {
  resolvedPaths: string[];
  unresolvedFiles: BrowserFileInfo[];
  resolvedMapping: Record<string, string>;
  triedPaths: Record<string, string[]>;
}

export interface OsInfo {
  osName: string;
  osVersion: string;
  indexTool: string;
  indexAvailable: boolean;
}

const LAST_MODIFIED_TOLERANCE_MS = 5000;
const PROCESS_TIMEOUT_MS = 30000;

export class FileResolverService {
  private homeDirectory: string;
  private platform: string;

  constructor(homeDirectory?: string, platform?: string) {
    this.homeDirectory = homeDirectory ?? os.homedir();
    this.platform = platform ?? process.platform;
  }

  detectOsInfo(): OsInfo {
    const osName = `${os.type()} ${os.release()}`;
    const osVersion = os.release();

    if (this.isMac()) {
      const available = this.isCommandAvailable('mdfind');
      return { osName, osVersion, indexTool: 'mdfind (Spotlight)', indexAvailable: available };
    } else if (this.isWindows()) {
      const available = this.isWindowsSearchAvailable();
      return { osName, osVersion, indexTool: 'Windows Search (OleDb)', indexAvailable: available };
    } else {
      const hasPlocate = this.isCommandAvailable('plocate');
      const hasLocate = this.isCommandAvailable('locate');
      const tool = hasPlocate ? 'plocate' : 'locate';
      return { osName, osVersion, indexTool: tool, indexAvailable: hasPlocate || hasLocate };
    }
  }

  checkIndexAvailability(): string | null {
    if (this.isMac()) {
      if (!this.isCommandAvailable('mdfind')) {
        return 'Spotlight index is not available. Please enable Spotlight in System Preferences > Siri & Spotlight.';
      }
      return null;
    } else if (this.isWindows()) {
      if (!this.isWindowsSearchAvailable()) {
        return 'Windows Search service is not running. Open Services (services.msc) > Find "Windows Search" > Set to Automatic > Start.';
      }
      return null;
    } else {
      if (!this.isCommandAvailable('plocate') && !this.isCommandAvailable('locate')) {
        return 'plocate/locate is not installed. Install: sudo apt install plocate && sudo updatedb';
      }
      return null;
    }
  }

  async resolveFiles(browserFiles: BrowserFileInfo[]): Promise<FileResolveResult> {
    const resolvedPaths: string[] = [];
    const unresolvedFiles: BrowserFileInfo[] = [];
    const resolvedMapping: Record<string, string> = {};
    const triedPaths: Record<string, string[]> = {};

    for (const browserFile of browserFiles) {
      const tried: string[] = [];
      const resolved = await this.resolveFile(browserFile, tried);
      if (resolved) {
        resolvedPaths.push(resolved);
        resolvedMapping[browserFile.webkitRelativePath] = resolved;
      } else {
        unresolvedFiles.push(browserFile);
        triedPaths[browserFile.webkitRelativePath] = tried;
      }
    }

    console.log(`File resolution complete: ${resolvedPaths.length} resolved, ${unresolvedFiles.length} unresolved`);
    return { resolvedPaths, unresolvedFiles, resolvedMapping, triedPaths };
  }

  private async resolveFile(browserFile: BrowserFileInfo, tried: string[]): Promise<string | null> {
    const relativePath = browserFile.webkitRelativePath;

    // Security: reject path traversal
    if (relativePath.includes('..')) {
      console.warn(`Path traversal attempt detected: ${relativePath}`);
      return null;
    }

    return this.searchViaOsIndex(browserFile, tried);
  }

  private async searchViaOsIndex(browserFile: BrowserFileInfo, tried: string[]): Promise<string | null> {
    let candidates: string[];

    try {
      if (this.isMac()) {
        candidates = await this.searchMdfind(browserFile.name);
      } else if (this.isWindows()) {
        candidates = await this.searchWindowsIndex(browserFile.name);
      } else {
        candidates = await this.searchLocate(browserFile.name);
      }
    } catch (e) {
      console.warn(`OS index search failed for ${browserFile.name}: ${e}`);
      return null;
    }

    if (!candidates || candidates.length === 0) return null;

    console.log(`OS index returned ${candidates.length} candidates for ${browserFile.name}`);

    // Filter 1: size must match
    const sizeMatched: string[] = [];
    for (const candidatePath of candidates) {
      tried.push(candidatePath);
      if (this.isValidMatch(candidatePath, browserFile.size)) {
        sizeMatched.push(candidatePath);
      }
    }
    if (sizeMatched.length === 0) return null;

    // Filter 2: webkitRelativePath suffix match
    const relativePath = browserFile.webkitRelativePath;
    const pathMatched = sizeMatched.filter((cp) => {
      const normalized = cp.replace(/\\/g, '/');
      return normalized.endsWith('/' + relativePath);
    });

    let narrowed = pathMatched.length > 0 ? pathMatched : sizeMatched;

    // Filter 3: lastModified match
    if (browserFile.lastModified > 0) {
      const timeMatched: string[] = [];
      for (const candidatePath of narrowed) {
        try {
          const stat = fs.statSync(candidatePath);
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

    // Preference: home directory
    const homeMatch = narrowed.find((cp) => cp.startsWith(this.homeDirectory));
    if (homeMatch) return homeMatch;

    return narrowed[0];
  }

  // --- macOS ---
  private async searchMdfind(fileName: string): Promise<string[]> {
    const { stdout } = await execFileAsync('mdfind', ['-name', fileName], { timeout: PROCESS_TIMEOUT_MS });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  // --- Windows ---
  private async searchWindowsIndex(fileName: string): Promise<string[]> {
    const escapedName = fileName.replace(/'/g, "''");
    const psScript =
      `$conn = New-Object System.Data.OleDb.OleDbConnection('Provider=Search.CollatorDSO;Extended Properties="Application=Windows";');` +
      `$conn.Open();` +
      `$cmd = $conn.CreateCommand();` +
      `$cmd.CommandText = "SELECT System.ItemPathDisplay FROM SystemIndex WHERE System.FileName = '${escapedName}'";` +
      `$reader = $cmd.ExecuteReader();` +
      `while($reader.Read()){$reader.GetString(0)};` +
      `$conn.Close()`;

    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', psScript], { timeout: PROCESS_TIMEOUT_MS });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  // --- Linux ---
  private async searchLocate(fileName: string): Promise<string[]> {
    const cmd = this.isCommandAvailable('plocate') ? 'plocate' : 'locate';
    const args = cmd === 'plocate' ? ['-b', fileName] : ['-b', '-i', fileName];
    const { stdout } = await execFileAsync(cmd, args, { timeout: PROCESS_TIMEOUT_MS });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  // --- Utilities ---
  private isValidMatch(filePath: string, expectedSize: number): boolean {
    try {
      const stat = fs.statSync(filePath);
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

  private isMac(): boolean {
    return this.platform === 'darwin';
  }

  private isWindows(): boolean {
    return this.platform === 'win32';
  }

  private isCommandAvailable(command: string): boolean {
    try {
      const which = this.isWindows() ? 'where' : 'which';
      require('child_process').execFileSync(which, [command], { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private isWindowsSearchAvailable(): boolean {
    try {
      const result = require('child_process').execFileSync(
        'powershell',
        ['-NoProfile', '-Command', 'Get-Service WSearch | Select-Object -ExpandProperty Status'],
        { timeout: 5000 }
      );
      return result.toString().trim().toLowerCase() === 'running';
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run tests**

```bash
npx vitest run electron/services/file-resolver.test.ts
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add electron/services/file-resolver.ts electron/services/file-resolver.test.ts
git commit -m "feat: add FileResolverService with OS index search (mdfind/Windows Search/locate)"
```

---

## Task 3: Express HTTP Server

**Files:**
- Create: `electron/server.ts`
- Create: `electron/server.test.ts`

**Step 1: Write the test file**

```typescript
// electron/server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('HTTP Server', () => {
  let baseUrl: string;
  let stopServer: () => void;

  beforeAll(async () => {
    const { createServer } = await import('./server');
    const { server, port } = createServer(0); // random port
    baseUrl = `http://localhost:${port}`;
    stopServer = () => server.close();
  });

  afterAll(() => {
    stopServer?.();
  });

  it('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.osInfo).toBeTruthy();
    expect(body.osInfo.indexTool).toBeTruthy();
  });

  it('POST /get-file-paths with empty files returns 400', async () => {
    const res = await fetch(`${baseUrl}/get-file-paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /get-file-paths rejects path traversal', async () => {
    const res = await fetch(`${baseUrl}/get-file-paths`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: [{ name: 'evil.sh', webkitRelativePath: '../../etc/evil.sh', size: 100, lastModified: 0 }],
      }),
    });
    const body = await res.json();

    expect(body.status).toBe('NONE_RESOLVED');
    expect(body.unresolvedFiles).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run electron/server.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write the server**

```typescript
// electron/server.ts
import express from 'express';
import cors from 'cors';
import { FileResolverService } from './services/file-resolver';
import type { BrowserFileInfo } from './services/file-resolver';

const fileResolver = new FileResolverService();

export function createServer(port: number = 7771) {
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    const osInfo = fileResolver.detectOsInfo();
    const version = require('../package.json').version;
    res.json({ status: 'ok', version, osInfo });
  });

  // File path resolution
  app.post('/get-file-paths', async (req, res) => {
    try {
      const files: BrowserFileInfo[] = req.body?.files;

      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'Request must include a non-empty "files" array' });
        return;
      }

      // Check OS index availability
      const osInfo = fileResolver.detectOsInfo();
      const indexError = fileResolver.checkIndexAvailability();

      if (!osInfo.indexAvailable) {
        res.status(503).json({
          status: 'INDEX_NOT_AVAILABLE',
          osInfo,
          resolvedPaths: [],
          resolvedMapping: {},
          unresolvedFiles: files,
          triedPaths: {},
          error: indexError,
        });
        return;
      }

      // Resolve files
      const result = await fileResolver.resolveFiles(files);

      let status: string;
      if (result.unresolvedFiles.length === 0) {
        status = 'ALL_RESOLVED';
      } else if (result.resolvedPaths.length === 0) {
        status = 'NONE_RESOLVED';
      } else {
        status = 'PARTIAL';
      }

      const statusCode = status === 'NONE_RESOLVED' ? 400 : 200;

      res.status(statusCode).json({
        status,
        osInfo,
        resolvedPaths: result.resolvedPaths,
        resolvedMapping: result.resolvedMapping,
        unresolvedFiles: result.unresolvedFiles,
        triedPaths: result.triedPaths,
        error: null,
      });
    } catch (e) {
      console.error('Unexpected error in /get-file-paths:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const server = app.listen(port, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`File resolver server running on port ${actualPort}`);
  });

  const actualPort = (server.address() as any)?.port ?? port;
  return { server, port: actualPort, app };
}
```

**Step 4: Run tests**

```bash
npx vitest run electron/server.test.ts
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add electron/server.ts electron/server.test.ts
git commit -m "feat: add Express HTTP server with /health and /get-file-paths endpoints"
```

---

## Task 4: Integrate Server into Electron Main Process

**Files:**
- Modify: `electron/main.ts`

**Step 1: Update main.ts to start the HTTP server and add system tray**

```typescript
// electron/main.ts
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import { createServer } from './server';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

// Resolution history (in-memory, recent 100 entries)
const resolutionHistory: Array<{
  timestamp: number;
  filesRequested: number;
  filesResolved: number;
  status: string;
}> = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false, // Start hidden — tray click will show
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Hide instead of close
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  // Use a simple icon (16x16 template image for macOS)
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon: nativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback: create a blank 16x16 icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('EC File Resolver');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: `Server: port ${7771}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// IPC handlers for renderer
function setupIpc() {
  ipcMain.handle('get-server-status', () => {
    return {
      running: httpServer !== null,
      port: 7771,
    };
  });

  ipcMain.handle('get-logs', () => {
    // Return last 100 log entries (placeholder — will enhance in dashboard task)
    return [];
  });

  ipcMain.handle('get-resolution-history', () => {
    return resolutionHistory;
  });
}

app.whenReady().then(() => {
  // Start HTTP server
  httpServer = createServer(7771);
  console.log('HTTP server started on port 7771');

  createWindow();
  createTray();
  setupIpc();
});

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  httpServer?.server.close();
});
```

**Step 2: Create tray icon asset**

```bash
mkdir -p /Users/sanjaykumar/Documents/p0/ec-file-resolver/assets
```

Create a simple 16x16 PNG placeholder (or use any icon). A proper icon can be designed later.

**Step 3: Verify it works**

```bash
npm run dev
```

Expected:
- Electron app launches (window hidden initially)
- Tray icon appears
- `curl http://localhost:7771/health` returns `{"status":"ok",...}`

**Step 4: Commit**

```bash
git add electron/main.ts assets/
git commit -m "feat: integrate HTTP server + system tray into Electron main process"
```

---

## Task 5: Auto-Launch on Login

**Files:**
- Modify: `electron/main.ts` (add auto-launch setup)

**Step 1: Add auto-launch to main.ts**

Add this after `app.whenReady()`:

```typescript
import AutoLaunch from 'auto-launch';

// Inside app.whenReady callback:
const autoLauncher = new AutoLaunch({
  name: 'EC File Resolver',
  isHidden: true,
});

autoLauncher.isEnabled().then((isEnabled) => {
  if (!isEnabled) {
    autoLauncher.enable();
    console.log('Auto-launch enabled');
  }
});
```

**Step 2: Verify auto-launch is registered**

```bash
npm run dev
```

On macOS, check: System Settings > General > Login Items — "EC File Resolver" should appear.

**Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add auto-launch at login via auto-launch package"
```

---

## Task 6: React Dashboard — Layout and Navigation

**Files:**
- Create: `src/App.tsx` (replace)
- Create: `src/pages/Dashboard.tsx`
- Create: `src/pages/Logs.tsx`
- Create: `src/pages/Settings.tsx`
- Create: `src/components/Sidebar.tsx`
- Modify: `src/index.css`

**Step 1: Create the sidebar component**

```tsx
// src/components/Sidebar.tsx
interface SidebarProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '~' },
  { id: 'logs', label: 'Logs', icon: '#' },
  { id: 'settings', label: 'Settings', icon: '*' },
];

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">EC File Resolver</h1>
        <p className="text-xs text-gray-500">v1.0.0</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full text-left px-3 py-2 rounded text-sm mb-1 ${
              activePage === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

**Step 2: Create Dashboard page**

```tsx
// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';

interface ServerStatus {
  running: boolean;
  port: number;
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    window.electronAPI?.getServerStatus().then(setStatus);
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <p className="text-sm text-gray-400">Server Status</p>
          <p className="text-lg font-semibold mt-1">
            {status?.running ? (
              <span className="text-green-400">Running</span>
            ) : (
              <span className="text-red-400">Stopped</span>
            )}
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <p className="text-sm text-gray-400">Port</p>
          <p className="text-lg font-semibold mt-1 text-white">{status?.port ?? '—'}</p>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create Logs page**

```tsx
// src/pages/Logs.tsx
export default function Logs() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Logs</h2>
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 font-mono text-sm text-gray-300 h-96 overflow-y-auto">
        <p className="text-gray-500">No logs yet...</p>
      </div>
    </div>
  );
}
```

**Step 4: Create Settings page**

```tsx
// src/pages/Settings.tsx
export default function Settings() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Settings</h2>
      <div className="space-y-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <label className="block text-sm text-gray-400 mb-1">HTTP Port</label>
          <input
            type="number"
            defaultValue={7771}
            disabled
            className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1.5 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Restart required to change port.</p>
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Update App.tsx**

```tsx
// src/App.tsx
import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Logs from './pages/Logs';
import Settings from './pages/Settings';

export default function App() {
  const [page, setPage] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <Sidebar activePage={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        {page === 'dashboard' && <Dashboard />}
        {page === 'logs' && <Logs />}
        {page === 'settings' && <Settings />}
      </main>
    </div>
  );
}
```

**Step 6: Add type declaration for electronAPI**

Create `src/types/electron.d.ts`:

```typescript
interface ElectronAPI {
  getServerStatus: () => Promise<{ running: boolean; port: number }>;
  getLogs: () => Promise<string[]>;
  getResolutionHistory: () => Promise<Array<{
    timestamp: number;
    filesRequested: number;
    filesResolved: number;
    status: string;
  }>>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
```

**Step 7: Verify the dashboard renders**

```bash
npm run dev
```

Expected: Electron window shows sidebar with Dashboard/Logs/Settings pages.

**Step 8: Commit**

```bash
git add src/ electron/preload.ts
git commit -m "feat: add React dashboard with sidebar, dashboard, logs, and settings pages"
```

---

## Task 7: Electron Builder — Packaging for macOS and Windows

**Files:**
- Modify: `package.json` (add build config)
- Create: `electron-builder.yml`

**Step 1: Create electron-builder.yml**

```yaml
appId: com.evolphin.ec-file-resolver
productName: EC File Resolver
directories:
  output: release

mac:
  category: public.app-category.utilities
  target:
    - dmg
    - zip
  icon: assets/icon.icns

win:
  target:
    - nsis
  icon: assets/icon.ico

nsis:
  oneClick: true
  perMachine: false
  allowToChangeInstallationDirectory: false

dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications
```

**Step 2: Add build script to package.json**

Ensure `scripts` in package.json includes:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "package:mac": "npm run build && electron-builder --mac",
    "package:win": "npm run build && electron-builder --win",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 3: Build for macOS**

```bash
npm run package:mac
```

Expected: `.dmg` installer created in `release/` directory.

**Step 4: Commit**

```bash
git add electron-builder.yml package.json
git commit -m "feat: add electron-builder config for macOS and Windows packaging"
```

---

## Task 8: Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

**Step 1: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
});
```

**Step 2: Run all tests**

```bash
npm test
```

Expected: All tests pass (file-resolver tests + server tests).

**Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "feat: add vitest configuration"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Project scaffolding | package.json, vite.config.ts, electron/main.ts |
| 2 | File Resolver Service | electron/services/file-resolver.ts + tests |
| 3 | Express HTTP Server | electron/server.ts + tests |
| 4 | Electron integration | electron/main.ts (server + tray) |
| 5 | Auto-launch | auto-launch integration |
| 6 | React Dashboard | src/pages/, src/components/ |
| 7 | Packaging | electron-builder.yml |
| 8 | Test config | vitest.config.ts |

### API Compatibility with Java Connector

The HTTP API is intentionally compatible:

| Java Connector | Node Electron App |
|---------------|-------------------|
| `POST /upload/get-file-paths` | `POST /get-file-paths` |
| Port 7770 | Port 7771 |
| Same request shape: `{ files: [BrowserFileInfo] }` | Same |
| Same response shape: `{ status, osInfo, resolvedPaths, ... }` | Same |

The web app only needs to change the port number to switch between the two.
