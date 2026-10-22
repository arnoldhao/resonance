import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const directory = resolve('.preview');
const port = Number(process.env.PORT ?? 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.xml': 'application/atom+xml; charset=utf-8', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const isAPI = pathname.startsWith('/api/');
  const isPublicData = isAPI || pathname === '/feed.xml' || pathname === '/feed.json';
  if (isPublicData) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD, OPTIONS', 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
  }
  try {
    const path = resolve(directory, `.${decodeURIComponent(pathname)}`);
    if (path !== directory && !path.startsWith(`${directory}${sep}`)) { res.writeHead(403).end(); return; }
    const file = (await stat(path)).isDirectory() ? resolve(path, 'index.html') : path;
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': pathname === '/feed.json' ? 'application/feed+json; charset=utf-8' : mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': isPublicData ? 'public, max-age=0, must-revalidate' : 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      res.writeHead(404, { 'Content-Type': isAPI ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8' });
      res.end(isAPI ? JSON.stringify({ error: 'not_found' }) : 'Not found. Run npm run preview first.');
      return;
    }
    console.error(error);
    res.writeHead(500).end('Local server error');
  }
}).listen(port, '127.0.0.1', () => console.log(`共振：http://127.0.0.1:${port}`));
