import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
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

    const sizeMatched: string[] = [];
    for (const candidatePath of candidates) {
      tried.push(candidatePath);
      if (this.isValidMatch(candidatePath, browserFile.size)) {
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

    const homeMatch = narrowed.find((cp) => cp.startsWith(this.homeDirectory));
    if (homeMatch) return homeMatch;

    return narrowed[0];
  }

  private async searchMdfind(fileName: string): Promise<string[]> {
    const { stdout } = await execFileAsync('mdfind', ['-name', fileName], { timeout: PROCESS_TIMEOUT_MS });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  }

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

  private async searchLocate(fileName: string): Promise<string[]> {
    const cmd = this.isCommandAvailable('plocate') ? 'plocate' : 'locate';
    const args = cmd === 'plocate' ? ['-b', fileName] : ['-b', '-i', fileName];
    const { stdout } = await execFileAsync(cmd, args, { timeout: PROCESS_TIMEOUT_MS });
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  }

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
