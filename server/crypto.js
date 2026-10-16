// Token encryption and signed media links. Used by the Pages API and the publisher worker.

const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const keyCache = new Map();
async function aesKey(secret) {
  if (!secret) throw new Error('TOKEN_KEY is not set');
  if (!keyCache.has(secret)) {
    const raw = unb64(secret);
    if (raw.length !== 32) throw new Error('TOKEN_KEY must be 32 bytes, base64-encoded');
    keyCache.set(secret, await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return keyCache.get(secret);
}

/** AES-GCM. `label` (e.g. "instagram") is bound in, so a token can't be swapped onto another platform. */
export async function encrypt(env, plaintext, label) {
  if (plaintext == null) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(label) }, await aesKey(env.TOKEN_KEY), enc.encode(plaintext));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(env, stored, label) {
  if (!stored) return null;
  const [iv, ct] = stored.split('.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: enc.encode(label) }, await aesKey(env.TOKEN_KEY), unb64(ct));
  return new TextDecoder().decode(pt);
}

async function hmacHex(secret, msg) {
  if (!secret) throw new Error('MEDIA_URL_KEY is not set');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** A link platforms can fetch a file from without logging in. Expires (default 6 hours). */
export async function signedMediaUrl(env, mediaId, ttlSeconds = 6 * 3600) {
  const base = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('PUBLIC_BASE_URL is not set');
  const e = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${base}/m/${mediaId}?e=${e}&s=${await hmacHex(env.MEDIA_URL_KEY, `${mediaId}.${e}`)}`;
}

export async function verifyMediaSignature(env, mediaId, e, s) {
  if (!/^\d+$/.test(e || '') || Number(e) < Date.now() / 1000 || !/^[0-9a-f]{64}$/.test(s || '')) return false;
  const want = await hmacHex(env.MEDIA_URL_KEY, `${mediaId}.${e}`);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}
