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

// Each referral is its own key (`ref:<inviter>:<friend>`), so concurrent registrations never overwrite each other.
async function getFriends(env, id) {
  const friends = [];
  let cursor;
  do {
    const page = await env.REFS.list({ prefix: `ref:${id}:`, cursor });
    for (const k of page.keys) friends.push({ id: k.name.split(':')[2], name: (k.metadata && k.metadata.name) || '', ts: (k.metadata && k.metadata.ts) || 0 });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return friends.sort((a, b) => a.ts - b.ts);
}

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

    if (path.endsWith('/register')) {
      // `by:<uid>` is set on a user's first contact (register or stats), so only brand-new users can be referred.
      const existing = await env.REFS.get(`by:${uid}`);
      if (existing) return json({ ok: false, referredBy: existing === '-' ? '' : existing }, 200, origin);

      // Only the signed start_param is trusted (requires the t.me/<bot>/<app>?startapp=ref_<id> link).
      const ref = String(auth.startParam || '').replace(/^ref_?/, '');
      if (!/^\d{1,20}$/.test(ref) || ref === uid) {
        await env.REFS.put(`by:${uid}`, '-');
        return json({ ok: false, referredBy: '' }, 200, origin);
      }
      const name = [auth.user.first_name, auth.user.last_name].filter(Boolean).join(' ').slice(0, 64);
      // Write the referral before `by:` so a failed second write can be retried safely (puts are idempotent).
      await env.REFS.put(`ref:${ref}:${uid}`, '1', { metadata: { name, ts: Date.now() } });
      await env.REFS.put(`by:${uid}`, ref);
      return json({ ok: true, referredBy: ref }, 200, origin);
    }

    if (path.endsWith('/stats')) {
      if (!(await env.REFS.get(`by:${uid}`))) await env.REFS.put(`by:${uid}`, '-');
      const friends = await getFriends(env, uid);
      return json({ count: friends.length, friends: friends.slice(-50) }, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
