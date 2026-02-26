import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

// File-based debug logger — writes to ~/Library/Logs/ECFileResolver/debug.log
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'ECFileResolver');
const LOG_FILE = path.join(LOG_DIR, 'debug.log');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }

function debugLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(msg);
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
}

debugLog(`=== EC File Resolver started === PID=${process.pid} execPath=${process.execPath} PATH=${process.env.PATH}`);

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
  fullDiskAccess: boolean;
}

const LAST_MODIFIED_TOLERANCE_MS = 5000;
const PROCESS_TIMEOUT_MS = 30000;

export class FileResolverService {
  private homeDirectory: string;
  private platform: string;
  private commandCache = new Map<string, boolean>();

  constructor(homeDirectory?: string, platform?: string) {
    this.homeDirectory = homeDirectory ?? os.homedir();
    this.platform = platform ?? process.platform;
  }

  detectOsInfo(): OsInfo {
    const osName = `${os.type()} ${os.release()}`;
    const osVersion = os.release();

    if (this.isMac()) {
      const available = this.isCommandAvailable('mdfind');
      const fda = available ? this.checkFullDiskAccess() : false;
      return { osName, osVersion, indexTool: 'mdfind (Spotlight)', indexAvailable: available, fullDiskAccess: fda };
    } else if (this.isWindows()) {
      const available = this.isWindowsSearchAvailable();
      return { osName, osVersion, indexTool: 'Windows Search (OleDb)', indexAvailable: available, fullDiskAccess: true };
    } else {
      const hasPlocate = this.isCommandAvailable('plocate');
      const hasLocate = this.isCommandAvailable('locate');
      const tool = hasPlocate ? 'plocate' : 'locate';
      return { osName, osVersion, indexTool: tool, indexAvailable: hasPlocate || hasLocate, fullDiskAccess: true };
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

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
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
          const browserFile = batch[j];
          console.error('Unexpected rejection in file resolution:', result.reason);
          unresolvedFiles.push(browserFile);
        }
      }
    }

    console.log(`File resolution complete: ${resolvedPaths.length} resolved, ${unresolvedFiles.length} unresolved`);
    return { resolvedPaths, unresolvedFiles, resolvedMapping, triedPaths };
  }

  private async resolveFile(browserFile: BrowserFileInfo, tried: string[]): Promise<string | null> {
    const relativePath = browserFile.webkitRelativePath;

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
      debugLog(`[resolve] OS index search THREW for ${browserFile.name}: ${e}`);
      return null;
    }

    if (!candidates || candidates.length === 0) {
      debugLog(`[resolve] No candidates from OS index for "${browserFile.name}"`);
      return null;
    }

    debugLog(`[resolve] OS index returned ${candidates.length} candidates for ${browserFile.name}`);

    const sizeMatched: string[] = [];
    for (const candidatePath of candidates) {
      tried.push(candidatePath);
      if (await this.isValidMatch(candidatePath, browserFile.size)) {
        sizeMatched.push(candidatePath);
      }
    }
    if (sizeMatched.length === 0) return null;

    const relativePath = browserFile.webkitRelativePath;
    const pathMatched = sizeMatched.filter((cp) => {
      const normalized = cp.replace(/\\/g, '/');
      return normalized.endsWith('/' + relativePath);
    });

    let narrowed = pathMatched.length > 0 ? pathMatched : sizeMatched;

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

    const homeMatch = narrowed.find((cp) => cp.startsWith(this.homeDirectory));
    if (homeMatch) return homeMatch;

    return narrowed[0];
  }

  private async searchMdfind(fileName: string): Promise<string[]> {
    try {
      const { stdout, stderr } = await execFileAsync('/usr/bin/mdfind', ['-name', fileName], { timeout: PROCESS_TIMEOUT_MS });
      debugLog(`[mdfind] query="${fileName}" stdout_len=${stdout.length} results=${stdout.split('\n').filter(Boolean).length}`);
      if (stderr && stderr.trim()) debugLog(`[mdfind] stderr: ${stderr.substring(0, 200)}`);
      return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    } catch (err: any) {
      debugLog(`[mdfind] FAILED for "${fileName}": ${err.message}`);
      if (err.stderr) debugLog(`[mdfind] stderr: ${err.stderr.substring(0, 200)}`);
      if (err.code) debugLog(`[mdfind] code: ${err.code}`);
      throw err;
    }
  }

  /**
   * Probe whether this app has Full Disk Access on macOS.
   * Tries to list ~/Library/Safari/ — a TCC-protected directory that requires FDA.
   * Falls back to checking if mdfind can find files in ~/Desktop.
   */
  checkFullDiskAccess(): boolean {
    if (this.commandCache.has('__fullDiskAccess')) {
      return this.commandCache.get('__fullDiskAccess')!;
    }

    if (!this.isMac()) {
      this.commandCache.set('__fullDiskAccess', true);
      return true;
    }

    try {
      // ~/Library/Safari/ is TCC-protected — only readable with Full Disk Access
      const safariDir = `${this.homeDirectory}/Library/Safari`;
      fs.readdirSync(safariDir);
      debugLog('Full Disk Access check: ~/Library/Safari readable → FDA granted');
      this.commandCache.set('__fullDiskAccess', true);
      return true;
    } catch {
      debugLog('Full Disk Access check: ~/Library/Safari not readable → FDA not granted');
      this.commandCache.set('__fullDiskAccess', false);
      return false;
    }
  }

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

  private isMac(): boolean {
    return this.platform === 'darwin';
  }

  private isWindows(): boolean {
    return this.platform === 'win32';
  }

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
}
