// POST /api/posts/:id/retry { platform }: try a failed platform again from scratch, right away.

import { json, readJson, HttpError, nowIso } from '../../_lib.js';
import { loadPosts } from '../_save.js';

export async function onRequestPost({ request, env, params }) {
  const { platform } = await readJson(request);
  const res = await env.DB.prepare(
    `UPDATE post_targets SET status = 'scheduled', scheduled_at = ?, attempts = 0, error = NULL, progress = NULL,
       next_attempt_at = NULL, locked_until = NULL
     WHERE post_id = ? AND platform = ? AND status = 'failed'`
  ).bind(nowIso(), params.id, String(platform)).run();
  if (!res.meta.changes) throw new HttpError(409, 'Only a failed platform can be retried');
  return json({ post: (await loadPosts(env, params.id))[0] });
}
