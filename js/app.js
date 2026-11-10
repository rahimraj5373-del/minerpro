(function () {
  'use strict';

  /* ---------- Settings (এখানে বদলানো যাবে) ---------- */
  var CFG = {
    APP_TITLE: 'Miner Pro',
    BOT: 'CryptMinerPro_bot',
    LINKS: {
      tg: 'https://t.me/tanjirul0123',
      fb: 'https://www.facebook.com/share/19u3E68ctn/',
      x:  'https://x.com/tanjirul_king'
    },
    COIN: 'GRC',
    MIN_WITHDRAW: 1000,
    MIN_CLAIM: 0.01,      // minimum unclaimed amount for "Claim to Withdraw"
    DAILY: 20,
    TASK_REWARD: 100,
    VERIFY_SECONDS: 8,

    // Live market card (DexScreener). TOKEN = jetton master address on TON.
    MARKET: { NAME: 'Grouche Coin', SYMBOL: 'GRC', CHAIN: 'ton', TOKEN: 'EQAu7qxfVgMg0tpnosBpARYOG--W1EUuX_5H_vOQtTVuHnrn', REFRESH_SECONDS: 60 },

    // Adsgram (https://adsgram.ai): put your block ID here to enable the "Watch & click" task.
    ADSGRAM_BLOCK_ID: '',
    AD_REWARD: 10,
    AD_LIMIT: 8,
    AD_WINDOW_HOURS: 12,

    // TON Connect manifest (must be publicly reachable)
    TONCONNECT_MANIFEST: 'https://rahimraj5373-del.github.io/minerpro/tonconnect-manifest.json',

    REF_REWARD: 200,     // coins for the inviter, per successful referral
    REF_BONUS: 50,       // welcome bonus for the invited friend
    // Mini App short name from @BotFather (/newapp). If set, links open the app directly: t.me/BOT/APP?startapp=ref_ID
    APP_NAME: '',
    // Referral server URL (see referral-worker/). Empty = referrals are stored only on this device (demo mode).
    REF_API: '',
    REF_SYNC_SECONDS: 30
  };

  var TASKS = [
    { id: 'tg', group: 'tg', icon: 'i-send', title: 'Join our Telegram channel', desc: 'Join @tanjirul0123', url: CFG.LINKS.tg, tme: true },
    { id: 'fb', group: 'social', icon: 'i-globe', title: 'Follow us on Facebook', desc: 'Follow our page', url: CFG.LINKS.fb },
    { id: 'x',  group: 'social', icon: 'i-x', title: 'Follow us on X', desc: 'Follow @tanjirul_king', url: CFG.LINKS.x }
  ];

  var PACKAGES = [
    { id: 'p1', name: 'BASIC MINER v1',   days: 7,  perDay: 22.88, cost: 100 },
    { id: 'p2', name: 'PRO MINER X2',     days: 15, perDay: 34.32, cost: 300 },
    { id: 'p3', name: 'CYBER ULTRA RIG',  days: 30, perDay: 91.53, cost: 800 }
  ];

  var FAQ = [
    ['How do I earn ' + CFG.COIN + '?', 'Complete quests, claim the daily bonus, watch ads, invite friends and run cloud miner packages.'],
    ['How does cloud mining work?', 'Buy a miner package with your balance. It mines a fixed amount every day for its duration. Tap "Claim to Withdraw" to move mined coins to your balance.'],
    ['How do referrals work?', 'Share your invite link. When a new user opens the app with it, you get +' + CFG.REF_REWARD + ' ' + CFG.COIN + ' and your friend gets +' + CFG.REF_BONUS + ' ' + CFG.COIN + '.'],
    ['How do I withdraw?', 'Connect your TON wallet, then tap "Withdraw" on Home. The minimum is ' + CFG.MIN_WITHDRAW + ' ' + CFG.COIN + '. Requests are reviewed and paid to your wallet.'],
    ['Is there any fee?', 'No. Connecting your wallet only shares your address. We never ask for your seed phrase or a payment to enter.'],
    ['Need help?', 'Contact us in our Telegram community from the You tab.']
  ];

  /* ---------- Telegram ---------- */
  var tg = (window.Telegram && window.Telegram.WebApp) || null;
  if (tg) {
    try { tg.ready(); tg.expand(); } catch (e) {}
    try { tg.setHeaderColor('#07080f'); tg.setBackgroundColor('#07080f'); } catch (e) {}
  }
  var tu = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || null;
  var uid = tu ? String(tu.id) : 'guest';
  var fullName = tu ? ((tu.first_name || '') + (tu.last_name ? ' ' + tu.last_name : '')).trim() || 'Miner' : 'Miner';
  var uname = tu && tu.username ? '@' + tu.username : '';

  /* ---------- Storage ---------- */
  var KEY = 'minerpro_v2_' + uid;
  var S = {
    coins: 0, earned: 0,
    pkgs: {}, unclaimed: 0, mineAt: 0,
    tasks: {}, daily: 0, ads: { start: 0, n: 0 },
    wallet: '', wd: [], sound: true,
    refBy: '', refChecked: false, refCount: 0, refCredited: 0, refEarned: 0, refFriends: []
  };
  var raw = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) { var o = JSON.parse(raw); for (var k in o) S[k] = o[k]; }
  } catch (e) {}
  if (!S.joined) S.joined = raw ? 1 : Date.now();   // 1 = ইউজার এই আপডেটের আগে থেকেই আছে
  // পুরনো ভার্সনের মাইনিং সেশনের জমা কয়েন ব্যালেন্সে যোগ করা
  if (S.mineEnd) {
    var oldRate = 10; if (S.rigs) { if (S.rigs.r1) oldRate += 10; if (S.rigs.r2) oldRate += 35; if (S.rigs.r3) oldRate += 100; }
    var oldAmt = (S.pending || 0) + Math.max(0, Math.min(Date.now(), S.mineEnd) - S.mineStart) / 36e5 * oldRate;
    S.coins += oldAmt; S.earned += oldAmt;
  }
  delete S.mineEnd; delete S.mineStart; delete S.pending; delete S.rigs;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function setAll(sel, txt) { $$(sel).forEach(function (el) { el.textContent = txt; }); }
  function fmt(n, d) { d = d == null ? 2 : d; return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hms(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); }
  function compactUsd(n) {
    if (n == null || isNaN(n)) return '—';
    var a = Math.abs(n), u = ['', 'K', 'M', 'B', 'T'], i = 0;
    while (a >= 1000 && i < u.length - 1) { a /= 1000; n /= 1000; i++; }
    return '$' + n.toFixed(2) + u[i];
  }
  function priceUsd(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1) return '$' + fmt(n, 2);
    if (n === 0) return '$0.00';
    return '$' + Number(n.toPrecision(3)).toFixed(Math.min(12, Math.max(2, 2 - Math.floor(Math.log10(n)))));
  }
  function haptic(t) { try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(t || 'success'); } catch (e) {} }
  function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(id) { return '<svg class="i"><use href="#' + id + '"/></svg>'; }
  function coinIc() { return '<svg class="coin-ic"><use href="#coin"/></svg>'; }

  var toastTimer;
  function toast(msg, kind) {
    var t = $('toast'); t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, 2600);
  }

  function setAvatar(el) {
    el.innerHTML = '';
    if (tu && tu.photo_url) {
      var img = document.createElement('img'); img.src = tu.photo_url; img.alt = '';
      img.onerror = function () { el.innerHTML = ''; el.textContent = fullName.charAt(0).toUpperCase(); };
      el.appendChild(img);
    } else { el.textContent = fullName.charAt(0).toUpperCase(); }
  }

  /* ---------- Sound (কোনো ফাইল লাগে না, ব্রাউজারই সুর বানায়) ---------- */
  var ac = null, master = null, clickBuf = null, unlocked = false;
  function audio() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ac = new AC(); } catch (e2) { return null; } }
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  function tone(freq, delay, dur, type, vol) {
    if (!S.sound) return;
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  // ক্লিকের শব্দ একবারই তৈরি হয়ে মেমোরিতে থাকে, তাই প্রতিবার বাজাতে কোনো ল্যাগ হয় না
  function buildClick(a) {
    var sr = a.sampleRate, n = Math.floor(sr * 0.16), b = a.createBuffer(1, n, sr), d = b.getChannelData(0);
    var p1 = 0, p2 = 0;
    for (var i = 0; i < n; i++) {
      var t = i / sr;
      var f = 520 + 1300 * Math.exp(-t * 38);
      p1 += 2 * Math.PI * f / sr; p2 += 2 * Math.PI * 1760 / sr;
      var pop = Math.sin(p1) * Math.exp(-t * 42) * 0.55;
      var tick = (Math.random() * 2 - 1) * Math.exp(-t * 1200) * 0.35;
      var shine = t > 0.018 ? Math.sin(p2) * Math.exp(-(t - 0.018) * 28) * 0.16 : 0;
      d[i] = pop + tick + shine;
    }
    return b;
  }
  function unlockAudio() {
    var a = audio(); if (!a) return;
    if (!clickBuf) clickBuf = buildClick(a);
    if (!unlocked) {
      try { var s0 = a.createBufferSource(); s0.buffer = a.createBuffer(1, 1, 22050); s0.connect(a.destination); s0.start(0); } catch (e) {}
      unlocked = true;
    }
  }
  var lastClick = 0;
  function playClick() {
    if (!S.sound) return;
    var now = Date.now(); if (now - lastClick < 35) return; lastClick = now;
    unlockAudio(); if (!ac || !clickBuf) return;
    var src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = clickBuf;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    g.gain.value = 0.55;
    src.connect(g); g.connect(master);
    src.start(0);
  }
  var sfx = {
    click:   playClick,
    success: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, .08 + i * .09, .25, 'sine', .16); }); },
    welcome: function () { [392, 523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * .12, .4, 'sine', .15); }); tone(1568, .72, .55, 'triangle', .08); },
    error:   function () { tone(220, .05, .18, 'sawtooth', .07); tone(170, .17, .22, 'sawtooth', .07); },
    referral: function () { [659, 784, 988, 1319, 1568].forEach(function (f, i) { tone(f, i * .07, .3, 'triangle', .12); }); }
  };

  // যেকোনো বাটন / লিংক / ইন্টারঅ্যাক্টিভ এলিমেন্টে চাপ দিলেই সাথে সাথে সুর বাজবে
  var INTERACTIVE = 'button, a[href], [role="button"], summary, select, label, input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"]';
  function interactiveTarget(e) {
    var el = e.target && e.target.closest ? e.target.closest(INTERACTIVE) : null;
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
    return el;
  }
  if (window.PointerEvent) {
    document.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (interactiveTarget(e)) playClick(); else unlockAudio();
    }, { capture: true, passive: true });
  } else {
    document.addEventListener('touchstart', function (e) { if (interactiveTarget(e)) playClick(); else unlockAudio(); }, { capture: true, passive: true });
    document.addEventListener('mousedown', function (e) { if (interactiveTarget(e)) playClick(); }, true);
  }
  document.addEventListener('keydown', function (e) {
    if (!e.repeat && (e.key === 'Enter' || e.key === ' ') && interactiveTarget(e)) playClick();
  }, true);
  ['touchend', 'click'].forEach(function (ev) { document.addEventListener(ev, unlockAudio, { capture: true, passive: true }); });

  function addCoins(n) { S.coins += n; S.earned += n; }

  /* ---------- Market (DexScreener) ---------- */
  var M = null;
  try { M = JSON.parse(localStorage.getItem('minerpro_market') || 'null'); } catch (e) {}
  function price() { return M && M.price ? M.price : 0; }
  var mkLoading = false;
  function loadMarket(manual) {
    if (!CFG.MARKET.TOKEN || mkLoading) return;
    mkLoading = true; $('mkRefresh').classList.add('spin');
    fetch('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(CFG.MARKET.TOKEN))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var pairs = (j && j.pairs || []).filter(function (p) { return p.chainId === CFG.MARKET.CHAIN && p.baseToken && p.baseToken.address === CFG.MARKET.TOKEN; });
        if (!pairs.length) throw new Error('no pairs');
        pairs.sort(function (a, b) { return ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0); });
        var p = pairs[0], vol = 0;
        pairs.forEach(function (x) { vol += (x.volume && x.volume.h24) || 0; });
        M = { price: parseFloat(p.priceUsd) || 0, chg: p.priceChange ? p.priceChange.h24 : null, cap: p.marketCap, fdv: p.fdv, liq: p.liquidity && p.liquidity.usd, vol: vol, url: p.url, ts: Date.now() };
        try { localStorage.setItem('minerpro_market', JSON.stringify(M)); } catch (e) {}
        renderMarket(); renderText(); renderPackages();
        if (manual) toast('Market updated', 'ok');
      })
      .catch(function () { if (manual) { sfx.error(); toast('Could not load market data', 'err'); } if (!M) $('mkUpdated').textContent = 'Market data unavailable'; })
      .then(function () { mkLoading = false; $('mkRefresh').classList.remove('spin'); });
  }
  function renderMarket() {
    $('mkName').textContent = CFG.MARKET.NAME; $('mkSym').textContent = '$' + CFG.MARKET.SYMBOL;
    $('mkLink').href = (M && M.url) || ('https://dexscreener.com/' + CFG.MARKET.CHAIN + '/' + CFG.MARKET.TOKEN);
    if (!M) return;
    $('mkPrice').textContent = priceUsd(M.price);
    var c = $('mkChg');
    if (M.chg == null) { c.textContent = ''; } else { c.textContent = (M.chg > 0 ? '+' : '') + Number(M.chg).toFixed(2) + '%'; c.className = 'chg ' + (M.chg >= 0 ? 'up' : 'down'); }
    $('mkCap').textContent = compactUsd(M.cap); $('mkFdv').textContent = compactUsd(M.fdv);
    $('mkLiq').textContent = compactUsd(M.liq); $('mkVol').textContent = compactUsd(M.vol);
    $('mkUpdated').textContent = 'Updated ' + new Date(M.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  $('mkRefresh').onclick = function () { loadMarket(true); };

  /* ---------- Cloud mining ---------- */
  function pkgById(id) { for (var i = 0; i < PACKAGES.length; i++) if (PACKAGES[i].id === id) return PACKAGES[i]; return null; }
  function activePkgs(now) {
    now = now || Date.now();
    return PACKAGES.filter(function (p) { var o = S.pkgs[p.id]; return o && o.end > now; });
  }
  function dailyRate() { return activePkgs().reduce(function (a, p) { return a + p.perDay; }, 0); }
  function accrued() {
    var now = Date.now(), from = S.mineAt || now, sum = S.unclaimed;
    Object.keys(S.pkgs).forEach(function (id) {
      var p = pkgById(id), o = S.pkgs[id]; if (!p || !o) return;
      var a = Math.max(from, o.start), b = Math.min(now, o.end);
      if (b > a) sum += (b - a) / 864e5 * p.perDay;
    });
    return sum;
  }
  function settle() { S.unclaimed = accrued(); S.mineAt = Date.now(); }

  function renderPackages() {
    var box = $('pkgList'); box.innerHTML = '';
    var now = Date.now();
    PACKAGES.forEach(function (p, i) {
      var o = S.pkgs[p.id], active = o && o.end > now;
      var d = document.createElement('div'); d.className = 'card pkg p' + (i % 3 + 1) + (active ? ' owned' : '');
      var usd = price() ? priceUsd(p.perDay * price()) + ' · ' : '';
      d.innerHTML = '<div class="pk-ic">' + icon('i-zap') + '</div><div class="pk-body"><h4>' + esc(p.name) + '<small>' + p.days + 'd</small></h4>' +
        '<div class="pk-line"><span class="mint-t">' + usd + fmt(p.perDay) + ' ' + CFG.COIN + '/day</span> · <span class="gold-t">' + p.cost + ' ' + coinIc() + ' ' + CFG.COIN + '</span></div>' +
        (active ? '<div class="muted small" style="margin-top:4px">Active · ' + Math.ceil((o.end - now) / 864e5) + 'd left</div>' : '') + '</div>';
      var act = document.createElement('div'); act.className = 'pk-act';
      var b = document.createElement('button'); b.className = 'btn violet sm';
      b.textContent = active ? 'Active' : 'Get'; b.disabled = !!active;
      b.onclick = function () {
        if (S.coins < p.cost) { sfx.error(); toast('Not enough ' + CFG.COIN + ' — need ' + p.cost, 'err'); return; }
        settle(); S.coins -= p.cost; S.pkgs[p.id] = { start: Date.now(), end: Date.now() + p.days * 864e5 };
        save(); render(); sfx.success(); haptic(); toast(p.name + ' activated!', 'ok');
      };
      act.appendChild(b); d.appendChild(act); box.appendChild(d);
    });
    $('pkgCount').textContent = PACKAGES.length;
  }
  $('claimBtn').onclick = function () {
    settle();
    if (S.unclaimed < CFG.MIN_CLAIM) { sfx.error(); toast(activePkgs().length ? 'Nothing to claim yet' : 'Unlock a package to start mining', 'err'); return; }
    var amt = S.unclaimed; S.unclaimed = 0; addCoins(amt);
    save(); render(); sfx.success(); haptic(); toast('+' + fmt(amt, 4) + ' ' + CFG.COIN + ' moved to balance', 'ok');
  };

  /* ---------- Tasks ---------- */
  function openLink(url, tme) {
    try {
      if (tg && tme && tg.openTelegramLink) tg.openTelegramLink(url);
      else if (tg && tg.openLink) tg.openLink(url);
      else window.open(url, '_blank');
    } catch (e) { window.open(url, '_blank'); }
  }
  function renderTasks() {
    var open = 0, boxes = { tg: $('tgTasks'), social: $('socialTasks') };
    boxes.tg.innerHTML = ''; boxes.social.innerHTML = '';
    TASKS.forEach(function (t) {
      var st = S.tasks[t.id] || {};
      var d = document.createElement('div'); d.className = 'card task';
      d.innerHTML = '<span class="sq-ic">' + icon(t.icon) + '</span><div class="grow"><h4>' + esc(t.title) + '</h4><div class="muted small">' + esc(t.desc) + '</div><span class="reward">+' + CFG.TASK_REWARD + ' ' + coinIc() + ' ' + CFG.COIN + '</span></div>';
      var b = document.createElement('button'); b.className = 'btn join sm';
      if (st.done) { b.textContent = 'Done ✓'; b.disabled = true; }
      else {
        open++;
        if (!st.t) { b.textContent = t.group === 'tg' ? 'Join' : 'Go'; b.onclick = function () { S.tasks[t.id] = { t: Date.now() }; save(); openLink(t.url, t.tme); render(); }; }
        else {
          var left = CFG.VERIFY_SECONDS - Math.floor((Date.now() - st.t) / 1000);
          if (left > 0) { b.textContent = 'Checking ' + left + 's'; b.disabled = true; }
          else {
            b.textContent = 'Claim'; b.className = 'btn claim sm';
            b.onclick = function () {
              S.tasks[t.id] = { done: true }; addCoins(CFG.TASK_REWARD);
              save(); render(); sfx.success(); haptic(); toast('+' + CFG.TASK_REWARD + ' ' + CFG.COIN + ' earned', 'ok');
            };
          }
        }
      }
      d.appendChild(b); boxes[t.group].appendChild(d);
    });
    if (adState().n < CFG.AD_LIMIT) open++;
    if (S.daily + 864e5 <= Date.now()) open++;
    $('openTasks').textContent = open;
  }

  /* ---------- Daily ---------- */
  $('dailyBtn').onclick = function () {
    var left = S.daily + 864e5 - Date.now();
    if (left > 0) { sfx.error(); toast('Come back in ' + hms(left), 'err'); return; }
    S.daily = Date.now(); addCoins(CFG.DAILY);
    save(); render(); sfx.success(); haptic(); toast('+' + CFG.DAILY + ' ' + CFG.COIN + ' daily bonus', 'ok');
  };

  /* ---------- Adsgram ---------- */
  function adState() {
    var w = CFG.AD_WINDOW_HOURS * 36e5;
    // window starts with the first rewarded ad, not when the app is opened
    if (!S.ads || (S.ads.start && Date.now() - S.ads.start >= w)) S.ads = { start: 0, n: 0 };
    return S.ads;
  }
  var adCtl = null, adBusy = false;
  function loadAdsgram(cb) {
    if (window.Adsgram) return cb();
    var s = document.createElement('script'); s.src = 'https://sad.adsgram.ai/js/sad.min.js';
    s.onload = function () { cb(); }; s.onerror = function () { cb(new Error('load')); };
    document.head.appendChild(s);
  }
  $('adBtn').onclick = function () {
    var st = adState();
    if (st.n >= CFG.AD_LIMIT) { sfx.error(); toast('Limit reached. Resets in ' + hms(st.start + CFG.AD_WINDOW_HOURS * 36e5 - Date.now()), 'err'); return; }
    if (!CFG.ADSGRAM_BLOCK_ID) { sfx.error(); toast('Ads are not available yet. Check back soon!', 'err'); return; }
    if (adBusy) return; adBusy = true;
    loadAdsgram(function (err) {
      if (err || !window.Adsgram) { adBusy = false; sfx.error(); toast('Could not load ad', 'err'); return; }
      try { adCtl = adCtl || window.Adsgram.init({ blockId: CFG.ADSGRAM_BLOCK_ID }); } catch (e) { adBusy = false; toast('Could not load ad', 'err'); return; }
      adCtl.show().then(function (r) {
        adBusy = false;
        if (r && r.done) {
          var s2 = adState(); if (!s2.n) s2.start = Date.now(); s2.n++; addCoins(CFG.AD_REWARD);
          save(); render(); sfx.success(); haptic(); toast('+' + CFG.AD_REWARD + ' ' + CFG.COIN + ' ad reward', 'ok');
        } else { sfx.error(); toast('Ad skipped — no reward', 'err'); }
      }).catch(function (r) { adBusy = false; sfx.error(); toast((r && r.description) || 'No ad available right now', 'err'); });
    });
  };

  /* ---------- Navigation ---------- */
  function show(page) {
    $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'p-' + page); });
    $$('nav button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-page') === page); });
    window.scrollTo(0, 0);
  }
  $$('nav button').forEach(function (b) { b.onclick = function () { show(b.getAttribute('data-page')); }; });
  $$('[data-goto]').forEach(function (b) {
    b.onclick = function () {
      show(b.getAttribute('data-goto'));
      var t = b.getAttribute('data-scroll');
      if (t) setTimeout(function () { $(t).scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 120);
    };
  });

  /* ---------- Sheets ---------- */
  function openSheet(id) { $(id).classList.add('show'); }
  function closeSheet(id) { $(id).classList.remove('show'); }
  $$('.overlay').forEach(function (ov) {
    ov.addEventListener('click', function (e) { if (e.target === ov || (e.target.closest && e.target.closest('[data-close]'))) closeSheet(ov.id); });
  });
  $$('[data-sheet]').forEach(function (b) {
    b.onclick = function () {
      var id = b.getAttribute('data-sheet');
      if (id === 'histSheet') renderHistory();
      if (id === 'refSheet') { renderRefList(); syncReferrals(); }
      openSheet(id);
    };
  });

  /* ---------- Wallet (TON Connect) ---------- */
  function shortAddr(a) { return a && a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a; }
  function validAddr(a) { return /^[A-Za-z0-9_-]{48}$/.test(a) || /^-?\d:[0-9a-fA-F]{64}$/.test(a); }
  var tc = null;
  function friendly(acc) {
    try { return window.TON_CONNECT_UI.toUserFriendlyAddress(acc.address, acc.chain === '-3'); } catch (e) { return acc.address; }
  }
  function setWallet(addr, silent) {
    var first = !S.wallet;
    S.wallet = addr; save(); render(); hideGate();
    if (!silent) { if (first) sfx.welcome(); else sfx.success(); haptic(); toast('Wallet connected', 'ok'); }
  }
  function initTonConnect() {
    if (tc || !window.TON_CONNECT_UI) return tc;
    try {
      tc = new window.TON_CONNECT_UI.TonConnectUI({
        manifestUrl: CFG.TONCONNECT_MANIFEST,
        uiPreferences: { theme: window.TON_CONNECT_UI.THEME ? window.TON_CONNECT_UI.THEME.DARK : 'DARK' },
        actionsConfiguration: { twaReturnUrl: CFG.APP_NAME ? 'https://t.me/' + CFG.BOT + '/' + CFG.APP_NAME : 'https://t.me/' + CFG.BOT }
      });
      tc.onStatusChange(function (w) {
        if (w && w.account) { var a = friendly(w.account); if (a !== S.wallet) setWallet(a, !!S.wallet && restoring); }
      });
    } catch (e) { tc = null; }
    return tc;
  }
  var restoring = true; setTimeout(function () { restoring = false; }, 3000);
  function connectWallet() {
    var c = initTonConnect();
    if (!c) { openSheet('manualSheet'); return; }
    var p = c.connected ? c.disconnect() : Promise.resolve();
    p.then(function () { return c.openModal(); }).catch(function () { openSheet('manualSheet'); });
  }
  $('gateConnect').onclick = connectWallet;
  $('gateManual').onclick = function () { $('manualInput').value = ''; openSheet('manualSheet'); };
  $('changeWallet').onclick = connectWallet;
  $$('.walletChip').forEach(function (b) { b.onclick = function () { if (S.wallet) show('you'); else connectWallet(); }; });
  $('manualSave').onclick = function () {
    var v = $('manualInput').value.trim();
    if (!validAddr(v)) { sfx.error(); toast('Enter a valid TON wallet address', 'err'); return; }
    closeSheet('manualSheet'); setWallet(v);
  };
  function showGate() { $('gate').classList.add('show'); document.body.classList.add('gated'); }
  function hideGate() { $('gate').classList.remove('show'); document.body.classList.remove('gated'); }

  /* ---------- Withdraw ---------- */
  $('withdrawBtn').onclick = function () {
    if (!S.wallet) { connectWallet(); return; }
    $('wdAvail').textContent = fmt(S.coins); $('minWd').textContent = CFG.MIN_WITHDRAW;
    $('wdWallet').textContent = S.wallet; $('wdAmount').value = '';
    openSheet('wdSheet');
  };
  $('wdMax').onclick = function () { $('wdAmount').value = Math.floor(S.coins * 100) / 100; };
  $('wdSubmit').onclick = function () {
    var a = parseFloat($('wdAmount').value);
    if (!(a >= CFG.MIN_WITHDRAW)) { sfx.error(); toast('Minimum withdraw is ' + CFG.MIN_WITHDRAW + ' ' + CFG.COIN, 'err'); return; }
    if (a > S.coins) { sfx.error(); toast('Not enough balance', 'err'); return; }
    S.coins -= a; S.wd.unshift({ amt: a, wallet: S.wallet, ts: Date.now(), status: 'Pending' });
    save(); render(); closeSheet('wdSheet'); sfx.success(); haptic(); toast('Request submitted', 'ok');
  };
  function renderHistory() {
    var box = $('histList');
    if (!S.wd.length) { box.innerHTML = '<p class="muted empty">No requests yet.</p>'; return; }
    box.innerHTML = S.wd.map(function (r) {
      return '<div class="li"><span class="sq-ic gold-t">' + icon('i-up') + '</span><div class="grow"><b>' + fmt(r.amt) + ' ' + CFG.COIN + '</b><div class="muted small">' + new Date(r.ts).toLocaleString() + ' · ' + esc(shortAddr(r.wallet || '')) + '</div></div><span class="pill">' + esc(r.status) + '</span></div>';
    }).join('');
  }

  /* ---------- Referrals ---------- */
  var refUrl = CFG.APP_NAME
    ? 'https://t.me/' + CFG.BOT + '/' + CFG.APP_NAME + '?startapp=ref_' + uid
    : 'https://t.me/' + CFG.BOT + '?start=ref_' + uid;
  setAll('.refLink', refUrl.replace(/^https:\/\//, ''));

  function inviterId() {
    var p = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
    if (!p) { try { var q = new URLSearchParams(location.search); p = q.get('tgWebAppStartParam') || q.get('startapp') || q.get('ref') || ''; } catch (e) {} }
    p = String(p).replace(/^ref_?/, '');
    return /^[A-Za-z0-9_-]{1,64}$/.test(p) && p !== uid ? p : '';
  }

  var remoteRef = {
    call: function (path, body, cb) {
      try {
        fetch(CFG.REF_API.replace(/\/$/, '') + path, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ initData: (tg && tg.initData) || '' }, body || {}))
        }).then(function (r) { return r.json(); }).then(function (j) { cb(j && !j.error ? j : null); }, function () { cb(null); });
      } catch (e) { cb(null); }
    },
    register: function (ref, cb) { this.call('/register', {}, cb); },
    stats: function (cb) { this.call('/stats', {}, cb); }
  };
  var localRef = {
    DB: 'minerpro_refdb',
    load: function () { try { return JSON.parse(localStorage.getItem(this.DB)) || { users: {}, refs: {} }; } catch (e) { return { users: {}, refs: {} }; } },
    register: function (ref, cb) {
      var db = this.load();
      if (db.users[uid]) return cb({ ok: false, referredBy: db.users[uid] });
      db.users[uid] = ref;
      (db.refs[ref] = db.refs[ref] || []).push({ id: uid, name: fullName, ts: Date.now() });
      try { localStorage.setItem(this.DB, JSON.stringify(db)); } catch (e) {}
      cb({ ok: true, referredBy: ref });
    },
    stats: function (cb) { var f = this.load().refs[uid] || []; cb({ count: f.length, friends: f }); }
  };
  var refStore = CFG.REF_API ? remoteRef : localRef;

  var registering = false;
  function registerReferral(done) {
    if (S.refChecked || registering) return done();
    var ref = inviterId();
    if (!ref || Date.now() - S.joined > 864e5) { S.refChecked = true; save(); return done(); }   // শুধু নতুন ইউজার রেফারেল হিসেবে গণ্য হবে
    registering = true;
    refStore.register(ref, function (res) {
      registering = false;
      if (res && !S.refChecked) {   // res না থাকলে সার্ভারে পৌঁছানো যায়নি — পরের বার আবার চেষ্টা হবে
        S.refChecked = true;
        if (res.ok) {
          S.refBy = res.referredBy || ref; addCoins(CFG.REF_BONUS);
          save(); render(); sfx.referral(); haptic(); toast('🎉 Invited by a friend: +' + CFG.REF_BONUS + ' ' + CFG.COIN, 'ok');
        } else { save(); }
      }
      done();
    });
  }

  var syncing = false;
  function syncReferrals(manual) {
    // রেজিস্ট্রেশন সফল না হওয়া পর্যন্ত stats ডাকা হবে না, নাহলে সার্ভার ইউজারকে "পুরনো" ধরে নেবে
    if (!S.refChecked) return registerReferral(function () {
      if (S.refChecked) syncReferrals(manual);
      else if (manual) { sfx.error(); toast('Could not load referrals', 'err'); }
    });
    if (syncing) return; syncing = true;
    refStore.stats(function (res) {
      syncing = false;
      if (!res) { if (manual) { sfx.error(); toast('Could not load referrals', 'err'); } return; }
      var count = Math.max(0, parseInt(res.count, 10) || 0);
      S.refFriends = (res.friends || []).slice(-50);
      if (count > S.refCredited) {
        var gain = (count - S.refCredited) * CFG.REF_REWARD, fresh = count - S.refCredited;
        addCoins(gain); S.refEarned += gain; S.refCredited = count;
        save(); render(); sfx.referral(); haptic();
        toast('+' + fmt(gain, 0) + ' ' + CFG.COIN + ' · ' + fresh + ' new referral' + (fresh === 1 ? '' : 's') + '!', 'ok');
        $$('.refCount').forEach(function (el) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); });
      } else if (manual) { toast(count ? 'Referrals up to date' : 'No referrals yet — share your link!', 'ok'); }
      S.refCount = count; save(); renderText(); renderRefList();
    });
  }

  function renderRefList() {
    var box = $('refList');
    if (!S.refFriends.length) { box.innerHTML = '<p class="muted empty">No friends yet. Share your link to start earning.</p>'; return; }
    box.innerHTML = S.refFriends.slice().reverse().map(function (f) {
      var n = f.name || ('User ' + f.id);
      return '<div class="li"><div class="avatar">' + esc(n.charAt(0).toUpperCase()) + '</div><div class="grow"><b>' + esc(n) + '</b><div class="muted small">' + (f.ts ? 'Joined ' + new Date(f.ts).toLocaleDateString() : '') + '</div></div><span class="reward">+' + CFG.REF_REWARD + '</span></div>';
    }).join('');
  }

  function copyText(txt) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta);
    }
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(fallback); else fallback(); } catch (e) { fallback(); }
  }
  $$('.copyRef').forEach(function (b) { b.onclick = function () { copyText(refUrl); sfx.success(); toast('Link copied', 'ok'); }; });
  $$('.shareRef').forEach(function (b) {
    b.onclick = function () {
      var text = 'Join ' + CFG.APP_TITLE + ' and start mining! Get +' + CFG.REF_BONUS + ' ' + CFG.COIN + ' bonus with my link.';
      var url = 'https://t.me/share/url?url=' + encodeURIComponent(refUrl) + '&text=' + encodeURIComponent(text);
      try {
        if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
        else if (navigator.share) navigator.share({ title: CFG.APP_TITLE, text: text, url: refUrl }).catch(function () {});
        else window.open(url, '_blank');
      } catch (e) { window.open(url, '_blank'); }
    };
  });
  $('refRefresh').onclick = function () { syncReferrals(true); };
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { syncReferrals(); loadMarket(); } });

  /* ---------- Profile ---------- */
  $('soundBtn').onclick = function () { S.sound = !S.sound; save(); render(); if (S.sound) sfx.success(); };
  $('communityBtn').onclick = function () { openLink(CFG.LINKS.tg, true); };
  $('faqList').innerHTML = FAQ.map(function (q) { return '<details class="faq"><summary>' + esc(q[0]) + '</summary><p class="muted">' + esc(q[1]) + '</p></details>'; }).join('');

  /* ---------- Render ---------- */
  function renderText() {
    var p = price(), un = accrued(), rate = dailyRate(), act = activePkgs().length;
    $('balance').textContent = fmt(S.coins);
    $('balUsd').textContent = '≈ US$' + fmt(S.coins * p, 2);

    // Tasks
    var dl = S.daily + 864e5 - Date.now();
    $('dailyBtn').disabled = dl > 0;
    $('dailyInfo').textContent = dl > 0 ? 'in ' + hms(dl) : 'ready';
    var ad = adState();
    $('adCount').textContent = ad.n; $('adMax').textContent = CFG.AD_LIMIT;
    $('adBar').style.width = Math.min(100, ad.n / CFG.AD_LIMIT * 100) + '%';
    $('adReset').textContent = ad.n > 0 ? 'Resets in ' + hms(ad.start + CFG.AD_WINDOW_HOURS * 36e5 - Date.now()) : 'Resets every ' + CFG.AD_WINDOW_HOURS + ' hours';
    $('adBtn').disabled = ad.n >= CFG.AD_LIMIT;
    $('adBtn').textContent = ad.n >= CFG.AD_LIMIT ? 'Limit reached' : 'Watch ad';

    // Mine
    $('mUnclaimed').textContent = fmt(un, 4);
    $('mUnUsd').textContent = '≈ ' + (p ? priceUsd(un * p) : '$0.000');
    $('mRate').textContent = fmt(rate) + '/d';
    $('mAvail').textContent = fmt(S.coins, 1);
    $('mStatus').textContent = act ? 'Mining' : 'Idle';
    $('mStatus').className = 'pill' + (act ? ' on' : '');
    document.querySelector('.miner-coin').classList.toggle('on', act > 0);
    $('mHint').innerHTML = '<svg class="i xs"><use href="#i-box"/></svg>' + (act ? act + ' active package' + (act > 1 ? 's' : '') + ' · ' + fmt(rate / 24, 4) + ' ' + CFG.COIN + '/hour' : 'Unlock a package below to start earning');
    $('claimBtn').disabled = un < CFG.MIN_CLAIM;

    // Profile
    $('hName').textContent = fullName; $('hUser').textContent = uname;
    $('yName').textContent = fullName; $('yId').textContent = tu ? 'ID ' + uid : 'Guest';
    setAll('.walletShort', S.wallet ? shortAddr(S.wallet) : 'Connect wallet');
    $('wState').textContent = S.wallet ? 'Wallet connected' : 'Wallet not connected';
    $('wPill').textContent = S.wallet ? 'Connected' : 'Not connected';
    $('wPill').className = 'pill' + (S.wallet ? ' green' : '');
    $('changeWallet').textContent = S.wallet ? 'Change wallet' : 'Connect wallet';

    var wdSum = S.wd.reduce(function (a, b) { return a + b.amt; }, 0);
    $('yEarned').textContent = fmt(S.earned, 4) + ' ' + CFG.COIN;
    $('yWd').textContent = fmt(wdSum, 4) + ' ' + CFG.COIN;
    var top = Math.max(S.earned, wdSum, 1);
    $('yEarnBar').style.width = (S.earned / top * 100) + '%'; $('yWdBar').style.width = (wdSum / top * 100) + '%';
    $('yRefs').textContent = S.refCount + ' · ' + S.refCount + ' active';
    $('yRefSub').textContent = S.refCount + (S.refCount === 1 ? ' friend' : ' friends') + ' · ' + fmt(S.refEarned, 0) + ' ' + CFG.COIN + ' earned';
    setAll('.refCount', S.refCount); setAll('.refEarned', fmt(S.refEarned, 0) + ' ' + CFG.COIN);

    $('soundInfo').textContent = S.sound ? 'On' : 'Off';
    $('soundSwitch').className = 'switch' + (S.sound ? ' on' : '');
    $('soundIcon').innerHTML = '<use href="#' + (S.sound ? 'i-vol' : 'i-mute') + '"/>';
  }

  function render() { renderText(); renderTasks(); renderPackages(); }

  // প্রতি সেকেন্ডে শুধু লেখা বদলায়, বাটন নতুন করে আঁকা হয় না (যাতে ক্লিক মিস না হয়)
  var lastPkgRender = Date.now();
  function tick() {
    renderText();
    var waiting = TASKS.some(function (t) {
      var st = S.tasks[t.id];
      return st && st.t && !st.done && (Date.now() - st.t) < (CFG.VERIFY_SECONDS + 2) * 1000;
    });
    if (waiting) renderTasks();
    if (Date.now() - lastPkgRender > 60000) { lastPkgRender = Date.now(); renderPackages(); }
  }

  /* ---------- Start ---------- */
  document.title = CFG.APP_TITLE;
  setAll('.appTitle', CFG.APP_TITLE);
  setAll('.coinSym', CFG.COIN);
  setAll('.refRewardTxt', CFG.REF_REWARD); setAll('.refBonusTxt', CFG.REF_BONUS);
  $('dailyAmt').textContent = CFG.DAILY; $('adReward').textContent = CFG.AD_REWARD;
  if (!S.mineAt) S.mineAt = Date.now();
  setAvatar($('hAvatar')); setAvatar($('yAvatar'));
  if (!S.wallet) showGate();
  initTonConnect();
  renderMarket(); render(); renderRefList();
  syncReferrals(); loadMarket();
  setInterval(tick, 1000);
  setInterval(function () { if (!document.hidden) syncReferrals(); }, CFG.REF_SYNC_SECONDS * 1000);
  setInterval(function () { if (!document.hidden) loadMarket(); }, CFG.MARKET.REFRESH_SECONDS * 1000);
})();
