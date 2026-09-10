import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { WebDavClient, DavHttpError } from './client.mjs';

const files = new Map();
const seen = [];
const server = createServer(async (req, res) => {
  seen.push([req.method, req.url]);
  if (req.url === '/slow') return;
  if (req.url === '/redirect') { res.writeHead(302, { Location: '/leaked' }); return res.end(); }
  if (req.url === '/large') return res.end('x'.repeat(2000));
  if (req.url === '/truncated') { res.writeHead(200, { 'Content-Length': 100 }); res.write('a'); return setTimeout(() => res.destroy(), 5); }
  if (req.headers.authorization !== 'Basic ' + Buffer.from('user:secret').toString('base64')) {
    res.writeHead(401); return res.end('authentication required');
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  switch (req.method) {
    case 'MKCOL': files.set(req.url, null); res.writeHead(201); break;
    case 'PUT':
      if (req.headers['if-none-match'] === '*' && files.has(req.url)) { res.writeHead(412); break; }
      files.set(req.url, body); res.writeHead(201); break;
    case 'GET': case 'HEAD':
      if (!files.has(req.url)) { res.writeHead(404); break; }
      res.setHeader('ETag', '"v1"'); res.end(files.get(req.url)); return;
    case 'COPY': case 'MOVE': {
      const target = new URL(req.headers.destination).pathname;
      if (!files.has(req.url)) { res.writeHead(404); break; }
      if (files.has(target) && req.headers.overwrite === 'F') { res.writeHead(412); break; }
      files.set(target, files.get(req.url));
      if (req.method === 'MOVE') files.delete(req.url);
      res.writeHead(201); break;
    }
    case 'DELETE': files.delete(req.url); res.writeHead(204); break;
    case 'OPTIONS': res.setHeader('DAV', '1'); break;
    case 'PROPFIND':
      assert.equal(req.headers.depth, '1');
      assert.match(body.toString(), /<D:allprop\/>/);
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      res.end('<D:multistatus xmlns:D="DAV:"><D:response><D:href>/folder/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype><D:displayname>A &amp; B</D:displayname></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>'); return;
    default: res.writeHead(405);
  }
  res.end();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const client = new WebDavClient(origin, { username: 'user', password: 'secret' });
const results = [];
async function test(name, fn) { await fn(); results.push({ name, passed: true }); }
try {
  await test('binary file lifecycle, Unicode paths, conditional writes, copy/move and metadata', async () => {
    await client.mkdir('/folder/');
    const data = Buffer.from([0, 255, 13, 10, 128]);
    await client.put('/folder/中文 %.bin', data);
    assert.deepEqual((await client.get('/folder/中文 %.bin')).body, data);
    assert.equal((await client.head('/folder/中文 %.bin')).headers.etag, '"v1"');
    await assert.rejects(client.put('/folder/中文 %.bin', 'changed', { headers: { 'If-None-Match': '*' } }), e => e.response.status === 412);
    await client.copy('/folder/中文 %.bin', '/copy');
    await assert.rejects(client.copy('/folder/中文 %.bin', '/copy'), e => e.response.status === 412);
    await client.move('/copy', '/moved');
    assert.deepEqual((await client.get('/moved')).body, data);
    await assert.rejects(client.get('/copy'), e => e.response.status === 404);
    await client.remove('/moved');
    assert.equal((await client.options()).headers.dav, '1');
  });
  await test('MoonBit multistatus parser receives live HTTP body', async () => {
    const r = await client.propfind('/folder/');
    assert.equal(r.resources[0].href, '/folder/');
    assert.equal(r.resources[0].properties[0].value, 'collection');
    assert.equal(r.resources[0].properties[1].value, 'A & B');
  });
  await test('authentication and redirects return errors without replay', async () => {
    await assert.rejects(new WebDavClient(origin).get('/'), e => e instanceof DavHttpError && e.response.status === 401);
    await assert.rejects(client.get('/redirect'), e => e.response.status === 302);
    assert(!seen.some(x => x[1] === '/leaked'));
  });
  await test('timeout, cancellation, response bound and truncated stream', async () => {
    await assert.rejects(new WebDavClient(origin, { timeout: 40 }).get('/slow'), /timed out/);
    const abort = new AbortController();
    const pending = client.get('/slow', { signal: abort.signal });
    abort.abort(); await assert.rejects(pending, { name: 'AbortError' });
    await assert.rejects(new WebDavClient(origin, { maxResponseBytes: 50 }).get('/large'), /limit/);
    await assert.rejects(client.get('/truncated'));
  });
  await test('invalid request parameters never reach server', async () => {
    const count = seen.length;
    await assert.rejects(client.get('relative'));
    await assert.rejects(client.propfind('/', { depth: 1.5 }));
    assert.throws(() => client.copy('/', '/dest', { overwrite: 'yes' }));
    await assert.rejects(client.put('/', 'body', { headers: { Host: 'evil' } }));
    assert.equal(seen.length, count);
  });
  await writeFile(new URL('../evidence/network-focused-validation.json', import.meta.url), JSON.stringify({
    date: new Date().toISOString(), passed: results.length, results,
    server: 'local purpose-built HTTP fixture', independentServer: false, tlsTested: false,
  }, null, 2) + '\n');
  console.log(`${results.length} focused network groups passed`);
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
