// Keeps tokens alive. Instagram tokens last 60 days and can be renewed once they're a day old.
// Facebook Page tokens don't expire.

import { graph, bases, PublishError } from './graph.js';
import { loadAccount, markNeedsReconnect, nowIso } from './accounts.js';
import { encrypt } from './crypto.js';

const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

export async function refreshTokens(env) {
  const { results } = await env.DB.prepare(
    `SELECT platform FROM accounts WHERE platform = 'instagram' AND status = 'connected'
       AND expires_at IS NOT NULL AND expires_at < ? AND updated_at < ?`
  ).bind(iso(Date.now() + 10 * 864e5), iso(Date.now() - 864e5)).all();

  for (const { platform } of results) {
    const acc = await loadAccount(env, platform);
    try {
      const res = await graph(`${bases(env).ig}/refresh_access_token`, { params: { grant_type: 'ig_refresh_token', access_token: acc.accessToken } });
      await env.DB.prepare(`UPDATE accounts SET access_token_enc = ?, expires_at = ?, error = NULL, updated_at = ? WHERE platform = ?`)
        .bind(await encrypt(env, res.access_token, platform), iso(Date.now() + res.expires_in * 1000), nowIso(), platform).run();
    } catch (err) {
      if (err instanceof PublishError && err.reconnect) await markNeedsReconnect(env, platform, err.message);
      // Otherwise try again tomorrow rather than every minute.
      else await env.DB.prepare(`UPDATE accounts SET error = ?, updated_at = ? WHERE platform = ?`).bind(`Token refresh failed: ${err.message}`, nowIso(), platform).run();
    }
  }
}
