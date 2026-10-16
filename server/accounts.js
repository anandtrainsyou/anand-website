// Connected accounts: one row per platform, tokens encrypted.

import { encrypt, decrypt } from './crypto.js';

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Store a freshly connected account, replacing any previous one for the platform. */
export async function saveAccount(env, platform, { displayName, remoteId, accessToken, refreshToken, expiresAt, scopes }) {
  await env.DB.prepare(
    `INSERT INTO accounts (platform, display_name, remote_account_id, access_token_enc, refresh_token_enc, expires_at, scopes, status, error, pending_enc, pending_pages, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'connected', NULL, NULL, NULL, ?)
     ON CONFLICT(platform) DO UPDATE SET
       display_name = excluded.display_name, remote_account_id = excluded.remote_account_id,
       access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at, scopes = excluded.scopes, status = 'connected', error = NULL,
       pending_enc = NULL, pending_pages = NULL, updated_at = excluded.updated_at`
  ).bind(platform, displayName ?? null, remoteId ?? null,
    await encrypt(env, accessToken, platform), await encrypt(env, refreshToken, platform),
    expiresAt ?? null, scopes ?? null, nowIso()).run();
}

/** The account with its access token decrypted, or null if it isn't connected. */
export async function loadAccount(env, platform) {
  const row = await env.DB.prepare(`SELECT * FROM accounts WHERE platform = ?`).bind(platform).first();
  if (!row || row.status !== 'connected') return null;
  return {
    platform, displayName: row.display_name, remoteId: row.remote_account_id, expiresAt: row.expires_at,
    updatedAt: row.updated_at,
    accessToken: await decrypt(env, row.access_token_enc, platform),
    refreshToken: await decrypt(env, row.refresh_token_enc, platform),
  };
}

export async function markNeedsReconnect(env, platform, error) {
  await env.DB.prepare(`UPDATE accounts SET status = 'needs_reconnect', error = ?, updated_at = ? WHERE platform = ?`)
    .bind(String(error).slice(0, 500), nowIso(), platform).run();
}
