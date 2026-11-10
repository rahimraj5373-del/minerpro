// Miner Pro referral server (Cloudflare Worker + D1).
// Verifies Telegram Mini App initData, records who invited whom, and returns referral stats.
// Bindings: D1 database DB, secret BOT_TOKEN, optional var ALLOWED_ORIGIN.

const MAX_AGE_SECONDS = 7 * 24 * 3600;
const enc = new TextEncoder();

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
const hex = (buf) => [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');

async function verifyInitData(initData, botToken) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  if (hex(await hmac(secret, check)) !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && user.id ? { user, startParam: params.get('start_param') || '' } : null;
  } catch {
    return null;
  }
}

function json(body, status, origin) {
  return new Response(body == null ? null : JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// One row per user; the PRIMARY KEY makes the first INSERT win atomically,
// so a user can only ever be recorded once and only one inviter is credited.
const SCHEMA = 'CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, inviter TEXT, name TEXT, ts INTEGER NOT NULL)';
const INDEX = 'CREATE INDEX IF NOT EXISTS users_inviter ON users (inviter, ts)';
let ready;
const init = (db) => (ready ||= db.batch([db.prepare(SCHEMA), db.prepare(INDEX)]).catch((e) => { ready = null; throw e; }));

const insertUser = (db, uid, inviter, name) =>
  db.prepare('INSERT OR IGNORE INTO users (uid, inviter, name, ts) VALUES (?1, ?2, ?3, ?4)').bind(uid, inviter, name, Date.now()).run();

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return json(null, 204, origin);
    if (request.method !== 'POST') return json({ error: 'method' }, 405, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, origin); }
    const auth = await verifyInitData(body.initData, env.BOT_TOKEN);
    if (!auth) return json({ error: 'unauthorized' }, 401, origin);

    const uid = String(auth.user.id);
    const path = new URL(request.url).pathname.replace(/\/$/, '');

    const db = env.DB;
    await init(db);
    const name = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ').slice(0, 64);

    if (path.endsWith('/register')) {
      // Only the signed start_param is trusted (requires the t.me/<bot>/<app>?startapp=ref_<id> link).
      const ref = String(auth.startParam || '').replace(/^ref_?/, '');
      const inviter = /^\d{1,20}$/.test(ref) && ref !== uid ? ref : null;
      // Users already seen (by register or stats) are ignored, so only brand-new users can be referred.
      const res = await insertUser(db, uid, inviter, name);
      if (res.meta.changes === 1) return json({ ok: !!inviter, referredBy: inviter || '' }, 200, origin);
      const row = await db.prepare('SELECT inviter FROM users WHERE uid = ?1').bind(uid).first();
      return json({ ok: false, referredBy: (row && row.inviter) || '' }, 200, origin);
    }

    if (path.endsWith('/stats')) {
      await insertUser(db, uid, null, name);
      const c = await db.prepare('SELECT COUNT(*) AS n FROM users WHERE inviter = ?1').bind(uid).first();
      const { results } = await db
        .prepare('SELECT uid AS id, name, ts FROM users WHERE inviter = ?1 ORDER BY ts DESC LIMIT 50')
        .bind(uid).all();
      return json({ count: (c && c.n) || 0, friends: results.reverse() }, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
