// GET / PUT / DELETE /api/posts/:id. A post can't be changed once any platform has started publishing it.

import { json, readJson, HttpError } from '../_lib.js';
import { savePost, loadPosts } from './_save.js';

async function load(env, id) {
  const [post] = await loadPosts(env, id);
  if (!post) throw new HttpError(404, 'Post not found');
  return post;
}

export async function onRequestGet({ env, params }) {
  return json({ post: await load(env, params.id) });
}

export async function onRequestPut({ request, env, params }) {
  await load(env, params.id);
  await savePost(env, await readJson(request), params.id);
  return json({ post: await load(env, params.id) });
}

export async function onRequestDelete({ env, params }) {
  const post = await load(env, params.id);
  if (post.targets.some(t => ['publishing', 'published'].includes(t.status))) {
    throw new HttpError(409, 'Already published on at least one platform. Delete it there instead.');
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM post_targets WHERE post_id = ?`).bind(params.id),
    env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(params.id),
  ]);
  return json({ deleted: params.id });
}
