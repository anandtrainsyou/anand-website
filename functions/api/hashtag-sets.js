// Saved hashtag groups. GET lists them, POST { name, tags } creates or replaces by name, DELETE ?id= removes one.

import { json, readJson, newId, HttpError } from './_lib.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`SELECT id, name, tags FROM hashtag_sets ORDER BY name`).all();
  return json({ sets: results });
}

export async function onRequestPost({ request, env }) {
  const { name, tags } = await readJson(request);
  const n = String(name || '').trim().slice(0, 60), t = String(tags || '').trim().slice(0, 2000);
  if (!n || !t) throw new HttpError(400, 'Name and hashtags are required');
  await env.DB.prepare(`INSERT INTO hashtag_sets (id, name, tags) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET tags = excluded.tags`)
    .bind(newId(), n, t).run();
  return onRequestGet({ env });
}

export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  await env.DB.prepare(`DELETE FROM hashtag_sets WHERE id = ?`).bind(id).run();
  return onRequestGet({ env });
}
