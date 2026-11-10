// Miner Pro referral server (Cloudflare Worker + KV).
// Verifies Telegram Mini App initData, records who invited whom, and returns referral stats.
// Bindings: KV namespace REFS, secret BOT_TOKEN, optional var ALLOWED_ORIGIN.

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
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function getList(env, id) {
  return JSON.parse((await env.REFS.get(`list:${id}`)) || '[]');
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    if (request.method === 'OPTIONS') return json({}, 204, origin);
    if (request.method !== 'POST') return json({ error: 'method' }, 405, origin);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, origin); }
    const auth = await verifyInitData(body.initData, env.BOT_TOKEN);
    if (!auth) return json({ error: 'unauthorized' }, 401, origin);

    const uid = String(auth.user.id);
    const path = new URL(request.url).pathname.replace(/\/$/, '');

    if (path.endsWith('/register')) {
      const existing = await env.REFS.get(`by:${uid}`);
      if (existing) return json({ ok: false, referredBy: existing === '-' ? '' : existing }, 200, origin);

      const ref = String(auth.startParam || body.ref || '').replace(/^ref_?/, '');
      if (!/^\d{1,20}$/.test(ref) || ref === uid) {
        await env.REFS.put(`by:${uid}`, '-');
        return json({ ok: false, referredBy: '' }, 200, origin);
      }
      await env.REFS.put(`by:${uid}`, ref);
      const list = await getList(env, ref);
      if (!list.some((f) => f.id === uid)) {
        const name = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ').slice(0, 64);
        list.push({ id: uid, name, ts: Date.now() });
        await env.REFS.put(`list:${ref}`, JSON.stringify(list));
      }
      return json({ ok: true, referredBy: ref }, 200, origin);
    }

    if (path.endsWith('/stats')) {
      const list = await getList(env, uid);
      return json({ count: list.length, friends: list.slice(-50) }, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
