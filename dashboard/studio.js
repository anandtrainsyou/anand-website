// Studio: one video in, a post per platform out.
// Everything renders from the state object S. Typing only updates counters, so inputs keep focus;
// structural changes (new video, thumbnail, tabs) re-render the affected parts.

import { PLATFORMS, PLATFORM_IDS, finalText, textLength, countHashtags, checkVideo } from './platforms.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MB = 1024 * 1024;

/* ---------- API ---------- */

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { ...opts, headers: { 'content-type': 'application/json', ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const typeOf = file => file.type || MIME[file.name.split('.').pop().toLowerCase()] || '';

/** Multipart upload straight into R2, three parts at a time. Resolves to the media id. */
async function uploadFile(file, kind, meta, onProgress) {
  const { id, partSize, parts } = await api('/uploads', {
    method: 'POST',
    body: JSON.stringify({ kind, filename: file.name, contentType: typeOf(file), size: file.size, meta }),
  });
  const done = [];
  let next = 1, sent = 0;
  async function worker() {
    while (next <= parts) {
      const n = next++;
      const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
      for (let attempt = 1; ; attempt++) {
        try {
          done.push(await api(`/uploads/${id}/${n}`, { method: 'PUT', body: blob, headers: { 'content-type': 'application/octet-stream' } }));
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          await sleep(1000 * attempt);
        }
      }
      sent += blob.size;
      onProgress?.(sent / file.size);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  await api(`/uploads/${id}/complete`, { method: 'POST', body: JSON.stringify({ parts: done }) });
  return id;
}

/* ---------- reading a video in the browser ---------- */

let mp4boxLoad;
const loadMp4box = () => mp4boxLoad ??= new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js';
  s.onload = resolve; s.onerror = () => reject(new Error('Could not load the video reader'));
  document.head.append(s);
});

// Frame rate and codecs live in the MP4 headers. mp4box tells us which byte it needs next,
// so it can jump over the video data to a header at the end of the file.
async function readTracks(file) {
  await loadMp4box();
  const mp4 = window.MP4Box.createFile();
  let info = null, failed = null;
  mp4.onReady = i => { info = i; };
  mp4.onError = e => { failed = e; };
  let offset = 0;
  while (!info && !failed && offset < file.size) {
    const buf = await file.slice(offset, offset + 4 * MB).arrayBuffer();
    buf.fileStart = offset;
    const want = mp4.appendBuffer(buf);
    offset = typeof want === 'number' && want > offset ? want : offset + buf.byteLength;
  }
  if (!info) mp4.flush();
  return info;
}

async function probeVideo(file, url) {
  const meta = { sizeBytes: file.size };
  const v = document.createElement('video');
  v.preload = 'metadata'; v.muted = true; v.src = url;
  await new Promise((resolve, reject) => {
    v.onloadedmetadata = resolve;
    v.onerror = () => reject(new Error('This browser can’t read that video. Export it as an H.264 MP4.'));
  });
  // The <video> element applies phone rotation, so its size is what viewers see.
  Object.assign(meta, { durationS: v.duration, width: v.videoWidth, height: v.videoHeight });
  try {
    const info = await readTracks(file);
    const vt = info?.videoTracks?.[0], at = info?.audioTracks?.[0];
    if (vt) {
      meta.videoCodec = vt.codec;
      const secs = vt.duration / vt.timescale;
      if (vt.nb_samples && secs) meta.fps = Math.round((vt.nb_samples / secs) * 100) / 100;
    }
    if (at) meta.audioCodec = at.codec;
  } catch (err) {
    console.warn('Could not read MP4 headers', err);
  }
  return meta;
}

/** Any image (or the current frame of a <video>) → JPEG file. Platforms are happiest with JPEG covers. */
async function toJpeg(source, name, maxSide = 1920) {
  const w0 = source.videoWidth || source.naturalWidth, h0 = source.videoHeight || source.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * scale); c.height = Math.round(h0 * scale);
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  return new File([blob], name, { type: 'image/jpeg' });
}

async function fileToImage(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  return img;
}

/* ---------- formatting ---------- */

const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtSize = b => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : `${Math.max(1, Math.round(b / MB))} MB`);
const codecName = c => (!c ? '' : /^avc/i.test(c) ? 'H.264' : /^(hvc|hev)/i.test(c) ? 'HEVC' : /^mp4a/i.test(c) ? 'AAC' : c.split('.')[0]);
function metaLine(m) {
  if (!m) return '';
  const bits = [];
  if (m.width) bits.push(`${m.width}×${m.height}`);
  if (m.fps) bits.push(`${Math.round(m.fps * 100) / 100}fps`);
  if (m.durationS) bits.push(fmtTime(m.durationS));
  if (m.sizeBytes) bits.push(fmtSize(m.sizeBytes));
  const codecs = [codecName(m.videoCodec), codecName(m.audioCodec)].filter(Boolean).join(' + ');
  if (codecs) bits.push(codecs);
  return bits.join(' · ');
}
const pad = n => String(n).padStart(2, '0');
const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toIso = local => (local ? new Date(local).toISOString() : null);
const fmtWhen = iso => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ---------- state ---------- */

const OPTION_DEFAULTS = {
  youtube: { privacy: 'public', madeForKids: false },
  instagram: { shareToFeed: true },
  facebook: {},
  // TikTok's rules: no default audience and interactions off until the creator turns them on.
  tiktok: { privacy: '', comments: false, duet: false, stitch: false, disclose: false, yourBrand: false, branded: false },
  x: {},
  linkedin: { visibility: 'PUBLIC' },
};

const blankTarget = p => ({ enabled: true, own: null, title: '', caption: '', hashtags: '', thumb: null, offsetMs: null, options: { ...OPTION_DEFAULTS[p] }, at: '' });
const fresh = () => ({
  postId: null, main: null, baseCaption: '', baseHashtags: '',
  targets: Object.fromEntries(PLATFORM_IDS.map(p => [p, blankTarget(p)])),
  open: ['youtube'], when: 'now', at: '', sets: S?.sets || [],
});
let S = null;
S = fresh();

const enabledIds = () => PLATFORM_IDS.filter(p => S.targets[p].enabled);
const videoFor = p => S.targets[p].own || S.main;

/** Eligibility of the video this platform will get. level: ok | warn | block | none */
function statusOf(p) {
  const v = videoFor(p);
  if (!v) return { level: 'none', reasons: ['No video yet'] };
  if (v.status === 'empty') return { level: 'none', reasons: ['Add its own video'] };
  if (v.status === 'error') return { level: 'block', reasons: [v.error] };
  if (!v.meta) return { level: 'none', reasons: ['Reading video…'] };
  return checkVideo(p, v.meta);
}

const blockedByMain = () => S.main?.meta
  ? enabledIds().filter(p => !S.targets[p].own && checkVideo(p, S.main.meta).level === 'block')
  : [];

const busy = () => [S.main, ...PLATFORM_IDS.flatMap(p => [S.targets[p].own, S.targets[p].thumb])]
  .some(x => x && (x.status === 'probing' || x.status === 'uploading'));

/* ---------- video intake (main or per-platform cut) ---------- */

async function takeVideo(file, assign) {
  const type = typeOf(file);
  if (!/^video\/(mp4|quicktime|webm)$/.test(type)) return toast('That isn’t an MP4, MOV or WebM video.');
  const v = { name: file.name, url: URL.createObjectURL(file), status: 'probing', progress: 0, meta: null, mediaId: null };
  assign(v);
  renderAll();
  try {
    v.meta = await probeVideo(file, v.url);
    v.status = 'uploading';
    renderAll();
    v.mediaId = await uploadFile(file, 'video', v.meta, f => { v.progress = f; paintProgress(); });
    v.status = 'ready';
  } catch (err) {
    v.status = 'error'; v.error = err.message;
  }
  renderAll();
}

async function takeThumb(p, file) {
  const t = S.targets[p];
  const thumb = { url: URL.createObjectURL(file), status: 'uploading', progress: 0, mediaId: null };
  t.thumb = thumb;
  renderPanels();
  try {
    if (PLATFORMS[p].thumbnailMaxBytes && file.size > PLATFORMS[p].thumbnailMaxBytes) {
      throw new Error(`${PLATFORMS[p].name} covers must be under ${fmtSize(PLATFORMS[p].thumbnailMaxBytes)}`);
    }
    thumb.mediaId = await uploadFile(file, 'image', null, f => { thumb.progress = f; paintProgress(); });
    thumb.status = 'ready';
  } catch (err) {
    thumb.status = 'error'; thumb.error = err.message;
  }
  renderPanels();
}

/* ---------- rendering ---------- */

function dropZone(id, label, sub) {
  return `<label class="drop" data-drop="${id}">
    <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden>
    <b>${esc(label)}</b><span class="hud">${esc(sub)}</span>
  </label>`;
}

function videoState(v) {
  if (v.status === 'probing') return '<span class="hud">Reading video…</span>';
  if (v.status === 'uploading') return `<div class="prog"><i data-prog style="width:${Math.round(v.progress * 100)}%"></i></div><span class="hud">Uploading ${Math.round(v.progress * 100)}%</span>`;
  if (v.status === 'error') return `<span class="hud bad">${esc(v.error)}</span>`;
  return '<span class="hud good">Uploaded</span>';
}

function renderMainVideo() {
  const el = $('#main-video');
  const v = S.main;
  if (!v) {
    el.innerHTML = `<h2 class="hud">Video</h2>${dropZone('main', 'Drop your video', 'MP4 or MOV · 1080×1920 · up to 60fps')}`;
    return;
  }
  el.innerHTML = `
    <h2 class="hud">Video <button class="link" data-act="replace-main">Replace</button></h2>
    <video class="player" src="${esc(v.url)}" controls playsinline preload="metadata"></video>
    <p class="meta">${esc(v.name || '')}<br><span class="hud">${esc(metaLine(v.meta))}</span></p>
    <div data-state="main">${videoState(v)}</div>
    <input type="file" data-replace-main accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden>`;
}

const LEVEL_TEXT = { ok: 'Good to go', warn: 'Check', block: 'Won’t fit', none: '' };

function renderElig() {
  $('#elig').innerHTML = PLATFORM_IDS.map(p => {
    const t = S.targets[p], st = statusOf(p);
    const note = st.reasons.length ? st.reasons.join(' · ') : LEVEL_TEXT[st.level];
    return `<li class="${t.enabled ? '' : 'off'}">
      <label class="tog"><input type="checkbox" data-enable="${p}" ${t.enabled ? 'checked' : ''}><span class="sr">Post to ${PLATFORMS[p].name}</span></label>
      <button class="pname" data-open="${p}"><span class="badge ${st.level}">${PLATFORMS[p].short}</span>${esc(PLATFORMS[p].name)}${t.own ? '<em>own cut</em>' : ''}</button>
      <span class="why ${st.level}">${esc(note)}</span>
    </li>`;
  }).join('');

  const blocked = blockedByMain();
  $('#fix').innerHTML = blocked.length
    ? `<button class="btn fixbtn" data-act="fix">Fix ${blocked.length === 1 ? PLATFORMS[blocked[0]].name : `${blocked.length} platforms`} with their own video</button>
       <p class="hud">Opens ${blocked.map(p => PLATFORMS[p].name).join(' and ')} side by side so you can drop in a different cut.</p>`
    : '';
}

function textIssues(p) {
  const pl = PLATFORMS[p], t = S.targets[p];
  const text = finalText(t, { caption: S.baseCaption, hashtags: S.baseHashtags });
  return {
    text,
    len: textLength(p, text),
    tags: countHashtags(text),
    over: textLength(p, text) > pl.caption.max || (pl.maxHashtags && countHashtags(text) > pl.maxHashtags) || (pl.title && [...t.title].length > pl.title.max),
  };
}

function renderTabs() {
  const ids = enabledIds();
  if (!S.open.some(p => ids.includes(p))) S.open = ids.slice(0, 1);
  $('#tabs').innerHTML = ids.map(p => {
    const st = statusOf(p), on = S.open.includes(p);
    return `<button role="tab" aria-selected="${on}" data-tab="${p}" title="Cmd/Ctrl-click to open several side by side">
      <span class="dot ${st.level}"></span>${esc(PLATFORMS[p].name)}${textIssues(p).over ? '<span class="flag">!</span>' : ''}
    </button>`;
  }).join('') || '<p class="hud">Turn on at least one platform on the left.</p>';
}

function optionsHtml(p, o) {
  const sel = (key, opts) => `<select data-opt="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(o[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (key, label) => `<label class="chk"><input type="checkbox" data-opt="${key}" ${o[key] ? 'checked' : ''}> ${label}</label>`;
  switch (p) {
    case 'youtube':
      return `<label class="field"><span class="hud">Visibility</span>${sel('privacy', [['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']])}</label>
        <label class="field"><span class="hud">Made for kids?</span>${sel('madeForKids', [['false', 'No'], ['true', 'Yes']])}</label>`;
    case 'instagram':
      return chk('shareToFeed', 'Also show it on my profile grid');
    case 'linkedin':
      return `<label class="field"><span class="hud">Who can see it</span>${sel('visibility', [['PUBLIC', 'Anyone'], ['CONNECTIONS', 'Connections only']])}</label>`;
    case 'tiktok':
      return `<label class="field"><span class="hud">Who can view this video</span>${sel('privacy', [['', 'Choose…'], ['PUBLIC_TO_EVERYONE', 'Everyone'], ['MUTUAL_FOLLOW_FRIENDS', 'Friends'], ['SELF_ONLY', 'Only me']])}</label>
        <div class="row">${chk('comments', 'Allow comments')}${chk('duet', 'Allow Duet')}${chk('stitch', 'Allow Stitch')}</div>
        ${chk('disclose', 'This video promotes a brand, product or service')}
        ${o.disclose ? `<div class="row sub">${chk('yourBrand', 'Your brand')}${chk('branded', 'Branded content (paid partnership)')}</div>` : ''}
        <p class="hud fine">By posting, you agree to TikTok’s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Music Usage Confirmation</a>${o.branded ? ' and <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener">Branded Content Policy</a>' : ''}.</p>`;
    default:
      return '';
  }
}

function thumbHtml(p) {
  const pl = PLATFORMS[p], t = S.targets[p], v = videoFor(p);
  if (pl.thumbnail === 'none') return `<p class="hud fine">${esc(pl.thumbnailNote)}</p>`;
  const scrub = v?.url
    ? `<div class="scrub">
        <video src="${esc(v.url)}" muted playsinline preload="auto" data-scrub></video>
        <input type="range" min="0" max="${Math.max(0, Math.floor((v.meta?.durationS || 0) * 10))}" step="1" value="${Math.round((t.offsetMs ?? 0) / 100)}" data-scrub-range aria-label="Pick a frame">
        ${pl.thumbnail === 'frame'
          ? `<span class="hud">Cover at ${((t.offsetMs ?? 0) / 1000).toFixed(1)}s</span>`
          : '<button class="btn sm" data-act="use-frame">Use this frame</button>'}
      </div>`
    : '<p class="hud fine">Add a video to pick a frame.</p>';
  if (pl.thumbnail === 'frame') return `${scrub}<p class="hud fine">${esc(pl.thumbnailNote)}</p>`;

  const th = t.thumb;
  const chosen = th
    ? `<div class="chosen">
        <img src="${esc(th.url)}" alt="${esc(pl.name)} cover">
        ${th.status === 'uploading' ? `<div class="prog"><i data-prog style="width:${Math.round(th.progress * 100)}%"></i></div>` : ''}
        ${th.status === 'error' ? `<span class="hud bad">${esc(th.error)}</span>` : ''}
        <div class="row"><button class="link" data-act="thumb-all">Use for all</button><button class="link" data-act="thumb-clear">Remove</button></div>
      </div>`
    : '<div class="chosen empty"><span class="hud">No cover yet. The platform picks one.</span></div>';
  return `<div class="thumbs">${scrub}${chosen}</div>
    <label class="btn sm ghost"><input type="file" accept="image/jpeg,image/png,image/webp" data-thumb-file hidden>Upload image</label>
    ${pl.thumbnailNote ? `<p class="hud fine">${esc(pl.thumbnailNote)}</p>` : ''}`;
}

function vsrcHtml(p) {
  const t = S.targets[p], name = PLATFORMS[p].name;
  if (!t.own) {
    return `<div class="vsrc"><span class="hud">${S.main ? 'Uses the main video' : 'No video yet'}</span>
      <button class="link" data-act="own">Use a different cut for ${esc(name)}</button></div>`;
  }
  if (t.own.status === 'empty') {
    return `<div class="vsrc own">${dropZone(p, `Drop the ${name} cut`, `Max ${fmtTime(PLATFORMS[p].video.maxDuration)}`)}
      <button class="link" data-act="main">Back to the main video</button></div>`;
  }
  return `<div class="vsrc own">
      <p class="meta">${esc(t.own.name)}<br><span class="hud">${esc(metaLine(t.own.meta))}</span></p>
      <div data-state="${p}">${videoState(t.own)}</div>
      <div class="row"><label class="link"><input type="file" data-replace-own accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" hidden>Replace</label>
      <button class="link" data-act="main">Back to the main video</button></div>
    </div>`;
}

function panelHtml(p) {
  const pl = PLATFORMS[p], t = S.targets[p], st = statusOf(p);
  return `<section class="card panel" data-p="${p}">
    <header><h3>${esc(pl.name)}</h3><span class="why ${st.level}">${esc(st.reasons.join(' · ') || LEVEL_TEXT[st.level])}</span></header>
    ${vsrcHtml(p)}
    ${pl.title ? `<label class="field"><span class="hud">Title <i class="count" data-count="title"></i></span>
      <input type="text" data-f="title" value="${esc(t.title)}" placeholder="Required"></label>` : ''}
    <label class="field"><span class="hud">${esc(pl.caption.label)} <i class="count" data-count="text"></i></span>
      <textarea data-f="caption" rows="4" placeholder="Blank = main caption">${esc(t.caption)}</textarea></label>
    <label class="field"><span class="hud">Hashtags <i class="count" data-count="tags"></i></span>
      <input type="text" data-f="hashtags" value="${esc(t.hashtags)}" placeholder="Blank = main hashtags" autocomplete="off"></label>
    <div class="field"><span class="hud">Cover</span>${thumbHtml(p)}</div>
    ${optionsHtml(p, t.options)}
    ${S.when === 'each' ? `<label class="field"><span class="hud">Post at</span><input type="datetime-local" data-f="at" value="${esc(t.at)}"></label>` : ''}
    <details class="final"><summary class="hud">Final text</summary><pre data-final></pre></details>
  </section>`;
}

function updateCounts(p) {
  const panel = $(`.panel[data-p="${p}"]`);
  if (!panel) return;
  const pl = PLATFORMS[p], info = textIssues(p);
  const set = (key, text, bad) => { const el = $(`[data-count="${key}"]`, panel); if (el) { el.textContent = text; el.classList.toggle('over', !!bad); } };
  set('text', `${info.len}/${pl.caption.max}`, info.len > pl.caption.max);
  set('tags', pl.maxHashtags ? `${info.tags}/${pl.maxHashtags}` : `${info.tags}`, pl.maxHashtags && info.tags > pl.maxHashtags);
  if (pl.title) { const n = [...S.targets[p].title].length; set('title', `${n}/${pl.title.max}`, n > pl.title.max); }
  $('[data-final]', panel).textContent = info.text || '(empty)';
}

function renderPanels() {
  // Keep focus and cursor if a re-render happens mid-typing (e.g. an upload finishing).
  const a = document.activeElement;
  const keep = a?.dataset?.f && a.closest('.panel') ? { p: a.closest('.panel').dataset.p, f: a.dataset.f, s: a.selectionStart, e: a.selectionEnd } : null;

  const ids = S.open.filter(p => S.targets[p].enabled);
  const el = $('#panels');
  el.classList.toggle('multi', ids.length > 1);
  el.innerHTML = ids.map(panelHtml).join('');
  ids.forEach(updateCounts);
  $$('[data-scrub]', el).forEach(v => {
    const p = v.closest('.panel').dataset.p;
    v.addEventListener('loadedmetadata', () => { v.currentTime = Math.max(0.1, (S.targets[p].offsetMs ?? 0) / 1000); }, { once: true });
  });

  if (keep) {
    const f = $(`.panel[data-p="${keep.p}"] [data-f="${keep.f}"]`);
    if (f) { f.focus(); try { f.setSelectionRange(keep.s, keep.e); } catch {} }
  }
}

function paintProgress() {
  // Cheap progress updates without re-rendering panels.
  const all = [['main', S.main], ...PLATFORM_IDS.map(p => [p, S.targets[p].own])];
  for (const [key, v] of all) {
    const box = v && v.status === 'uploading' && $(`[data-state="${key}"]`);
    if (box) box.innerHTML = videoState(v);
  }
  for (const p of PLATFORM_IDS) {
    const th = S.targets[p].thumb, bar = th?.status === 'uploading' && $(`.panel[data-p="${p}"] .chosen [data-prog]`);
    if (bar) bar.style.width = `${Math.round(th.progress * 100)}%`;
  }
  renderButtons();
}

function renderSets() {
  $('#sets').innerHTML = S.sets.map(s => `<span class="chip"><button data-set="${esc(s.id)}" title="${esc(s.tags)}">${esc(s.name)}</button><button class="x" data-del-set="${esc(s.id)}" aria-label="Delete ${esc(s.name)}">×</button></span>`).join('')
    + '<button class="link" data-act="save-set">Save these hashtags as a set</button>';
}

function renderButtons() {
  const label = { now: 'Queue to post now', at: 'Schedule', each: 'Schedule' }[S.when];
  $('#submit').textContent = label;
  $('#submit').disabled = $('#save-draft').disabled = busy();
  $('#when-at').hidden = S.when !== 'at';
  $('#editing').textContent = S.postId ? 'Editing a saved post' : '';
  $('#new-post').hidden = !S.postId;
}

function renderAll() {
  renderMainVideo();
  renderElig();
  renderTabs();
  renderPanels();
  renderButtons();
}

/* ---------- events ---------- */

function bindDrop(root) {
  root.addEventListener('dragover', e => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  root.addEventListener('dragleave', e => e.target.closest('[data-drop]')?.classList.remove('over'));
  root.addEventListener('drop', e => {
    const d = e.target.closest('[data-drop]');
    if (!d) return;
    e.preventDefault(); d.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (file) onVideoFile(d.dataset.drop, file);
  });
  root.addEventListener('change', e => {
    const d = e.target.closest('[data-drop]');
    if (d && e.target.files?.[0]) onVideoFile(d.dataset.drop, e.target.files[0]);
  });
}

function onVideoFile(slot, file) {
  if (slot === 'main') takeVideo(file, v => { S.main = v; });
  else takeVideo(file, v => { S.targets[slot].own = v; });
}

bindDrop($('#main-video'));
bindDrop($('#panels'));

$('#main-video').addEventListener('click', e => {
  if (e.target.closest('[data-act="replace-main"]')) $('[data-replace-main]').click();
});
$('#main-video').addEventListener('change', e => {
  if (e.target.matches('[data-replace-main]') && e.target.files[0]) onVideoFile('main', e.target.files[0]);
});

$('#elig').addEventListener('change', e => {
  const p = e.target.dataset.enable;
  if (!p) return;
  S.targets[p].enabled = e.target.checked;
  if (e.target.checked) S.open = [p];
  renderElig(); renderTabs(); renderPanels();
});
$('#elig').addEventListener('click', e => {
  const b = e.target.closest('[data-open]');
  if (!b) return;
  const p = b.dataset.open;
  if (!S.targets[p].enabled) return;
  S.open = [p];
  renderTabs(); renderPanels();
  $('#tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#fix').addEventListener('click', e => {
  if (!e.target.closest('[data-act="fix"]')) return;
  const blocked = blockedByMain();
  for (const p of blocked) S.targets[p].own = { status: 'empty' };
  S.open = blocked;
  renderAll();
  $('#tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  const p = b.dataset.tab;
  if (e.metaKey || e.ctrlKey) S.open = S.open.includes(p) ? S.open.filter(x => x !== p) : [...S.open, p];
  else S.open = [p];
  renderTabs(); renderPanels();
});

$('#base-caption').addEventListener('input', e => { S.baseCaption = e.target.value; enabledIds().forEach(updateCounts); renderTabs(); });
$('#base-hashtags').addEventListener('input', e => { S.baseHashtags = e.target.value; enabledIds().forEach(updateCounts); renderTabs(); });

const panelOf = el => el.closest('.panel')?.dataset.p;

$('#panels').addEventListener('input', e => {
  const p = panelOf(e.target);
  if (!p) return;
  const t = S.targets[p];
  if (e.target.dataset.f) {
    t[e.target.dataset.f] = e.target.value;
    updateCounts(p); renderTabs();
  } else if (e.target.matches('[data-scrub-range]')) {
    const secs = Number(e.target.value) / 10;
    $('[data-scrub]', e.target.closest('.scrub')).currentTime = Math.max(0.05, secs);
    if (PLATFORMS[p].thumbnail === 'frame') {
      t.offsetMs = Math.round(secs * 1000);
      const label = e.target.closest('.scrub').querySelector('.hud');
      if (label) label.textContent = `Cover at ${secs.toFixed(1)}s`;
    }
  }
});

$('#panels').addEventListener('change', e => {
  const p = panelOf(e.target);
  if (!p) return;
  const t = S.targets[p];
  const key = e.target.dataset.opt;
  if (key) {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    t.options[key] = val === 'true' ? true : val === 'false' ? false : val;
    if (key === 'disclose' && !val) Object.assign(t.options, { yourBrand: false, branded: false });
    if (['disclose', 'branded'].includes(key)) renderPanels();
  } else if (e.target.matches('[data-thumb-file]') && e.target.files[0]) {
    const file = e.target.files[0];
    fileToImage(file).then(img => toJpeg(img, `${p}-cover.jpg`)).then(jpg => takeThumb(p, jpg))
      .catch(() => toast('Couldn’t read that image.'));
  } else if (e.target.matches('[data-replace-own]') && e.target.files[0]) {
    onVideoFile(p, e.target.files[0]);
  }
});

$('#panels').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  const p = b && panelOf(b);
  if (!p) return;
  const t = S.targets[p];
  switch (b.dataset.act) {
    case 'own': t.own = { status: 'empty' }; renderAll(); break;
    case 'main': t.own = null; renderAll(); break;
    case 'use-frame': {
      const v = $('[data-scrub]', b.closest('.scrub'));
      if (!v.videoWidth) return toast('The video is still loading.');
      t.offsetMs = Math.round(v.currentTime * 1000);
      takeThumb(p, await toJpeg(v, `${p}-frame.jpg`));
      break;
    }
    case 'thumb-clear': t.thumb = null; renderPanels(); break;
    case 'thumb-all': {
      if (t.thumb?.status !== 'ready') return toast('Wait for the cover to finish uploading.');
      const others = enabledIds().filter(x => PLATFORMS[x].thumbnail === 'image');
      for (const x of others) S.targets[x].thumb = { ...t.thumb };
      toast(`Cover set for ${others.map(x => PLATFORMS[x].name).join(', ')}`);
      renderPanels();
      break;
    }
  }
});

$$('input[name="when"]').forEach(r => r.addEventListener('change', () => {
  S.when = r.value;
  if (S.when === 'at' && !S.at) {
    const d = new Date(Date.now() + 3600_000); d.setMinutes(0, 0, 0);
    S.at = $('#when-at').value = toLocalInput(d);
  }
  renderButtons(); renderPanels();
}));
$('#when-at').addEventListener('input', e => { S.at = e.target.value; });

/* hashtag sets */
$('#sets').addEventListener('click', async e => {
  const use = e.target.closest('[data-set]'), del = e.target.closest('[data-del-set]');
  if (use) {
    const set = S.sets.find(s => s.id === use.dataset.set);
    const have = new Set(S.baseHashtags.split(/\s+/).filter(Boolean));
    const add = set.tags.split(/\s+/).filter(t => t && !have.has(t));
    S.baseHashtags = [S.baseHashtags.trim(), ...add].filter(Boolean).join(' ');
    $('#base-hashtags').value = S.baseHashtags;
    enabledIds().forEach(updateCounts); renderTabs();
  } else if (del) {
    S.sets = (await api(`/hashtag-sets?id=${encodeURIComponent(del.dataset.delSet)}`, { method: 'DELETE' })).sets;
    renderSets();
  } else if (e.target.closest('[data-act="save-set"]')) {
    if (!S.baseHashtags.trim()) return toast('Type some hashtags first.');
    const name = prompt('Name this hashtag set', '');
    if (!name) return;
    S.sets = (await api('/hashtag-sets', { method: 'POST', body: JSON.stringify({ name, tags: S.baseHashtags }) })).sets;
    renderSets();
  }
});

/* ---------- saving ---------- */

function clientProblems(schedule) {
  const out = [];
  const ids = enabledIds();
  if (!ids.length) out.push('Turn on at least one platform.');
  if (!schedule) return out;
  if (S.when === 'at' && !S.at) out.push('Pick a date and time.');
  for (const p of ids) {
    const pl = PLATFORMS[p], t = S.targets[p], st = statusOf(p), info = textIssues(p);
    if (st.level === 'block' || st.level === 'none') out.push(`${pl.name}: ${st.reasons.join(', ')}`);
    if (info.len > pl.caption.max) out.push(`${pl.name}: text is ${info.len}/${pl.caption.max}`);
    if (pl.maxHashtags && info.tags > pl.maxHashtags) out.push(`${pl.name}: ${info.tags} hashtags, max ${pl.maxHashtags}`);
    if (pl.title?.required && !t.title.trim()) out.push(`${pl.name}: needs a title`);
    if (S.when === 'each' && !t.at) out.push(`${pl.name}: pick a time`);
    if (t.thumb?.status === 'error') out.push(`${pl.name}: ${t.thumb.error}`);
    if (p === 'tiktok') {
      const o = t.options;
      if (!o.privacy) out.push('TikTok: choose who can view it');
      if (o.disclose && !o.yourBrand && !o.branded) out.push('TikTok: say whether it promotes your brand or is branded content');
      if (o.branded && o.privacy === 'SELF_ONLY') out.push('TikTok: branded content can’t be set to Only me');
    }
  }
  return out;
}

function payload(schedule) {
  return {
    mediaId: S.main?.mediaId || null,
    baseCaption: S.baseCaption,
    baseHashtags: S.baseHashtags,
    schedule,
    targets: enabledIds().map(p => {
      const t = S.targets[p];
      return {
        platform: p,
        mediaId: t.own?.mediaId || null,
        title: t.title, caption: t.caption, hashtags: t.hashtags,
        thumbnailMediaId: t.thumb?.status === 'ready' ? t.thumb.mediaId : null,
        thumbnailOffsetMs: t.offsetMs,
        options: t.options,
        scheduledAt: S.when === 'at' ? toIso(S.at) : S.when === 'each' ? toIso(t.at) : null,
      };
    }),
  };
}

async function save(schedule) {
  const box = $('#problems');
  const problems = clientProblems(schedule);
  box.hidden = !problems.length;
  box.textContent = problems.join('\n');
  if (problems.length) return;
  try {
    const body = JSON.stringify(payload(schedule));
    const { post } = S.postId
      ? await api(`/posts/${S.postId}`, { method: 'PUT', body })
      : await api('/posts', { method: 'POST', body });
    S.postId = post.id;
    renderButtons();
    toast(schedule ? `Queued for ${post.targets.length} platform${post.targets.length > 1 ? 's' : ''}` : 'Draft saved');
  } catch (err) {
    box.hidden = false;
    box.textContent = err.message;
  }
}

$('#save-draft').addEventListener('click', () => save(false));
$('#submit').addEventListener('click', () => save(true));
$('#new-post').addEventListener('click', () => {
  if (!confirm('Start a new post? Unsaved changes here will be lost.')) return;
  loadIntoComposer(null);
});

window.addEventListener('beforeunload', e => { if (busy()) e.preventDefault(); });

/* ---------- queue ---------- */

const STATUS_TEXT = { draft: 'Draft', scheduled: 'Scheduled', publishing: 'Posting…', published: 'Live', failed: 'Failed' };

async function renderQueue() {
  const list = $('#posts');
  list.innerHTML = '<li class="hud">Loading…</li>';
  try {
    const { posts } = await api('/posts');
    list.innerHTML = posts.length ? posts.map(post => {
      const locked = post.targets.some(t => ['publishing', 'published'].includes(t.status));
      const caption = post.baseCaption || post.targets.find(t => t.caption)?.caption || '';
      return `<li class="post">
        <div class="pmain">
          <b>${esc(post.media?.filename || 'No video')}</b>
          <span class="hud">Saved ${esc(fmtWhen(post.updatedAt))}</span>
          ${caption ? `<p>${esc(caption.slice(0, 140))}${caption.length > 140 ? '…' : ''}</p>` : ''}
        </div>
        <ul class="ptargets">${post.targets.map(t => `<li class="${t.status}">
          <span class="badge">${PLATFORMS[t.platform].short}</span>
          ${t.remoteUrl ? `<a href="${esc(t.remoteUrl)}" target="_blank" rel="noopener">${STATUS_TEXT[t.status]}</a>` : STATUS_TEXT[t.status]}
          ${t.scheduledAt && t.status !== 'published' ? `<span class="hud">${esc(fmtWhen(t.scheduledAt))}</span>` : ''}
          ${t.media ? '<em>own cut</em>' : ''}
          ${t.error ? `<span class="hud bad" title="${esc(t.error)}">${esc(t.error.slice(0, 60))}</span>` : ''}
        </li>`).join('')}</ul>
        <div class="pact">
          ${locked ? '' : `<button class="btn sm ghost" data-edit="${post.id}">Edit</button><button class="link" data-del="${post.id}">Delete</button>`}
        </div>
      </li>`;
    }).join('') : '<li class="hud">Nothing saved yet.</li>';
    list._posts = posts;
  } catch (err) {
    list.innerHTML = `<li class="hud bad">${esc(err.message)}</li>`;
  }
}

$('#posts').addEventListener('click', async e => {
  const edit = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
  if (edit) {
    loadIntoComposer($('#posts')._posts.find(p => p.id === edit.dataset.edit));
    showView('compose');
  } else if (del) {
    if (!confirm('Delete this post from the queue?')) return;
    try { await api(`/posts/${del.dataset.del}`, { method: 'DELETE' }); renderQueue(); }
    catch (err) { toast(err.message); }
  }
});

const savedVideo = m => m && { name: m.filename, url: `/api/media/${m.id}`, meta: m.meta, mediaId: m.id, status: 'ready', progress: 1 };

function loadIntoComposer(post) {
  S = fresh();
  if (post) {
    S.postId = post.id;
    S.main = savedVideo(post.media);
    S.baseCaption = post.baseCaption;
    S.baseHashtags = post.baseHashtags;
    for (const p of PLATFORM_IDS) S.targets[p].enabled = false;
    for (const t of post.targets) {
      Object.assign(S.targets[t.platform], {
        enabled: true, own: savedVideo(t.media), title: t.title, caption: t.caption, hashtags: t.hashtags,
        thumb: t.thumbnail && { url: `/api/media/${t.thumbnail.id}`, mediaId: t.thumbnail.id, status: 'ready', progress: 1 },
        offsetMs: t.thumbnailOffsetMs, options: { ...OPTION_DEFAULTS[t.platform], ...t.options },
        at: t.scheduledAt ? toLocalInput(new Date(t.scheduledAt)) : '',
      });
    }
    const times = [...new Set(post.targets.map(t => t.scheduledAt).filter(Boolean))];
    S.when = !times.length ? 'now' : times.length === 1 && post.targets.every(t => t.scheduledAt) ? 'at' : 'each';
    if (S.when === 'at') S.at = toLocalInput(new Date(times[0]));
    S.open = post.targets.slice(0, 1).map(t => t.platform);
  }
  $('#base-caption').value = S.baseCaption;
  $('#base-hashtags').value = S.baseHashtags;
  $$('input[name="when"]').forEach(r => { r.checked = r.value === S.when; });
  $('#when-at').value = S.at;
  $('#problems').hidden = true;
  renderAll();
  renderSets();
}

/* ---------- shell ---------- */

function showView(name) {
  $$('[data-view]').forEach(b => b.toggleAttribute('aria-current', b.dataset.view === name));
  $('#compose').hidden = name !== 'compose';
  $('#queue').hidden = name !== 'queue';
  if (name === 'queue') renderQueue();
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

renderAll();
api('/hashtag-sets').then(d => { S.sets = d.sets; renderSets(); }).catch(err => toast(err.message));
renderSets();
