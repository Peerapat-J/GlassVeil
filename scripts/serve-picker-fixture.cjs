// Local, allowlisted fixture server; no dependency install or extension build.
const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const manifest = require('../manifest.json');
const files = new Map([
    ['/', 'tests/manual/picker-input.html'],
    ['/fixture.js', 'tests/manual/picker-fixture.js'],
    ['/frame', 'tests/manual/picker-frame.html'],
    ...manifest.content_scripts[0].js.map(file => [`/${file}`, file]),
    ['/content/content.css', 'content/content.css'],
    ['/icons/icon-32.png', 'icons/icon-32.png']
]);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
for (const port of [8765, 8766]) {
    const server = http.createServer(async (request, response) => {
        const file = files.get(new URL(request.url, 'http://127.0.0.1').pathname);
        if (!file) { response.writeHead(404); response.end('Not found'); return; }
        try {
            const data = await readFile(resolve(__dirname, '..', file));
            const suffix = file.slice(file.lastIndexOf('.'));
            response.writeHead(200, { 'Content-Type': types[suffix] || 'text/plain', 'Cache-Control': 'no-store' });
            response.end(data);
        } catch { response.writeHead(500); response.end('Could not read fixture'); }
    });
    server.on('error', error => { console.error(`Fixture port ${port}: ${error.message}`); process.exit(1); });
    server.listen(port, '127.0.0.1', () => {
        if (port === 8765) console.log('Extension fixture: http://127.0.0.1:8765/\nStandalone demo: http://127.0.0.1:8765/?demo=1\nPress Ctrl+C to stop.');
    });
}
