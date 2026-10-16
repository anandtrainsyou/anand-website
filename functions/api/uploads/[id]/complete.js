// POST /api/uploads/:id/complete: stitch the parts together. Body: { parts: [{ partNumber, etag }] }

import { json, readJson, HttpError } from '../../_lib.js';

export async function onRequestPost({ request, env, params }) {
  const { parts } = await readJson(request);
  if (!Array.isArray(parts) || !parts.length) throw new HttpError(400, 'parts is required');

  const media = await env.DB.prepare(`SELECT r2_key, upload_id, size_bytes FROM media WHERE id = ? AND status = 'uploading'`)
    .bind(params.id).first();
  if (!media) throw new HttpError(404, 'No upload in progress with that id');

  const sorted = parts.map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })).sort((a, b) => a.partNumber - b.partNumber);
  const obj = await env.MEDIA.resumeMultipartUpload(media.r2_key, media.upload_id).complete(sorted);
  if (obj.size !== media.size_bytes) throw new HttpError(400, `Upload is ${obj.size} bytes, expected ${media.size_bytes}`);

  await env.DB.prepare(`UPDATE media SET status = 'ready', upload_id = NULL WHERE id = ?`).bind(params.id).run();
  return json({ id: params.id, status: 'ready' });
}
