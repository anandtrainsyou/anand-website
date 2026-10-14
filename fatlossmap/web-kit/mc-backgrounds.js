/* Minecraft backgrounds from "Dieting is Minecraft" / "Lifting is Minecraft" — standalone, no dependencies.
   Two scenes, the same drawing code as the films (engine/board/board.html absBg, r4.js world/LAYERS, r9.js dayMix9, p2dig.js digWorld):
     sky  — the gradient sky by time of day, stars at night, the game's cloud layer, the sun and moon on their arc, three parallax hill
            layers with blocky oaks on the near ridge. Changing the time time-lapses the sky forward, the way the films do it.
     cave — a tunnel through stone (or deepslate) drifting past: the back wall behind the openings (parallax), shadows where the blocks
            meet it, lit block edges, ores, torches with warm flickering light and dust in it.
   Usage: see README.md. Everything is settable at any time with controller.set({...}). */
(function (root) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const ss = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const hex = q => [1, 3, 5].map(k => parseInt(q.slice(k, k + 2), 16));
  const mixc = (a, b, u) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], u))).join(',')})`; };

  const VH = 1920;   // the films' frame height; every scene is drawn in this space and scaled to the element's height
  const SCRIPT_DIR = (() => { try { const s = document.currentScript && document.currentScript.src; return s ? s.slice(0, s.lastIndexOf('/') + 1) : './'; } catch (e) { return './'; } })();

  /* ---------- defaults (every key can be passed to mount() or set()) ---------- */
  const DEFAULTS = {
    scene: 'sky',            // 'sky' | 'cave'
    assets: SCRIPT_DIR + 'assets/',
    speed: 1,                // scroll speed multiplier (hills, clouds, cave drift); 0 = still
    paused: false,
    scale: 1,                // cave only: block zoom on top of the fit-to-height (2 = blocks twice as big)
    pixelRatio: 0,           // 0 = devicePixelRatio capped at 2
    reducedMotion: 'respect',// 'respect' = draw one still frame if the visitor prefers reduced motion; 'ignore'
    transition: 1.6,         // seconds to time-lapse to a new time of day / to cross-fade scenes
    // sky
    time: 'dawn',            // 0..1 through the day (0 dawn, .25 day, .5 dusk, .75 night) or 'dawn'|'morning'|'day'|'noon'|'dusk'|'sunset'|'night'|'midnight'
    cycle: 0,                // seconds for a full day; 0 = hold the time
    horizon: 0.896,          // where the near ridge sits, as a fraction of the height (the films: 1720/1920)
    hills: true, clouds: true, stars: true, sunMoon: true, trees: true,
    // cave
    deep: false,             // deepslate instead of stone
    ores: true, torches: true,
    ambient: 0.1,            // light everywhere, 0..1
    block: 96,               // block size at 1920 px tall (the film's)
    direction: 1,            // 1 drifts right, -1 left
    dust: true,
    seed: 7,
    onReady: null,
  };
  const TIMES = { dawn: 0, sunrise: 0, morning: 0.12, day: 0.25, noon: 0.25, afternoon: 0.36, dusk: 0.5, sunset: 0.48, evening: 0.55, night: 0.75, midnight: 0.75 };
  const timeOf = v => typeof v === 'string' ? (TIMES[v.toLowerCase()] ?? 0) : (((+v || 0) % 1) + 1) % 1;

  const FILES = { sun: 'sun.png', moon: 'moon.png', clouds: 'clouds.png', stone: 'stone.png', deepslate: 'deepslate.png', torch: 'torch.png',
    coal: 'coal_ore.png', iron: 'iron_ore.png', gold: 'gold_ore.png', diamond: 'diamond_ore.png', redstone: 'redstone_ore.png', lapis: 'lapis_ore.png', copper: 'copper_ore.png', emerald: 'emerald_ore.png',
    dcoal: 'deepslate_coal_ore.png', diron: 'deepslate_iron_ore.png', dgold: 'deepslate_gold_ore.png', ddiamond: 'deepslate_diamond_ore.png', dredstone: 'deepslate_redstone_ore.png', dlapis: 'deepslate_lapis_ore.png', dcopper: 'deepslate_copper_ore.png', demerald: 'deepslate_emerald_ore.png' };
  const CACHE = {};
  function loadImages(base) {
    if (CACHE[base]) return CACHE[base];
    const IMG = {};
    CACHE[base] = Promise.all(Object.entries(FILES).map(([k, f]) => new Promise(res => { const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => { console.warn('[mc-backgrounds] missing ' + base + f); res(); }; im.src = base + f; }))).then(() => IMG);
    return CACHE[base];
  }

  /* ================= SKY (absBg + world / dayMix9 from the films) ================= */
  const SKYP = [['#5E9BFF', '#BBD6FF'], ['#33366E', '#F3955A'], ['#04060E', '#121B38'], ['#40569E', '#F7B76E']];   // day, dusk, night, dawn: top → bottom
  const LAYERS = [
    { set: ['#A9C2EE', '#8A6A8E', '#18213E', '#9C8AB0'], blk: 48, base: 1470, amp: 5, sp: 3, seed: 1 },
    { set: ['#7FA2D6', '#5C4670', '#10172E', '#6E6290'], blk: 40, base: 1600, amp: 4, sp: 9, seed: 7 },
    { set: ['#3F6B4E', '#2C2136', '#070A14', '#36324E'], blk: 32, base: 1720, amp: 2, sp: 18, seed: 13, trees: true }];
  const DAYK = [[0, 3], [0.1, 0], [0.38, 0], [0.5, 1], [0.61, 2], [0.9, 2], [1, 3]];
  function dayMix(f) { f = ((f % 1) + 1) % 1; for (let k = 1; k < DAYK.length; k++) if (f <= DAYK[k][0]) { const [a0, i0] = DAYK[k - 1], [a1, i1] = DAYK[k]; return [i0, i1, ss((f - a0) / (a1 - a0))]; } return [3, 3, 0]; }

  function skyLayer(g, IMG, o, VW, t, mood) {
    const P = SKYP[mood], grd = g.createLinearGradient(0, 0, 0, VH); grd.addColorStop(0, P[0]); grd.addColorStop(1, P[1]); g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
    const night = clamp(mood - 1) * (mood < 3 ? 1 : clamp(3.6 - mood));
    if (o.stars && night > 0) { const n = Math.round(160 * VW / 1080); for (let i = 0; i < n; i++) { const x = hash(i) * VW, y = hash(i + 99) * VH, s2 = hash(i + 7) < 0.15 ? 6 : 3;
      g.fillStyle = `rgba(255,255,255,${night * (0.25 + 0.45 * hash(i + 3))})`; g.fillRect(Math.round(x), Math.round(y), s2, s2); } }
    if (o.clouds && IMG.clouds) {   // the game's cloud layer: flat white blocks drifting slowly (far, soft, low contrast)
      g.imageSmoothingEnabled = false; g.save(); g.globalAlpha = lerp(0.5, 0.12, night);
      const cs = 56, span = 64 * cs, off = ((t * 14) % span + span) % span;
      for (let k = 0; k * span - off < VW; k++) g.drawImage(IMG.clouds, 0, 0, 64, 6, k * span - off, 60, span, 6 * cs);
      g.globalAlpha *= 0.45; const o2 = ((t * 8) % span + span) % span;
      for (let k = 0; k * span - o2 < VW; k++) g.drawImage(IMG.clouds, 100, 60, 64, 4, k * span - o2, 1650, span, 4 * cs);
      g.restore(); }
  }
  function drawSky(g, IMG, o, VW, t, f) {
    const [a, b, u] = dayMix(f);
    skyLayer(g, IMG, o, VW, t, a); if (b !== a && u > 0) { g.save(); g.globalAlpha = u; skyLayer(g, IMG, o, VW, t, b); g.restore(); }
    if (o.sunMoon) { const arc = v => [lerp(-120, VW + 120, v), 760 - Math.sin(v * Math.PI) * 560];
      g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = false;
      if (IMG.sun && (f < 0.53 || f > 0.97)) { const [x, y] = arc((f > 0.97 ? f - 1 : f) / 0.5); g.drawImage(IMG.sun, x - 110, y - 110, 220, 220); }
      if (IMG.moon && f > 0.47 && f < 1.03) { const [x, y] = arc((f - 0.5) / 0.5); g.drawImage(IMG.moon, 0, 0, 32, 32, x - 100, y - 100, 200, 200); }
      g.restore(); }
    if (!o.hills) return;
    const dy = o.horizon * VH - 1720;
    LAYERS.forEach(L => { g.fillStyle = mixc(L.set[a], L.set[b], u); const off = t * L.sp, n0 = Math.floor(off / L.blk), base = L.base + dy;
      for (let i = -1; i < VW / L.blk + 2; i++) { const j = i + n0, x = i * L.blk - (((off % L.blk) + L.blk) % L.blk);
        const h = Math.round(L.amp * (0.5 + 0.35 * Math.sin(j * 0.17 + L.seed) + 0.15 * Math.sin(j * 0.53 + L.seed * 3)));
        g.fillRect(x, base - h * L.blk, L.blk + 1, VH - base + h * L.blk + 2);
        if (o.trees && L.trees && hash(j * 3.7 + 11) < 0.11) { const bb = L.blk, top = base - h * bb;   // an oak: trunk and a blocky crown
          g.fillRect(x, top - 4 * bb, bb, 4 * bb); g.fillRect(x - 2 * bb, top - 7 * bb, 5 * bb, 3 * bb); g.fillRect(x - bb, top - 8 * bb, 3 * bb, bb); } } });
  }

  /* ================= CAVE (digWorld from Lifting is Minecraft, made endless) ================= */
  // the tunnel: a winding opening with pockets; deterministic in (x, y, seed)
  const caveC = (x, s) => 2.6 * Math.sin(x * 0.083 + s) + 1.4 * Math.sin(x * 0.21 + s * 2.1) + 0.6 * Math.sin(x * 0.47 + s * 0.7);
  const caveH = (x, s) => 4.2 + 1.3 * Math.sin(x * 0.13 + s * 1.7) + 0.8 * Math.sin(x * 0.31 + s * 0.4);
  function caveAir(x, y, s) { const c = caveC(x, s), h = caveH(x, s), d = y - c;
    if (d > -h / 2 - 0.35 * (hash(x * 3.1 + y * 7.7 + s) - 0.5) && d < h / 2 + 0.6 * (hash(x * 5.3 + y * 1.9 + s * 3) - 0.5)) return true;
    // side pockets
    const px0 = Math.floor(x / 9), pk = hash(px0 * 13.7 + s); if (pk < 0.45) { const pcx = px0 * 9 + 2 + Math.floor(hash(px0 * 3.9 + s) * 5), pcy = Math.round(c + (pk < 0.22 ? 1 : -1) * (h / 2 + 1));
      if (Math.abs(x - pcx) + Math.abs(y - pcy) * 1.4 < 1.6 + hash(px0 * 8.1 + s) * 1.2) return true; }
    return false; }
  const floorY = (x, s) => { let y = Math.round(caveC(x, s)); for (let k = 0; k < 8 && caveAir(x, y - 1, s); k++) y--; for (let k = 0; k < 8 && !caveAir(x, y, s); k++) y++; return y; };
  const ORE_STONE = [['coal', 0.05], ['iron', 0.035], ['copper', 0.02], ['redstone', 0.012], ['gold', 0.01], ['lapis', 0.008], ['diamond', 0.006], ['emerald', 0.002]];
  const ORE_DEEP = [['diron', 0.03], ['dredstone', 0.03], ['dgold', 0.015], ['dlapis', 0.012], ['ddiamond', 0.014], ['dcoal', 0.01], ['dcopper', 0.008], ['demerald', 0.002]];
  function rockAt(IMG, o, x, y) { const deep = o.deep, base = deep ? IMG.deepslate : IMG.stone; if (!o.ores) return base;
    // ores come in small veins: a cell is ore when its vein cell rolls one, and it is inside the vein's blob
    const vx = Math.floor(x / 3), vy = Math.floor(y / 3), r = hash(vx * 17.3 + vy * 91.1 + o.seed * 7.7);
    let acc = 0; for (const [k, p] of (deep ? ORE_DEEP : ORE_STONE)) { acc += p * 2.2; if (r < acc) { if (hash(x * 1.3 + y * 7.9 + o.seed) < 0.4 && IMG[k]) return IMG[k]; break; } }
    return base; }
  const torchesNear = (x0, x1, s) => { const out = []; for (let k = Math.floor(x0 / 11) - 1; k <= Math.ceil(x1 / 11) + 1; k++) { if (hash(k * 5.31 + s) < 0.25) continue;
    const tx = k * 11 + Math.floor(hash(k * 2.77 + s) * 6), fy = floorY(tx, s); if (caveAir(tx, fy, s)) out.push([tx, fy, k]); } return out; };

  function drawCave(g, IMG, o, VW, t, camX, st) {
    const B = o.block * o.scale, s = o.seed;
    // the camera rides the tunnel's centre, smoothed
    let cy = 0; for (let k = -6; k <= 6; k++) cy += caveC(camX + k, s); cy = cy / 13;
    const SX = wx => VW / 2 + (wx - camX) * B, SY = wy => VH / 2 - (wy - cy) * B;
    const x0 = Math.floor(camX - VW / 2 / B) - 1, x1 = Math.ceil(camX + VW / 2 / B) + 1, y0 = Math.floor(cy - VH / 2 / B) - 1, y1 = Math.ceil(cy + VH / 2 / B) + 1;
    g.fillStyle = '#07060B'; g.fillRect(0, 0, VW, VH); g.imageSmoothingEnabled = false;
    const T = o.torches ? torchesNear(x0 - 6, x1 + 6, s) : [];
    const lightAt = (x, y) => { let L = o.ambient; for (const [tx, ty, k] of T) { const fl = 1 + 0.04 * Math.sin(t * 9 + k) * Math.sin(t * 13.7 + k * 2); L = Math.max(L, clamp((1.3 - Math.hypot(x - tx, y - ty) / 5.8) * fl)); }
      if (!o.torches) L = Math.max(L, 0.75 * clamp(1.25 - Math.hypot(x + 0.5 - camX, y + 0.5 - cy) / 7)); return Math.round(ss(L) * 16) / 16; };
    const air = [], solid = [], AIRS = new Set();
    for (let y = y1; y >= y0; y--) for (let x = x0; x <= x1; x++) { if (caveAir(x, y, s)) { air.push([x, y]); AIRS.add(x + ',' + y); } else solid.push([x, y]); }
    const open = (x, y) => (x < x0 || x > x1 || y < y0 || y > y1) ? caveAir(x, y, s) : AIRS.has(x + ',' + y);
    // the back wall through every opening (parallax 0.86, darkened), then its light and the shadows the blocks cast on it
    if (air.length) { const key = o.deep ? 'deepslate' : 'stone', im = IMG[key];
      if (im) { if (!st.pat || st.patKey !== key || st.patCtx !== g) { st.pat = g.createPattern(im, 'repeat'); st.patKey = key; st.patCtx = g; }
        const Bk = B * 0.86; st.pat.setTransform(new DOMMatrix().translate(VW / 2 - camX * Bk, VH / 2 + cy * Bk).scale(Bk / 16));
        g.beginPath(); air.forEach(([x, y]) => g.rect(SX(x), SY(y + 1), B + 0.5, B + 0.5)); g.fillStyle = st.pat; g.fill(); g.fillStyle = 'rgba(10,8,16,0.42)'; g.fill(); } }
    air.forEach(([x, y]) => { const X = SX(x), Y = SY(y + 1), L = lightAt(x, y) * 0.8; g.fillStyle = `rgba(4,3,8,${((1 - L) * 0.88).toFixed(3)})`; g.fillRect(X, Y, B + 0.5, B + 0.5);
      const sh = (dx, dy, x2, y2, w2, h2, gx0, gy0, gx1, gy1) => { if (open(x + dx, y + dy)) return; const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x2, y2, w2, h2); };
      const d = B * 0.34; sh(0, 1, X, Y, B + 0.5, d, 0, Y, 0, Y + d); sh(-1, 0, X, Y, d, B + 0.5, X, 0, X + d, 0); sh(1, 0, X + B - d, Y, d, B + 0.5, X + B, 0, X + B - d, 0); sh(0, -1, X, Y + B - d * 0.6, B + 0.5, d * 0.6, 0, Y + B, 0, Y + B - d * 0.6); });
    // the blocks, lit, with a lip on the edges that face an opening
    solid.forEach(([x, y]) => { const L = lightAt(x, y); if (L <= 0) return; const X = SX(x), Y = SY(y + 1), rock = rockAt(IMG, o, x, y); if (rock) g.drawImage(rock, X, Y, B + 0.5, B + 0.5);
      const lip = B * 0.09;
      if (open(x, y + 1)) { g.fillStyle = `rgba(255,240,215,${(0.16 * L).toFixed(3)})`; g.fillRect(X, Y, B + 0.5, lip); }
      if (open(x, y - 1)) { g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(X, Y + B - lip, B + 0.5, lip + 0.5); }
      if (open(x - 1, y)) { g.fillStyle = `rgba(255,240,215,${(0.08 * L).toFixed(3)})`; g.fillRect(X, Y, lip, B + 0.5); }
      if (open(x + 1, y)) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(X + B - lip, Y, lip + 0.5, B + 0.5); }
      if (L < 1) { g.fillStyle = `rgba(4,3,8,${((1 - L) * 0.9).toFixed(3)})`; g.fillRect(X, Y, B + 0.5, B + 0.5); } });
    // the torches: the sprite on the floor, its warm light on everything near it, its flame glow, dust drifting in it
    T.forEach(([tx, ty, k]) => { const X = SX(tx + 0.5), Y = SY(ty), fl = 1 + 0.06 * Math.sin(t * 11 + k) * Math.sin(t * 7.3 + k);
      if (X < -6 * B || X > VW + 6 * B) return;
      if (IMG.torch) g.drawImage(IMG.torch, X - B / 2, Y - B, B, B);
      const FX = X, FY = Y - B * 0.62;
      g.save(); g.globalCompositeOperation = 'lighter';
      let gr = g.createRadialGradient(FX, FY, 0, FX, FY, 4.2 * B); gr.addColorStop(0, `rgba(255,150,60,${0.16 * fl})`); gr.addColorStop(0.5, 'rgba(255,120,40,0.05)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = gr; g.fillRect(FX - 4.2 * B, FY - 4.2 * B, 8.4 * B, 8.4 * B);
      const r = 0.73 * B; gr = g.createRadialGradient(FX, FY, 0, FX, FY, r); gr.addColorStop(0, `rgba(255,190,90,${0.22 * fl})`); gr.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gr; g.fillRect(FX - r, FY - r, 2 * r, 2 * r);
      g.restore();
      if (o.dust) for (let n = 0; n < 18; n++) { const ang = hash(n * 2.7 + k) * 6.283, rr = (0.6 + 3.2 * hash(n * 5.1 + k)) * B, DX = FX + Math.cos(ang) * rr + Math.sin(t * 0.7 + n) * 18,
        DY = FY + Math.sin(ang) * rr * 0.8 + ((t * (8 + 10 * hash(n)) + 300 * hash(n * 9 + k)) % 120) - 60, a = 0.5 * (1 - rr / (4 * B)) * (0.5 + 0.5 * Math.sin(t * 2 + n + k));
        if (a > 0.02) { g.fillStyle = `rgba(255,225,170,${a.toFixed(3)})`; const s2 = 2 + 3 * hash(n * 11); g.fillRect(Math.round(DX), Math.round(DY), s2, s2); } } });
    // a soft vignette keeps the eye in the middle
    const vg = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.hypot(VW, VH) * 0.6); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
  }

  /* ================= the controller ================= */
  function mount(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('[mc-backgrounds] no element ' + target);
    let cv = el.tagName === 'CANVAS' ? el : null;
    if (!cv) { cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); Object.assign(cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
      if (getComputedStyle(el).position === 'static' && el !== document.body) el.style.position = 'relative'; el.prepend(cv); }
    const g = cv.getContext('2d');
    const o = Object.assign({}, DEFAULTS, options);
    let IMG = {}, raf = 0, dead = false, visible = true, last = performance.now(), clock = 0, scroll = 0, camX = 0, ready = false;
    let f = timeOf(o.time), lapse = null;                 // the current time of day, and a time-lapse in flight { from, to, t0, d }
    let fade = null;                                      // a scene cross-fade { from: snapshot canvas, t0, d }
    const st = {};
    const reduce = () => o.reducedMotion === 'respect' && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function size() { const r = cv.getBoundingClientRect(), dpr = o.pixelRatio || Math.min(2, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
    function draw() {
      if (!cv.width || !cv.height) return;
      const k = cv.height / VH, VW = cv.width / k;
      g.setTransform(k, 0, 0, k, 0, 0);
      let fd = f; if (lapse) { const u = clamp((clock - lapse.t0) / lapse.d); fd = lerp(lapse.from, lapse.to, ss(u)) % 1; }
      if (o.scene === 'cave') drawCave(g, IMG, o, VW, clock, camX, st);
      else drawSky(g, IMG, o, VW, scroll, fd);
      if (fade) { const u = clamp((clock - fade.t0) / fade.d); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 - ss(u); g.drawImage(fade.from, 0, 0, cv.width, cv.height); g.globalAlpha = 1; if (u >= 1) fade = null; }
    }
    function tick(now) {
      if (dead) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!o.paused && visible && ready) {
        clock += dt;
        let boost = 0; if (lapse) { const u = (clock - lapse.t0) / lapse.d; boost = u < 1 ? 6 * Math.sin(Math.PI * clamp(u)) : 0; if (u >= 1) { f = lapse.to % 1; lapse = null; } }
        else if (o.cycle > 0) f = (f + dt / o.cycle) % 1;
        scroll += dt * o.speed * (1 + boost);
        camX += dt * o.speed * 0.6 * o.direction;
        size(); draw();
      }
      raf = reduce() ? 0 : requestAnimationFrame(tick);
    }
    const ro = root.ResizeObserver ? new ResizeObserver(() => { size(); if (ready) draw(); }) : null; if (ro) ro.observe(cv);
    const io = root.IntersectionObserver ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); }) : null; if (io) io.observe(cv);

    const api = {
      canvas: cv,
      /* change anything, any time; time changes time-lapse forward, a scene change cross-fades */
      set(next = {}) {
        if ('assets' in next && next.assets !== o.assets) { o.assets = next.assets; loadImages(o.assets).then(m => { IMG = m; st.pat = null; draw(); }); }
        if ('scene' in next && next.scene !== o.scene && ready && o.transition > 0) { const snap = document.createElement('canvas'); snap.width = cv.width; snap.height = cv.height; snap.getContext('2d').drawImage(cv, 0, 0); fade = { from: snap, t0: clock, d: o.transition * 0.6 }; }
        if ('time' in next) { const to0 = timeOf(next.time), cur = lapse ? lerp(lapse.from, lapse.to, ss(clamp((clock - lapse.t0) / lapse.d))) % 1 : f;
          if (next.instant || !ready || o.transition <= 0 || reduce()) { f = to0; lapse = null; } else { let to = to0; while (to <= cur + 1e-4) to += 1; if (to - cur > 1e-3 && to - cur < 1 - 1e-3) lapse = { from: cur, to, t0: clock, d: o.transition * (0.6 + 0.8 * (to - cur)) }; } }
        Object.keys(next).forEach(key => { if (key !== 'time' && key !== 'assets' && key !== 'instant' && key in DEFAULTS) o[key] = next[key]; });
        if ('deep' in next || 'scene' in next) st.pat = null;
        size(); if (ready) draw(); if (!raf && !reduce() && !dead) { last = performance.now(); raf = requestAnimationFrame(tick); }
        return api; },
      get() { const out = Object.assign({}, o); out.time = lapse ? lapse.to % 1 : f; return out; },
      play() { return api.set({ paused: false }); },
      pause() { return api.set({ paused: true }); },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect(); if (cv !== el) cv.remove(); },
    };
    loadImages(o.assets).then(m => { IMG = m; ready = true; size(); draw(); if (typeof o.onReady === 'function') o.onReady(api); if (!reduce()) raf = requestAnimationFrame(tick); });
    return api;
  }

  /* data attributes: <div data-mc-bg="sky" data-time="dusk" data-cycle="120"></div> mounts itself; el.mcBackground is its controller */
  const ATTR = { time: v => (isNaN(+v) ? v : +v), cycle: Number, speed: Number, scale: Number, horizon: Number, ambient: Number, block: Number, direction: Number, seed: Number, transition: Number, pixelRatio: Number,
    deep: b => b !== 'false', ores: b => b !== 'false', torches: b => b !== 'false', hills: b => b !== 'false', clouds: b => b !== 'false', stars: b => b !== 'false', sunMoon: b => b !== 'false', trees: b => b !== 'false', dust: b => b !== 'false', paused: b => b !== 'false', assets: String, reducedMotion: String };
  function fromAttrs(el) { const out = { scene: el.dataset.mcBg || 'sky' }; Object.entries(ATTR).forEach(([k, conv]) => { if (el.dataset[k] != null) out[k] = conv(el.dataset[k]); }); return out; }
  function autoMount() { document.querySelectorAll('[data-mc-bg]').forEach(el => { if (!el.mcBackground) el.mcBackground = mount(el, fromAttrs(el)); }); }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount(); }

  root.MCBackground = { mount, autoMount, DEFAULTS, TIMES, fromAttrs };
})(typeof window !== 'undefined' ? window : globalThis);
