// GET /api/media/:id: stream an uploaded file back (for previews when editing a saved post).

import { HttpError } from '../_lib.js';
import { r2Response } from '../../../server/r2-response.js';

export async function onRequestGet({ request, env, params }) {
  const media = await env.DB.prepare(`SELECT r2_key FROM media WHERE id = ? AND status = 'ready'`).bind(params.id).first();
  if (!media) throw new HttpError(404, 'Not found');
  const res = await r2Response(env.MEDIA, media.r2_key, request, 'private, max-age=3600');
  if (!res) throw new HttpError(404, 'File missing from storage');
  return res;
}
