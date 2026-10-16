// GET /api/accounts/:platform/callback: the platform sends the browser back here after login.

import { PROVIDERS } from '../_meta.js';
import { redirectUri, backToDashboard } from './connect.js';

const cookie = (request, name) =>
  (request.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(`${name}=`))?.slice(name.length + 1);

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const provider = PROVIDERS[params.platform];
  const done = query => {
    const res = backToDashboard(request, query);
    const out = new Response(null, res);
    out.headers.append('set-cookie', 'oauth_state=; Path=/api/accounts; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
    return out;
  };

  if (!provider) return done({ error: 'Unknown platform' });
  if (url.searchParams.get('error')) {
    return done({ error: url.searchParams.get('error_description') || url.searchParams.get('error_reason') || 'Login was cancelled' });
  }
  // The state must match the cookie set when the login started, so nobody else can plant their account here.
  const expected = cookie(request, 'oauth_state');
  if (!expected || expected !== `${params.platform}.${url.searchParams.get('state')}`) {
    return done({ error: 'That login link expired. Try connecting again.' });
  }
  const code = (url.searchParams.get('code') || '').replace(/#_$/, '');
  if (!code) return done({ error: 'The platform didn’t send a login code.' });

  try {
    const name = await provider.finish(env, code, redirectUri(env, request, params.platform));
    return done(name ? { connected: params.platform } : { pick: params.platform });
  } catch (err) {
    console.error(err);
    return done({ error: String(err.message).slice(0, 300) });
  }
}
