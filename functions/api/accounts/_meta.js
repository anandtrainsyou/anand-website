// Instagram Login and Facebook Login: build the login link, then turn the returned code into stored tokens.

import { graph, GRAPH_VERSION as V, bases } from '../../../server/graph.js';
import { saveAccount, nowIso } from '../../../server/accounts.js';
import { encrypt, decrypt } from '../../../server/crypto.js';

const isoIn = seconds => (seconds ? new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null);

/* ---------- Instagram (Instagram API with Instagram Login; no Facebook Page needed) ---------- */

const IG_SCOPES = 'instagram_business_basic,instagram_business_content_publish';

export const instagram = {
  configured: env => !!(env.IG_APP_ID && env.IG_APP_SECRET),

  authorizeUrl(env, redirectUri, state) {
    const u = new URL('https://www.instagram.com/oauth/authorize');
    u.search = new URLSearchParams({ client_id: env.IG_APP_ID, redirect_uri: redirectUri, response_type: 'code', scope: IG_SCOPES, state, enable_fb_login: '0' });
    return u.toString();
  },

  async finish(env, code, redirectUri) {
    const b = bases(env);
    const res = await graph(`${b.igApi}/oauth/access_token`, {
      method: 'POST',
      params: { client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code },
    });
    const short = res.data?.[0] || res; // Meta has returned both shapes
    const perms = Array.isArray(short.permissions) ? short.permissions.join(',') : String(short.permissions || '');
    if (perms && !perms.includes('instagram_business_content_publish')) {
      throw new Error('Instagram didn’t grant publishing permission. Connect again and leave "content publishing" switched on.');
    }
    const long = await graph(`${b.ig}/access_token`, { params: { grant_type: 'ig_exchange_token', client_secret: env.IG_APP_SECRET, access_token: short.access_token } });
    const me = await graph(`${b.ig}/${V}/me`, { params: { fields: 'user_id,username,account_type', access_token: long.access_token } });
    await saveAccount(env, 'instagram', {
      displayName: `@${me.username}`, remoteId: String(me.user_id), accessToken: long.access_token,
      expiresAt: isoIn(long.expires_in), scopes: perms || IG_SCOPES,
    });
    return `@${me.username}`;
  },
};

/* ---------- Facebook Page (Facebook Login) ---------- */

const FB_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management';

async function listPages(env, userToken) {
  const res = await graph(`${bases(env).fb}/${V}/me/accounts`, { params: { fields: 'id,name,access_token,tasks', limit: 100, access_token: userToken } });
  // Only Pages you can post to.
  return (res.data || []).filter(p => !p.tasks || p.tasks.includes('CREATE_CONTENT'));
}

async function connectPage(env, page) {
  // A Page token derived from a long-lived user token doesn't expire.
  await saveAccount(env, 'facebook', { displayName: page.name, remoteId: page.id, accessToken: page.access_token, expiresAt: null, scopes: FB_SCOPES });
  return page.name;
}

export const facebook = {
  configured: env => !!(env.META_APP_ID && env.META_APP_SECRET),

  authorizeUrl(env, redirectUri, state) {
    const u = new URL(`https://www.facebook.com/${V}/dialog/oauth`);
    const q = { client_id: env.META_APP_ID, redirect_uri: redirectUri, state, response_type: 'code' };
    // "Facebook Login for Business" apps use a saved configuration instead of a scope list.
    if (env.FB_LOGIN_CONFIG_ID) q.config_id = env.FB_LOGIN_CONFIG_ID;
    else q.scope = FB_SCOPES;
    u.search = new URLSearchParams(q);
    return u.toString();
  },

  async finish(env, code, redirectUri) {
    const fb = bases(env).fb;
    const short = await graph(`${fb}/${V}/oauth/access_token`, {
      params: { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirectUri, code },
    });
    const long = await graph(`${fb}/${V}/oauth/access_token`, {
      params: { grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token },
    });
    const pages = await listPages(env, long.access_token);
    if (!pages.length) throw new Error('No Facebook Page you can post to was found. When logging in, tick the Page you want to use.');
    if (pages.length === 1) return connectPage(env, pages[0]);

    // Several Pages: keep the user token (encrypted) until one is picked in the dashboard.
    await env.DB.prepare(
      `INSERT INTO accounts (platform, status, pending_enc, pending_pages, updated_at) VALUES ('facebook', 'pending', ?, ?, ?)
       ON CONFLICT(platform) DO UPDATE SET status = 'pending', pending_enc = excluded.pending_enc, pending_pages = excluded.pending_pages, error = NULL, updated_at = excluded.updated_at`
    ).bind(await encrypt(env, long.access_token, 'facebook-pending'), JSON.stringify(pages.map(p => ({ id: p.id, name: p.name }))), nowIso()).run();
    return null;
  },

  async pickPage(env, pageId) {
    const row = await env.DB.prepare(`SELECT pending_enc FROM accounts WHERE platform = 'facebook' AND status = 'pending'`).first();
    if (!row) throw new Error('Connect Facebook again first.');
    const page = (await listPages(env, await decrypt(env, row.pending_enc, 'facebook-pending'))).find(p => p.id === pageId);
    if (!page) throw new Error('That Page isn’t available any more. Connect Facebook again.');
    return connectPage(env, page);
  },
};

export const PROVIDERS = { instagram, facebook };
