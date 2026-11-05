// Test-only stand-in for Supabase, used to click through the real app in a
// browser. Runs the real migration in embedded Postgres and answers just the
// REST and auth calls the app makes, as the signed-in user's role, so row
// security and every server rule apply exactly as they would live.
//
//   node tests/e2e/fake-supabase.mjs   (listens on http://localhost:54321)
//
// Not used by the live site and never deployed.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const PORT = Number(process.env.PORT || 54321);
const migrations = ['202611040001_sportsbook.sql', '202611050001_site_look.sql']
  .map((name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));

const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users(id uuid primary key, email text unique, password text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon,authenticated,service_role;
  grant execute on function auth.uid() to anon,authenticated,service_role;
  grant usage on schema public to anon,authenticated,service_role;`);
for (const migration of migrations) await db.exec(migration);

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const subOf = (req) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub || null; } catch { return null; }
};
const session = (user) => ({
  access_token: jwt(user.id), refresh_token: `r-${user.id}`, token_type: 'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
});

// Serialize all database work: one connection, one request at a time.
let queue = Promise.resolve();
const serial = (fn) => (queue = queue.then(fn, fn));

async function asRole(sub, role, fn) {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub || '']);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}

const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`); return `"${s}"`; };

function buildSelect(table, params) {
  const values = [];
  const where = [];
  let order = '';
  let limit = '';
  const cols = (params.get('select') || '*').split(',').map((c) => (c === '*' ? '*' : ident(c.trim()))).join(',');
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const [op, ...rest] = raw.split('.');
    const val = rest.join('.');
    if (op === 'eq') { values.push(val); where.push(`${ident(key)}::text = $${values.length}`); }
    else if (op === 'is') where.push(`${ident(key)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`);
    else throw new Error(`unsupported filter ${op}`);
  }
  if (params.get('order')) {
    order = ' order by ' + params.get('order').split(',').map((part) => {
      const [col, ...mods] = part.split('.');
      return `${ident(col)} ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}`;
    }).join(', ');
  }
  if (params.get('limit')) limit = ` limit ${Number(params.get('limit'))}`;
  return { sql: `select ${cols} from public.${ident(table)}${where.length ? ' where ' + where.join(' and ') : ''}${order}${limit}`, values };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': '*', ...headers,
  });
  res.end(body === undefined ? '' : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

const readBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
});

const fail = (res, e) => send(res, 400, { code: e.code || 'P0001', message: String(e.message || e).replace(/^error:\s*/i, ''), details: null, hint: null });

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    // ---- auth ----
    if (path === '/auth/v1/signup' && req.method === 'POST') {
      const { email, password } = await readBody(req);
      const user = await serial(async () => {
        const id = randomUUID();
        await db.query('insert into auth.users(id,email,password) values ($1,$2,$3)', [id, email, password]);
        return { id, email };
      });
      return send(res, 200, session(user));
    }
    if (path === '/auth/v1/token' && req.method === 'POST') {
      const body = await readBody(req);
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const id = String(body.refresh_token || '').replace(/^r-/, '');
        const row = (await serial(() => db.query('select id,email from auth.users where id::text=$1', [id]))).rows[0];
        return row ? send(res, 200, session(row)) : send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      }
      const row = (await serial(() => db.query('select id,email from auth.users where email=$1 and password=$2', [body.email, body.password]))).rows[0];
      return row ? send(res, 200, session(row)) : send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
    }
    if (path === '/auth/v1/user') {
      const row = (await serial(() => db.query('select id,email from auth.users where id::text=$1', [subOf(req)]))).rows[0];
      return row ? send(res, 200, session(row).user) : send(res, 401, { message: 'not signed in' });
    }
    if (path === '/auth/v1/logout') return send(res, 204);

    // ---- test hooks (service role) ----
    if (path === '/test/sync' && req.method === 'POST') {
      const payload = await readBody(req);
      const r = await serial(() => asRole(null, 'service_role', () => db.query('select public.sync_board($1::jsonb) r', [JSON.stringify(payload)])));
      return send(res, 200, r.rows[0].r);
    }
    if (path === '/test/sql' && req.method === 'POST') {
      const { sql } = await readBody(req);
      const r = await serial(() => db.query(sql));
      return send(res, 200, r.rows);
    }

    // ---- rest ----
    const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpc && req.method === 'POST') {
      const args = await readBody(req);
      const names = Object.keys(args);
      const call = `select public.${ident(rpc[1])}(${names.map((n, i) => `${ident(n)} => $${i + 1}`).join(', ')}) as r`;
      const values = names.map((n) => (typeof args[n] === 'object' && args[n] !== null ? JSON.stringify(args[n]) : args[n]));
      const r = await serial(() => asRole(subOf(req), subOf(req) ? 'authenticated' : 'anon', () => db.query(call, values)));
      return send(res, 200, r.rows[0].r);
    }
    const table = path.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (table && req.method === 'GET') {
      const { sql, values } = buildSelect(table[1], url.searchParams);
      const r = await serial(() => asRole(subOf(req), subOf(req) ? 'authenticated' : 'anon', () => db.query(sql, values)));
      return send(res, 200, r.rows);
    }
    return send(res, 404, { message: `not handled: ${req.method} ${path}` });
  } catch (e) {
    return fail(res, e);
  }
});

server.listen(PORT, () => console.log(`fake supabase on http://localhost:${PORT}`));
