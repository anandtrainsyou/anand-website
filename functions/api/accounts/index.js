// GET /api/accounts: connection status per platform (never tokens).  DELETE /api/accounts?platform=: disconnect.

import { json, HttpError } from '../_lib.js';
import { PLATFORM_IDS } from '../../../dashboard/platforms.js';
import { ADAPTERS } from '../../../server/adapters/index.js';
import { PROVIDERS } from './_meta.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`SELECT platform, display_name, status, error, expires_at, pending_pages, updated_at FROM accounts`).all();
  const rows = new Map(results.map(r => [r.platform, r]));
  return json({
    accounts: PLATFORM_IDS.map(p => {
      const r = rows.get(p);
      return {
        platform: p,
        publishing: !!ADAPTERS[p],
        configured: !!PROVIDERS[p]?.configured(env),
        status: r?.status || 'disconnected',
        displayName: r?.display_name || null,
        expiresAt: r?.expires_at || null,
        error: r?.error || null,
        pages: r?.status === 'pending' ? JSON.parse(r.pending_pages || '[]') : null,
      };
    }),
  });
}

export async function onRequestDelete({ request, env }) {
  const platform = new URL(request.url).searchParams.get('platform');
  if (!PLATFORM_IDS.includes(platform)) throw new HttpError(400, 'Unknown platform');
  await env.DB.prepare(`DELETE FROM accounts WHERE platform = ?`).bind(platform).run();
  return onRequestGet({ env });
}
