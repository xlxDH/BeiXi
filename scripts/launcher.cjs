const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, 'site');
const port = 41731;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
const openBrowser = () => {
  if (process.env.BEIXI_NO_OPEN) return;
  const url = `http://127.0.0.1:${port}/`;
  const child = process.platform === 'win32' ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, stdio: 'ignore' }) : spawn('open', [url], { stdio: 'ignore' });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
};
const server = http.createServer((req, res) => {
  if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(403); return res.end(); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/__beixi_health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ app: 'beixi', version: '1.1.1' }));
  }
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
});
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__beixi_health`, { signal: AbortSignal.timeout(2000) });
      if ((await response.json()).app === 'beixi') { openBrowser(); return; }
    } catch { /* Another process owns the port. */ }
  }
  console.error(`Cannot start BeiXi on port ${port}: ${error.code}. Close the conflicting program and try again.`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`BeiXi is running: http://127.0.0.1:${port}/\nKeep this window open. Close it or press Ctrl+C to stop.`);
  openBrowser();
});
