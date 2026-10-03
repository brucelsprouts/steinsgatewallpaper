// Minimal static server for previewing the wallpaper: node tools/serve.js [port]
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const port = Number(process.argv[2]) || Number(process.env.PORT) || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css' };

// A request's body, or null if it's over `limit` bytes.
function body(req, limit, done) {
  const chunks = [];
  let size = 0;
  req.on('data', c => { size += c.length; if (size <= limit) chunks.push(c); });
  req.on('end', () => done(size <= limit ? Buffer.concat(chunks) : null));
}

// A rig saved by tools/rig.html: { rig: 'wallpaper/img/makise-rig.js', files: { name: text
// (the script) or base64 (a mask) } }. Only the rig's own script and masks are written,
// beside it, and masks of the rig it no longer uses are removed.
function saveRig(data) {
  const m = /^wallpaper\/img\/([\w.-]+)-rig\.js$/.exec(data.rig || '');
  if (!m || !data.files) throw new Error('not a rig');
  const dir = path.join(root, 'wallpaper', 'img'), base = m[1];
  const mask = name => name.startsWith(`${base}-rig-`) && /^\d+\.png$/.test(name.slice(base.length + 5));
  const names = Object.keys(data.files);
  if (!names.includes(`${base}-rig.js`) || !names.every(n => n === `${base}-rig.js` || mask(n))) throw new Error('unexpected files');
  for (const n of names) {
    const v = String(data.files[n]);
    fs.writeFileSync(path.join(dir, n), n.endsWith('.js') ? v : Buffer.from(v, 'base64'));
  }
  for (const n of fs.readdirSync(dir)) if (mask(n) && !names.includes(n)) fs.unlinkSync(path.join(dir, n));
  return names;
}

http.createServer((req, res) => {
  // POST /frame/<clip>/<n>.jpg stores a recorded frame under shots/frames/<clip>/.
  const fm = req.method === 'POST' && req.url.match(/^\/frame\/([\w-]+)\/(\d+\.jpg)$/);
  if (fm) {
    const dir = path.join(root, 'shots', 'frames', fm[1]);
    fs.mkdirSync(dir, { recursive: true });
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { fs.writeFileSync(path.join(dir, fm[2]), Buffer.concat(chunks)); res.end('ok'); });
    return;
  }
  // POST /rig saves a rig from the rig editor.
  if (req.method === 'POST' && req.url === '/rig') {
    return body(req, 64 << 20, b => {
      try {
        if (!b) throw new Error('too big');
        const wrote = saveRig(JSON.parse(b.toString('utf8')));
        console.log(`saved ${wrote.join(', ')}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, wrote }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  // A folder serves its index.html (the repo root opens the preview).
  const file = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
