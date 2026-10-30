import { createServer } from 'node:http';
import { createStore } from './notes.js';

const MAX_BODY = 4096;

export function createApp(store = createStore()) {
  return createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/notes') {
        return send(200, store.list());
      }

      if (req.method === 'POST' && url.pathname === '/notes') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > MAX_BODY) return send(413, { error: 'body too large' });
        }
        const { text } = JSON.parse(raw);
        return send(201, store.add(text));
      }

      const match = url.pathname.match(/^\/notes\/(\d+)$/);
      if (req.method === 'DELETE' && match) {
        return store.remove(Number(match[1])) ? send(204, {}) : send(404, { error: 'not found' });
      }

      return send(404, { error: 'not found' });
    } catch (err) {
      if (err instanceof RangeError || err instanceof SyntaxError) {
        return send(400, { error: 'invalid input' });
      }
      return send(500, { error: 'internal error' });
    }
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  createApp().listen(Number(process.env.PORT) || 3000);
}
