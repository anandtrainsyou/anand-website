// GET /api/accounts/:platform/connect: send the browser to the platform's login page.

import { PROVIDERS } from '../_meta.js';

export const redirectUri = (env, request, platform) =>
  `${(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')}/api/accounts/${platform}/callback`;

export const backToDashboard = (request, query) =>
  Response.redirect(`${new URL(request.url).origin}/dashboard/?view=accounts&${new URLSearchParams(query)}`, 302);

export async function onRequestGet({ request, env, params }) {
  const provider = PROVIDERS[params.platform];
  if (!provider) return backToDashboard(request, { error: `Connecting ${params.platform} isn’t built yet.` });
  if (!provider.configured(env)) return backToDashboard(request, { error: `Add the ${params.platform} app keys in Cloudflare first (see README).` });

  const state = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const res = Response.redirect(provider.authorizeUrl(env, redirectUri(env, request, params.platform), state), 302);
  const out = new Response(null, res);
  out.headers.append('set-cookie', `oauth_state=${params.platform}.${state}; Path=/api/accounts; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  return out;
}
