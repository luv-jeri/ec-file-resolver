import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';

describe('HTTP Server', () => {
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    const mod = await import('./server');
    const result = mod.createServer(0);
    server = result.server;
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => {
    server?.close();
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
