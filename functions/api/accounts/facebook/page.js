// POST /api/accounts/facebook/page { pageId }: choose which Facebook Page to post to.

import { json, readJson, HttpError } from '../../_lib.js';
import { facebook } from '../_meta.js';

export async function onRequestPost({ request, env }) {
  const { pageId } = await readJson(request);
  try {
    return json({ connected: await facebook.pickPage(env, String(pageId)) });
  } catch (err) {
    throw new HttpError(400, err.message);
  }
}
