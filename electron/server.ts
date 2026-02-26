import express from 'express';
import cors from 'cors';
import { FileResolverService } from './services/file-resolver';
import type { BrowserFileInfo } from './services/file-resolver';

const fileResolver = new FileResolverService();

function isValidBrowserFileInfo(f: unknown): f is BrowserFileInfo {
  return (
    typeof f === 'object' && f !== null &&
    typeof (f as any).name === 'string' && (f as any).name.length > 0 &&
    typeof (f as any).webkitRelativePath === 'string' &&
    typeof (f as any).size === 'number' && (f as any).size >= 0 &&
    typeof (f as any).lastModified === 'number'
  );
}

export function createServer(port: number = 7771) {
  const app = express();

  app.use(cors({
    origin: ['https://app.evolphin.com', 'http://localhost:3000'],
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    const osInfo = fileResolver.detectOsInfo();
    const version = require('../package.json').version;
    res.json({ status: 'ok', version, osInfo });
  });

  app.post('/get-file-paths', async (req, res) => {
    try {
      const files: BrowserFileInfo[] = req.body?.files;

      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({ error: 'Request must include a non-empty "files" array' });
        return;
      }

      if (files.length > 1000) {
        res.status(400).json({ error: 'Maximum 1000 files per request' });
        return;
      }

      const invalidFile = files.find((f) => !isValidBrowserFileInfo(f));
      if (invalidFile) {
        res.status(400).json({
          error: 'Each file must have: string name (non-empty), string webkitRelativePath, number size (>= 0), number lastModified',
        });
        return;
      }

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

  const server = app.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`File resolver server running on port ${actualPort}`);
  });

  const actualPort = (server.address() as any)?.port ?? port;
  return { server, port: actualPort, app };
}
