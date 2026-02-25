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
