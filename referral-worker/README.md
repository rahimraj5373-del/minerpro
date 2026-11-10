# Miner Pro referral server

The web app is a static GitHub Pages site, so referrals between *different* users need a small server.
This Cloudflare Worker (free tier is enough) verifies the Telegram user, records who invited whom in a D1 (SQLite) database, and returns each user's referral count.

## Deploy

```bash
npm i -g wrangler
wrangler login
wrangler d1 create minerpro-referrals     # copy the database_id into wrangler.toml
wrangler secret put BOT_TOKEN            # token of @CryptMinerPro_bot from @BotFather
wrangler deploy                          # prints https://minerpro-referrals.<you>.workers.dev
```

Then in `index.html` set:

```js
REF_API: 'https://minerpro-referrals.<you>.workers.dev',
APP_NAME: 'your_app_short_name',   // required: from @BotFather /newapp, so links open the Mini App with ?startapp=ref_<id>
```

The server only trusts the inviter ID inside Telegram's signed `start_param`, which is only present for `startapp` links, so `APP_NAME` must be set.
Only users the server has never seen before can be counted as referrals, and each user is credited to at most one inviter (the table is created automatically on first request).

Without `REF_API` the app runs in demo mode: referrals are only stored on the current device.

## API

All requests are `POST` with JSON `{ "initData": Telegram.WebApp.initData }`.

| Path        | Response                                   |
|-------------|--------------------------------------------|
| `/register` | `{ ok, referredBy }` — records the inviter from `start_param` (`ref_<id>`) once per user |
| `/stats`    | `{ count, friends: [{ id, name, ts }] }`   |
