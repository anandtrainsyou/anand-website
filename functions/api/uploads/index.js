// POST /api/uploads: start a multipart upload into R2.
// The browser then PUTs fixed-size parts and calls /complete, so large videos never sit in memory.

import { json, newId, readJson, HttpError } from '../_lib.js';

export const PART_SIZE = 10 * 1024 * 1024; // R2 needs equal parts (except the last), each at least 5 MB
const MAX_BYTES = { video: 5 * 1024 ** 3, image: 20 * 1024 ** 2 };
const TYPES = { video: /^video\/(mp4|quicktime|webm)$/, image: /^image\/(jpeg|png|webp)$/ };

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const kind = body.kind;
  if (!TYPES[kind]) throw new HttpError(400, 'kind must be video or image');
  if (!TYPES[kind].test(body.contentType || '')) throw new HttpError(415, `Unsupported ${kind} type: ${body.contentType}`);
  const size = num(body.size);
  if (!size || size > MAX_BYTES[kind]) throw new HttpError(413, `File is empty or too large for a ${kind}`);

  const id = newId();
  const ext = (String(body.filename || '').match(/\.([a-z0-9]{1,5})$/i)?.[1] || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase();
  const key = `${kind}s/${id}.${ext}`;
  const upload = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: body.contentType } });

  const m = body.meta || {};
  await env.DB.prepare(
    `INSERT INTO media (id, kind, r2_key, filename, content_type, size_bytes, duration_s, width, height, fps, video_codec, audio_codec, upload_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, kind, key, String(body.filename || '').slice(0, 200), body.contentType, size,
    num(m.durationS), num(m.width), num(m.height), num(m.fps),
    m.videoCodec ? String(m.videoCodec).slice(0, 40) : null, m.audioCodec ? String(m.audioCodec).slice(0, 40) : null,
    upload.uploadId).run();

  return json({ id, partSize: PART_SIZE, parts: Math.ceil(size / PART_SIZE) }, 201);
}
