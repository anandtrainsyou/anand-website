// GET /m/:id?e=&s=: public, signed, expiring link to one uploaded file.
// Instagram and Facebook download videos and covers from here. Lives outside /api, so no Access login.

import { verifyMediaSignature } from '../../server/crypto.js';
import { r2Response } from '../../server/r2-response.js';

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  if (!(await verifyMediaSignature(env, params.id, url.searchParams.get('e'), url.searchParams.get('s')))) {
    return new Response('Link expired or invalid', { status: 403 });
  }
  const media = await env.DB.prepare(`SELECT r2_key FROM media WHERE id = ? AND status = 'ready'`).bind(params.id).first();
  const res = media && await r2Response(env.MEDIA, media.r2_key, request, 'private, no-store');
  return res || new Response('Not found', { status: 404 });
}

export const onRequestHead = onRequestGet;
