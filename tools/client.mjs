import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import * as core from '../web/engine.mjs';

function checked(value, json = false) {
  if (value.startsWith('ERROR:')) throw new Error(value);
  return json ? JSON.parse(value) : value;
}
export class DavHttpError extends Error {
  constructor(response) {
    super(`WebDAV HTTP ${response.status}`);
    this.name = 'DavHttpError';
    this.response = response;
  }
}

/** Paths are raw absolute server paths, not encoded URLs. No redirect/retry of writes. */
export class WebDavClient {
  constructor(origin, { username, password = '', token, timeout = 10000,
    maxResponseBytes = 8 * 1024 * 1024, ca, signal } = {}) {
    this.origin = new URL(origin);
    if (!['http:', 'https:'].includes(this.origin.protocol) || this.origin.username ||
        this.origin.password || this.origin.pathname !== '/' || this.origin.search || this.origin.hash)
      throw new TypeError('HTTP(S) origin required; pass paths to individual methods');
    if (!Number.isSafeInteger(timeout) || timeout < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1)
      throw new TypeError('positive timeout and response limit required');
    if (username !== undefined && (typeof username !== 'string' || username.includes(':') || typeof password !== 'string'))
      throw new TypeError('invalid Basic credentials');
    if (token !== undefined && (typeof token !== 'string' || !token || /[\r\n]/.test(token)))
      throw new TypeError('invalid bearer token');
    if (username !== undefined && token !== undefined) throw new TypeError('choose Basic or Bearer');
    this.authorization = token !== undefined ? `Bearer ${token}` : username !== undefined ?
      `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` : undefined;
    Object.assign(this, { timeout, maxResponseBytes, ca, signal });
  }

  async request(method, rawPath, { body = Buffer.alloc(0), headers = {}, signal = this.signal } = {}) {
    return this.send({ verb: method, target: checked(core.encode_path(rawPath)), headers, body }, signal);
  }

  send(spec, signal = this.signal) {
    const body = typeof spec.body === 'string' ? Buffer.from(spec.body) : spec.body;
    if (!Buffer.isBuffer(body) && !(body instanceof Uint8Array)) throw new TypeError('body must be string or bytes');
    const headers = { ...spec.headers };
    for (const key of Object.keys(headers)) {
      if (['host', 'content-length', 'transfer-encoding', 'authorization'].includes(key.toLowerCase()))
        throw new TypeError(`managed header: ${key}`);
    }
    headers['Content-Length'] = body.byteLength;
    if (this.authorization) headers.Authorization = this.authorization;
    return new Promise((resolve, reject) => {
      let timer;
      const transport = this.origin.protocol === 'https:' ? https : http;
      const req = transport.request({ protocol: this.origin.protocol, hostname: this.origin.hostname.replace(/^\[|\]$/g, ''),
        port: this.origin.port || undefined, method: spec.verb, path: spec.target, headers, signal,
        ca: this.ca, rejectUnauthorized: true, checkServerIdentity: tls.checkServerIdentity }, res => {
        const chunks = [];
        let size = 0;
        res.on('data', chunk => {
          size += chunk.length;
          if (size > this.maxResponseBytes) {
            const error = new Error('WebDAV response limit exceeded');
            reject(error);
            req.destroy(error);
            res.destroy();
          }
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          clearTimeout(timer);
          const result = { status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) };
          if (result.status >= 200 && result.status < 300) resolve(result);
          else reject(new DavHttpError(result));
        });
      });
      timer = setTimeout(() => req.destroy(new Error('WebDAV request timed out')), this.timeout);
      req.on('error', reject);
      req.on('close', () => clearTimeout(timer));
      req.end(body);
    });
  }

  get(path, options) { return this.request('GET', path, options); }
  head(path, options) { return this.request('HEAD', path, options); }
  put(path, body, options = {}) { return this.request('PUT', path, { ...options, body }); }
  mkdir(path, options) { return this.request('MKCOL', path, options); }
  remove(path, options) { return this.request('DELETE', path, options); }
  options(path = '/', options) { return this.request('OPTIONS', path, options); }
  async propfind(path, { depth = 1, signal = this.signal } = {}) {
    if (depth !== 0 && depth !== 1) throw new TypeError('depth must be 0 or 1');
    const response = await this.send(checked(core.find_request(path, depth), true), signal);
    if (response.status !== 207) throw new DavHttpError(response);
    return { ...response, resources: checked(core.resources(new TextDecoder('utf-8', { fatal: true }).decode(response.body)), true) };
  }
  copy(path, destination, options) { return this.transfer('COPY', path, destination, options); }
  move(path, destination, options) { return this.transfer('MOVE', path, destination, options); }
  transfer(verb, path, destination, { overwrite = false, signal = this.signal } = {}) {
    if (typeof overwrite !== 'boolean') throw new TypeError('overwrite must be boolean');
    const url = this.origin.origin + checked(core.encode_path(destination));
    return this.send(checked(core.transfer_request(verb, path, url, overwrite), true), signal);
  }
}
