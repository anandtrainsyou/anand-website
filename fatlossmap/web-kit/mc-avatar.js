/* Anand's Minecraft avatar from "Lifting is Minecraft" — standalone, no dependencies.
   The film's own figure renderer (engine/board/p2fig.js): the game's textured boxes from a 64×64 skin, lit per face like the game,
   in an orthographic 3/4 view, with the real armor layers. Transparent background, so it sits on anything (e.g. mc-backgrounds.js).
   Usage: see README.md. Everything is settable at any time with controller.set({...}). */
(function (root) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const rotX = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
  const SCRIPT_DIR = (() => { try { const s = document.currentScript && document.currentScript.src; return s ? s.slice(0, s.lastIndexOf('/') + 1) : './'; } catch (e) { return './'; } })();

  const DEFAULTS = {
    assets: SCRIPT_DIR + 'assets/',
    skin: 'anand-skin.png',     // file in assets/, or any URL / data URL of a 64×64 skin
    armor: null,                // { head, chest, legs, feet }: 'leather' | 'gold' | 'iron' | 'diamond' | 'netherite' | null, or one tier for all four
    yaw: 0.5,                   // radians; 0 = facing the viewer, + turns his front to the viewer's right
    pitch: 0.12,                // radians; + looks down on him a little
    spin: 0,                    // radians per second of turntable rotation; 0 = none
    action: 'idle',             // 'idle' | 'walk' | 'wave' | 'still'
    lookAtCursor: true,         // the head follows the pointer (as the film's inventory doll does)
    drag: true,                 // drag to turn him
    fit: 0.86,                  // how much of the element's height he fills
    align: 'center',            // 'center' | 'bottom' (feet on the bottom edge)
    pixelRatio: 0,              // 0 = devicePixelRatio capped at 2
    paused: false,
    reducedMotion: 'respect',
    onReady: null,
  };
  const TIERS = { leather: ['leather', '#A06540'], gold: ['gold'], iron: ['iron'], diamond: ['diamond'], netherite: ['netherite'] };

  const IMCACHE = {};
  const loadImg = src => IMCACHE[src] || (IMCACHE[src] = new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => { console.warn('[mc-avatar] missing ' + src); res(null); }; im.src = src; }));
  const resolve = (base, f) => /^(https?:|data:|blob:|\/|\.)/.test(f) ? f : base + f;

  /* textures darkened to a light level / dyed (leather), cached */
  const TEX = new Map();
  function shadeTex(im, L) { const q = Math.round(clamp(L) * 16), key = (im.src || im.id || '') + '|' + q + '|' + im.width; let c = TEX.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    if (q < 16) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${1 - q / 16})`; g.fillRect(0, 0, c.width, c.height); } c.id = key; TEX.set(key, c); return c; }
  function dyeTex(im, hex) { const key = 'dye|' + im.src + '|' + hex; let c = TEX.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = hex; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(im, 0, 0); c.id = key; TEX.set(key, c); return c; }

  function xform(part) { return p => { let q = vsub(p, part.pivot || [0, 0, 0]); const r = part.rot || [0, 0, 0]; q = rotZ(rotY(rotX(q, r[0]), r[1]), r[2]); q = vadd(q, part.pivot || [0, 0, 0]);
    if (part.off) q = vadd(q, part.off); return part.parent ? part.parent(q) : q; }; }
  function figCam(cx, cy, s, yaw, pitch) { const R = p => rotX(rotY(p, yaw), pitch); return { R, P: p => { const q = R(p); return [cx + s * q[0], cy - s * q[1], q[2]]; } }; }
  /* one box's faces (the standard skin layout: top/bottom, right side, front, left side, back) */
  function boxFaces(out, b, T, cam) {
    const g = b.g || 0, X0 = b.x - g, X1 = b.x + b.w + g, Y0 = b.y - g, Y1 = b.y + b.h + g, Z0 = b.z - g, Z1 = b.z + b.d + g, { u, v, w, h, d } = b;
    let F = [[[u + d, v + d, w, h], [X0, Y1, Z1], [X1, Y1, Z1], [X0, Y0, Z1], [0, 0, 1]], [[u + 2 * d + w, v + d, w, h], [X1, Y1, Z0], [X0, Y1, Z0], [X1, Y0, Z0], [0, 0, -1]],
      [[u, v + d, d, h], [X0, Y1, Z0], [X0, Y1, Z1], [X0, Y0, Z0], [-1, 0, 0]], [[u + d + w, v + d, d, h], [X1, Y1, Z1], [X1, Y1, Z0], [X1, Y0, Z1], [1, 0, 0]],
      [[u + d, v, w, d], [X0, Y1, Z0], [X1, Y1, Z0], [X0, Y1, Z1], [0, 1, 0]], [[u + d + w, v, w, d], [X0, Y0, Z1], [X1, Y0, Z1], [X0, Y0, Z0], [0, -1, 0]]];
    if (b.mirror) { const r2 = F[2][0]; F[2][0] = F[3][0]; F[3][0] = r2; F = F.map(([rc, O, A, B, n]) => [rc, A, O, vadd(B, vsub(A, O)), n]); }
    F.forEach(([rc, O, A, B, n]) => { const o = cam.P(T(O)), a = cam.P(T(A)), bb = cam.P(T(B)), N = cam.R(vsub(T(vadd(O, n)), T(O)));
      if (N[2] <= 0.001) return;
      const ctr = cam.P(T([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]));
      const L = 0.5 + 0.5 * Math.max(0, N[0] * -0.35 + N[1] * 0.75 + N[2] * 0.56);
      out.push({ tex: b.tex, rc, o, a, b: bb, z: ctr[2] + (b.zb || 0), L }); });
  }
  function flush(g, faces) {
    faces.sort((a, b) => a.z - b.z);
    for (const f of faces) { const [u0, v0, w, h] = f.rc; g.save(); g.setTransform((f.a[0] - f.o[0]) / w, (f.a[1] - f.o[1]) / w, (f.b[0] - f.o[0]) / h, (f.b[1] - f.o[1]) / h, f.o[0], f.o[1]);
      g.imageSmoothingEnabled = false; const e = 0.04; g.drawImage(shadeTex(f.tex, f.L), u0, v0, w, h, -e, -e, w + 2 * e, h + 2 * e); g.restore(); }
  }

  /* the player with his skin's outer layer and the armor layers; pose: { head:[yaw,pitch], armR, armL, legR, legL (rx,ry,rz), body, lean, bob } */
  function playerFaces(cam, sk, P, A, tex) {
    const out = [], root = xform({ rot: [P.lean || 0, P.body || 0, 0], pivot: [0, 12, 0], off: [0, P.bob || 0, 0] });
    const head = xform({ pivot: [0, 24, 0], rot: [-(P.head ? P.head[1] : 0), P.head ? P.head[0] : 0, 0], parent: root });
    const limb = (pv, r) => xform({ pivot: pv, rot: r || [0, 0, 0], parent: root });
    const armR = limb([-5, 22, 0], P.armR), armL = limb([5, 22, 0], P.armL);
    const legR = xform({ pivot: [-1.9, 12, 0], rot: P.legR || [0, 0, 0], off: [0, P.bob || 0, 0] }), legL = xform({ pivot: [1.9, 12, 0], rot: P.legL || [0, 0, 0], off: [0, P.bob || 0, 0] });
    const box = (T, b) => boxFaces(out, Object.assign({ tex: sk }, b), T, cam);
    box(head, { x: -4, y: 24, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0 }); box(head, { x: -4, y: 24, z: -4, w: 8, h: 8, d: 8, u: 32, v: 0, g: 0.5 });
    box(root, { x: -4, y: 12, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16 }); box(root, { x: -4, y: 12, z: -2, w: 8, h: 12, d: 4, u: 16, v: 32, g: 0.25 });
    box(armR, { x: -8, y: 12, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16 }); box(armR, { x: -8, y: 12, z: -2, w: 4, h: 12, d: 4, u: 40, v: 32, g: 0.25 });
    box(armL, { x: 4, y: 12, z: -2, w: 4, h: 12, d: 4, u: 32, v: 48 }); box(armL, { x: 4, y: 12, z: -2, w: 4, h: 12, d: 4, u: 48, v: 48, g: 0.25 });
    box(legR, { x: -3.9, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16 }); box(legR, { x: -3.9, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 32, g: 0.25 });
    box(legL, { x: -0.1, y: 0, z: -2, w: 4, h: 12, d: 4, u: 16, v: 48 }); box(legL, { x: -0.1, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 48, g: 0.25 });
    // the armor, on the same joints (layer 1: helmet, chestplate, boots; layer 2: leggings)
    const t = (tier, n) => { const T = TIERS[tier]; if (!T) return null; const im = tex[T[0] + n]; return im && T[1] ? dyeTex(im, T[1]) : im; };
    const ar = (T, b) => { if (b.tex) boxFaces(out, Object.assign({ zb: 0.02 }, b), T, cam); };
    if (A.head) ar(head, { x: -4, y: 24, z: -4, w: 8, h: 8, d: 8, u: 0, v: 0, tex: t(A.head, 1), g: 1 });
    if (A.chest) { const c = t(A.chest, 1); ar(root, { x: -4, y: 12, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16, tex: c, g: 1.01 });
      ar(armR, { x: -8, y: 12, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, tex: c, g: 1 }); ar(armL, { x: 4, y: 12, z: -2, w: 4, h: 12, d: 4, u: 40, v: 16, tex: c, g: 1, mirror: true }); }
    if (A.legs) { const l = t(A.legs, 2); ar(root, { x: -4, y: 12, z: -2, w: 8, h: 12, d: 4, u: 16, v: 16, tex: l, g: 0.5 });
      ar(legR, { x: -3.9, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, tex: l, g: 0.5 }); ar(legL, { x: -0.1, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, tex: l, g: 0.5, mirror: true }); }
    if (A.feet) { const f = t(A.feet, 1); ar(legR, { x: -3.9, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, tex: f, g: 1 }); ar(legL, { x: -0.1, y: 0, z: -2, w: 4, h: 12, d: 4, u: 0, v: 16, tex: f, g: 1, mirror: true }); }
    return out;
  }

  /* the acts: the game's own idle sway, a walk cycle, a wave */
  function pose(action, t, look) {
    const P = { head: look ? look.slice() : [0, 0] };
    if (action === 'still') return P;
    const br = Math.sin(t * 1.6);   // breathing
    P.armR = [0.04 * br, 0, -0.05 - 0.03 * Math.sin(t * 1.2)]; P.armL = [-0.04 * br, 0, 0.05 + 0.03 * Math.sin(t * 1.2)];
    if (action === 'walk') { const w = Math.sin(t * 6.4), A = 0.6; P.legR = [A * w, 0, 0]; P.legL = [-A * w, 0, 0]; P.armR = [-A * 0.8 * w, 0, -0.05]; P.armL = [A * 0.8 * w, 0, 0.05]; P.bob = 0.35 * Math.abs(Math.cos(t * 6.4)); }
    if (action === 'wave') { const w = Math.sin(t * 7); P.armR = [-0.15, 0, -2.6 - 0.35 * w]; P.head[0] += 0.08 * Math.sin(t * 3.5); }
    return P;
  }

  function mount(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('[mc-avatar] no element ' + target);
    let cv = el.tagName === 'CANVAS' ? el : null;
    if (!cv) { cv = document.createElement('canvas'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', "Anand's Minecraft avatar"); Object.assign(cv.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' }); el.appendChild(cv); }
    const g = cv.getContext('2d');
    const o = Object.assign({}, DEFAULTS, options);
    let tex = {}, skin = null, ready = false, dead = false, raf = 0, last = performance.now(), clock = 0, yawDrag = 0, look = [0, 0], lookT = [0, 0], dragging = null;
    const reduce = () => o.reducedMotion === 'respect' && root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const armorOf = a => !a ? {} : typeof a === 'string' ? { head: a, chest: a, legs: a, feet: a } : a;

    async function load() {
      const want = [...new Set(Object.values(armorOf(o.armor)).filter(Boolean).map(k => TIERS[k] && TIERS[k][0]).filter(Boolean))];
      const [sk] = await Promise.all([loadImg(resolve(o.assets, o.skin)), ...want.flatMap(k => [1, 2].map(n => loadImg(o.assets + k + '_layer_' + n + '.png').then(im => { if (im) tex[k + n] = im; })))]);
      skin = sk; ready = !!skin;
    }
    function size() { const r = cv.getBoundingClientRect(), dpr = o.pixelRatio || Math.min(2, root.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
    function draw() {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); if (!ready) return;
      const A = armorOf(o.armor), tall = 34 + (A.head ? 1 : 0.5), s = Math.min(cv.height * o.fit / tall, cv.width * 0.9 / 18);
      const cy = o.align === 'bottom' ? cv.height - s * 1.2 : cv.height / 2 + s * (16 + 0.5);
      const cam = figCam(cv.width / 2, cy, s, o.yaw + yawDrag, o.pitch);
      flush(g, playerFaces(cam, skin, pose(o.action, clock, look), A, tex));
    }
    function tick(now) {
      if (dead) return; const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!o.paused) { clock += dt; if (!dragging) yawDrag += o.spin * dt; const k = 1 - Math.exp(-dt * 8); look = [lerp(look[0], lookT[0], k), lerp(look[1], lookT[1], k)]; size(); draw(); }
      raf = reduce() ? 0 : requestAnimationFrame(tick);
    }
    // the head follows the pointer; drag turns him
    const onMove = e => { if (dragging) { yawDrag = dragging.y0 + (e.clientX - dragging.x0) * 0.012; return; } if (!o.lookAtCursor) { lookT = [0, 0]; return; }
      const r = cv.getBoundingClientRect(), hx = r.left + r.width / 2, hy = r.top + r.height * 0.25;
      const yaw = clamp((e.clientX - hx) / Math.max(200, r.width * 1.5), -1, 1) * 0.9, pit = clamp((e.clientY - hy) / Math.max(200, r.height), -1, 1) * 0.5;
      lookT = [yaw, -pit]; };
    const onDown = e => { if (!o.drag) return; dragging = { x0: e.clientX, y0: yawDrag }; try { cv.setPointerCapture(e.pointerId); } catch (_) {} };
    const onUp = () => { dragging = null; };
    root.addEventListener('pointermove', onMove, { passive: true }); cv.addEventListener('pointerdown', onDown); root.addEventListener('pointerup', onUp);
    const ro = root.ResizeObserver ? new ResizeObserver(() => { size(); draw(); }) : null; if (ro) ro.observe(cv);

    const api = {
      canvas: cv,
      async set(next = {}) { const reload = ('skin' in next && next.skin !== o.skin) || ('armor' in next) || ('assets' in next);
        Object.keys(next).forEach(k => { if (k in DEFAULTS) o[k] = next[k]; });
        if ('yaw' in next) yawDrag = 0;
        if (reload) await load(); size(); draw(); if (!raf && !reduce() && !dead) { last = performance.now(); raf = requestAnimationFrame(tick); } return api; },
      get() { return Object.assign({}, o); },
      /* a PNG of the current frame (transparent) */
      toDataURL() { return cv.toDataURL('image/png'); },
      destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); root.removeEventListener('pointermove', onMove); root.removeEventListener('pointerup', onUp); if (cv !== el) cv.remove(); },
    };
    load().then(() => { size(); draw(); if (typeof o.onReady === 'function') o.onReady(api); if (!reduce()) raf = requestAnimationFrame(tick); });
    return api;
  }

  const ATTR = { yaw: Number, pitch: Number, spin: Number, fit: Number, pixelRatio: Number, skin: String, assets: String, action: String, align: String, reducedMotion: String,
    lookAtCursor: b => b !== 'false', drag: b => b !== 'false', paused: b => b !== 'false',
    armor: v => { try { return JSON.parse(v); } catch (e) { return v || null; } } };
  function fromAttrs(el) { const out = {}; Object.entries(ATTR).forEach(([k, conv]) => { if (el.dataset[k] != null) out[k] = conv(el.dataset[k]); }); return out; }
  function autoMount() { document.querySelectorAll('[data-mc-avatar]').forEach(el => { if (!el.mcAvatar) el.mcAvatar = mount(el, fromAttrs(el)); }); }
  if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount(); }

  root.MCAvatar = { mount, autoMount, DEFAULTS, TIERS, fromAttrs };
})(typeof window !== 'undefined' ? window : globalThis);
