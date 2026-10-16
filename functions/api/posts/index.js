// GET /api/posts: recent posts.  POST /api/posts: save a new draft or scheduled post.

import { json, readJson } from '../_lib.js';
import { savePost, loadPosts } from './_save.js';

export async function onRequestGet({ env }) {
  return json({ posts: await loadPosts(env) });
}

export async function onRequestPost({ request, env }) {
  const id = await savePost(env, await readJson(request));
  return json({ post: (await loadPosts(env, id))[0] }, 201);
}
