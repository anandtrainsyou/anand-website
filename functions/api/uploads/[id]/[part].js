// PUT /api/uploads/:id/:part: one part of a multipart upload (1-based part number).

import { json, HttpError } from '../../_lib.js';
import { PART_SIZE } from '../index.js';

export async function onRequestPut({ request, env, params }) {
  const n = Number(params.part);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw new HttpError(400, 'Bad part number');

  const media = await env.DB.prepare(`SELECT r2_key, upload_id, size_bytes FROM media WHERE id = ? AND status = 'uploading'`)
    .bind(params.id).first();
  if (!media) throw new HttpError(404, 'No upload in progress with that id');

  const body = await request.arrayBuffer();
  const expected = Math.min(PART_SIZE, media.size_bytes - (n - 1) * PART_SIZE);
  if (body.byteLength !== expected) throw new HttpError(400, `Part ${n} should be ${expected} bytes, got ${body.byteLength}`);

  const part = await env.MEDIA.resumeMultipartUpload(media.r2_key, media.upload_id).uploadPart(n, body);
  return json({ partNumber: part.partNumber, etag: part.etag });
}
