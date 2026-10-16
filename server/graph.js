// Minimal client for Meta's Graph APIs (Instagram and Facebook).

export const GRAPH_VERSION = 'v23.0';

// Overridable only so tests can point at a fake Meta; production uses the defaults.
export const bases = env => ({
  ig: env.IG_GRAPH_BASE || 'https://graph.instagram.com',
  igApi: env.IG_API_BASE || 'https://api.instagram.com',
  fb: env.FB_GRAPH_BASE || 'https://graph.facebook.com',
  rupload: env.FB_RUPLOAD_BASE || 'https://rupload.facebook.com',
});

/** retry: worth trying again later. reconnect: the token is dead, the account must be connected again. */
export class PublishError extends Error {
  constructor(message, { retry = false, reconnect = false } = {}) {
    super(message);
    this.retry = retry;
    this.reconnect = reconnect;
  }
}

// Server hiccups and rate limits (2207001/2207003 are Instagram "server error" and "timeout").
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 2207001, 2207003]);

/**
 * GET with params in the query, or POST with a form body. Throws PublishError on any Graph error.
 * opts: { method, params, headers, formData } (formData = multipart body, e.g. an image upload)
 */
export async function graph(url, { method = 'GET', params = {}, headers = {}, formData } = {}) {
  const u = new URL(url);
  const clean = Object.entries(params).filter(([, v]) => v != null && v !== '');
  let body;
  if (method === 'GET' || formData) clean.forEach(([k, v]) => u.searchParams.set(k, String(v)));
  if (formData) body = formData;
  else if (method !== 'GET') body = new URLSearchParams(clean.map(([k, v]) => [k, String(v)]));

  let res;
  try {
    res = await fetch(u, { method, body, headers });
  } catch (err) {
    throw new PublishError(`Couldn't reach ${u.host}: ${err.message}`, { retry: true });
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }

  // Facebook's upload host reports errors as debug_info instead of error.
  const e = data?.error || (data?.debug_info && { message: data.debug_info.message, is_transient: data.debug_info.retriable });
  if (!res.ok || e) {
    const code = e?.code, sub = e?.error_subcode;
    const msg = e?.error_user_msg || e?.message || data.raw || `HTTP ${res.status}`;
    throw new PublishError(`${msg}${code ? ` (code ${code}${sub ? `/${sub}` : ''})` : ''}`, {
      reconnect: code === 190 || code === 102,
      retry: res.status >= 500 || res.status === 429 || e?.is_transient === true || TRANSIENT_CODES.has(code) || TRANSIENT_CODES.has(sub),
    });
  }
  return data;
}
