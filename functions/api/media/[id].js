// GET /api/media/:id: stream an uploaded file back (for previews when editing a saved post).
// Supports Range so the video player can seek.

import { HttpError } from '../_lib.js';

export async function onRequestGet({ request, env, params }) {
  const media = await env.DB.prepare(`SELECT r2_key FROM media WHERE id = ? AND status = 'ready'`).bind(params.id).first();
  if (!media) throw new HttpError(404, 'Not found');

  const obj = await env.MEDIA.get(media.r2_key, { range: request.headers, onlyIf: request.headers });
  if (!obj) throw new HttpError(404, 'File missing from storage');

  const headers = new Headers({ 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', etag: obj.httpEtag });
  obj.writeHttpMetadata(headers);
  if (!('body' in obj)) return new Response(null, { status: 304, headers });

  if (obj.range && request.headers.has('range')) {
    const r = obj.range;
    const offset = r.suffix != null ? obj.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix != null ? r.suffix : (r.length ?? obj.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}
