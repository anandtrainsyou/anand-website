// A fake Instagram + Facebook API for testing the studio locally, without real accounts.
// Point IG_GRAPH_BASE, IG_API_BASE, FB_GRAPH_BASE and FB_RUPLOAD_BASE at it (see README).
// Like Meta, it downloads each video from the signed link it's given, so those links get tested too.
//
//   node tools/fake-meta.mjs            (port 8790)
//   curl 'localhost:8790/__mode?ig=error'   make Instagram reject the next video
//   modes: ig=ok|error|expired-token, fb=ok|error|cover-error
//   curl localhost:8790/__log               what it received

import http from 'node:http';

const PORT = Number(process.env.PORT || 8790);
const mode = { ig: 'ok', fb: 'cover-error' };
const log = [];
const containers = new Map(); // id -> { polls, status }
const videos = new Map();     // fb video id -> { phase }
let seq = 1000;

async function download(url) {
  const res = await fetch(url);
  const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
  return { status: res.status, bytes, type: res.headers.get('content-type') };
}

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const graphError = (res, message, code = 100, status = 400) => send(res, status, { error: { message, type: 'OAuthException', code, fbtrace_id: 'fake' } });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const raw = await readBody(req);
  const ctype = req.headers['content-type'] || '';
  const form = ctype.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(raw.toString())) : {};
  const q = { ...Object.fromEntries(url.searchParams), ...form };
  const path = url.pathname.replace(/^\/v\d+\.\d+/, '');
  const entry = { method: req.method, path: url.pathname, params: { ...q, access_token: q.access_token && '…' } };
  log.push(entry);

  try {
    if (path === '/__mode') { Object.assign(mode, Object.fromEntries(url.searchParams)); return send(res, 200, mode); }
    if (path === '/__log') return send(res, 200, log);

    const token = q.access_token || (req.headers.authorization || '').replace(/^OAuth /, '');
    if (mode.ig === 'expired-token' && token.startsWith('IG')) return graphError(res, 'Error validating access token: Session has expired', 190, 400);

    /* ---- Instagram Login ---- */
    if (path === '/oauth/access_token' && req.method === 'POST') {
      if (q.code !== 'good-code') return graphError(res, 'Invalid code');
      return send(res, 200, { data: [{ access_token: 'IGshort', user_id: 17841400000, permissions: 'instagram_business_basic,instagram_business_content_publish' }] });
    }
    if (path === '/access_token') return send(res, 200, { access_token: 'IGlong-1', token_type: 'bearer', expires_in: 5184000 });
    if (path === '/refresh_access_token') return send(res, 200, { access_token: `IGlong-${++seq}`, token_type: 'bearer', expires_in: 5184000 });
    if (path === '/me' && token.startsWith('IG')) return send(res, 200, { user_id: '17841400000', username: 'anandtrainsyou', account_type: 'MEDIA_CREATOR' });

    /* ---- Instagram publishing ---- */
    if (/^\/\d+\/media$/.test(path) && req.method === 'POST') {
      if (q.media_type !== 'REELS' || !q.video_url) return graphError(res, 'media_type REELS and video_url are required');
      entry.download = await download(q.video_url);
      if (q.cover_url) entry.coverDownload = await download(q.cover_url);
      if (entry.download.status !== 200 || !entry.download.bytes) return graphError(res, 'Media download has failed. The media URI doesn’t meet our requirements.', 9004);
      const id = String(++seq);
      containers.set(id, { polls: 0, fail: mode.ig === 'error' });
      return send(res, 200, { id });
    }
    if (containers.has(path.slice(1)) && req.method === 'GET') {
      const c = containers.get(path.slice(1));
      c.polls++;
      if (c.published) return send(res, 200, { status_code: 'PUBLISHED', id: path.slice(1) });
      if (c.fail) return send(res, 200, { status_code: 'ERROR', status: 'Error: The video format is not supported (2207026)', id: path.slice(1) });
      return send(res, 200, { status_code: c.polls < 2 ? 'IN_PROGRESS' : 'FINISHED', id: path.slice(1) });
    }
    if (/^\/\d+\/media_publish$/.test(path)) {
      const c = containers.get(q.creation_id);
      if (!c) return graphError(res, 'Unknown container');
      c.published = true;
      return send(res, 200, { id: `IGMEDIA${q.creation_id}` });
    }
    if (path.startsWith('/IGMEDIA')) return send(res, 200, { permalink: `https://www.instagram.com/reel/FAKE${path.slice(8)}/` });

    /* ---- Facebook Login ---- */
    if (path === '/oauth/access_token' && req.method === 'GET') {
      if (q.grant_type === 'fb_exchange_token') return send(res, 200, { access_token: 'FBuserlong', token_type: 'bearer', expires_in: 5184000 });
      if (q.code !== 'good-code') return graphError(res, 'Invalid verification code format.');
      return send(res, 200, { access_token: 'FBusershort', token_type: 'bearer', expires_in: 3600 });
    }
    if (path === '/me/accounts') {
      return send(res, 200, { data: [
        { id: '111', name: 'ATcoaching', access_token: 'FBpage111', tasks: ['CREATE_CONTENT', 'MANAGE'] },
        { id: '222', name: 'Anand Lifts', access_token: 'FBpage222', tasks: ['CREATE_CONTENT'] },
        { id: '333', name: 'View-only Page', access_token: 'FBpage333', tasks: ['ANALYZE'] },
      ] });
    }

    /* ---- Facebook Reels ---- */
    if (/^\/\d+\/video_reels$/.test(path)) {
      if (q.upload_phase === 'start') {
        const id = `9${++seq}`;
        videos.set(id, { phase: 'started' });
        return send(res, 200, { video_id: id, upload_url: `https://rupload.facebook.com/video-upload/v23.0/${id}` });
      }
      if (q.upload_phase === 'finish') {
        const v = videos.get(q.video_id);
        if (!v || v.phase !== 'uploaded') return graphError(res, 'Upload not complete');
        v.phase = 'finished'; v.polls = 0; v.description = q.description;
        return send(res, 200, { success: true });
      }
    }
    if (path.startsWith('/video-upload/')) {
      const id = path.split('/').pop(), v = videos.get(id);
      if (!v) return send(res, 400, { debug_info: { retriable: false, type: 'NotFoundError', message: 'Unknown video id' } });
      entry.download = await download(req.headers.file_url);
      if (entry.download.status !== 200) return send(res, 400, { debug_info: { retriable: false, type: 'FetchError', message: `Couldn't fetch file_url (${entry.download.status})` } });
      v.phase = 'uploaded';
      return send(res, 200, { success: true });
    }
    if (/^\/9\d+\/thumbnails$/.test(path)) {
      entry.coverBytes = raw.length;
      if (mode.fb === 'cover-error') return graphError(res, 'Thumbnails are not supported for this video type');
      return send(res, 200, { success: true });
    }
    if (/^\/9\d+$/.test(path)) {
      const v = videos.get(path.slice(1));
      if (!v) return graphError(res, 'Unknown video');
      if (q.fields === 'permalink_url') return send(res, 200, { permalink_url: `/reel/${path.slice(1)}/` });
      const st = { video_status: 'processing', uploading_phase: { status: 'not_started' }, processing_phase: { status: 'not_started' }, publishing_phase: { status: 'not_started' } };
      if (v.phase !== 'started') st.uploading_phase.status = 'complete';
      if (v.phase === 'finished') {
        v.polls++;
        if (mode.fb === 'error') { st.processing_phase = { status: 'error', errors: [{ code: 1363023, message: 'Video is too long for a reel' }] }; }
        else { st.processing_phase.status = 'complete'; st.publishing_phase.status = v.polls >= 1 ? 'complete' : 'in_progress'; st.video_status = 'ready'; }
      }
      return send(res, 200, { status: st, id: path.slice(1) });
    }

    graphError(res, `Fake Meta doesn't know ${req.method} ${url.pathname}`, 803, 404);
  } catch (err) {
    console.error(err);
    graphError(res, err.message, 1, 500);
  }
}).listen(PORT, () => console.log(`fake Meta on http://localhost:${PORT}`));
