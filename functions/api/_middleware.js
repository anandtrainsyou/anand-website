// Every /api request must carry a valid Cloudflare Access login (the same one that guards /dashboard).
// Fails closed: if Access isn't configured, the API only answers on localhost for development.

import { json, HttpError } from './_lib.js';

const certCache = new Map(); // team domain -> { keys, fetchedAt }

const b64urlBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function accessKeys(team, force) {
  const hit = certCache.get(team);
  if (hit && !force && Date.now() - hit.fetchedAt < 3600_000) return hit.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError(503, 'Could not load Access signing keys');
  const { keys } = await res.json();
  certCache.set(team, { keys, fetchedAt: Date.now() });
  return keys;
}

async function verifyAccessJwt(token, env) {
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try { header = b64urlJson(h); payload = b64urlJson(p); } catch { return null; }
  if (header.alg !== 'RS256') return null;

  let jwk = (await accessKeys(team)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await accessKeys(team, true)).find(k => k.kid === header.kid); // keys rotated
  if (!jwk) return null;

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== `https://${team}` || !aud.includes(env.ACCESS_AUD) || !(payload.exp > now)) return null;

  const allowed = (env.ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(payload.email).toLowerCase())) return null;
  return payload;
}

async function authenticate({ request, env, next, data }) {
  const { hostname } = new URL(request.url);
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    if (hostname === 'localhost' || hostname === '127.0.0.1') return next();
    return json({ error: 'Studio login is not configured' }, 503);
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const user = token && await verifyAccessJwt(token, env);
  if (!user) return json({ error: 'Not signed in' }, 401);
  data.user = user;
  return next();
}

async function handleErrors({ next }) {
  try {
    return await next();
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error(err);
    return json({ error: 'Server error' }, 500);
  }
}

export const onRequest = [handleErrors, authenticate];
