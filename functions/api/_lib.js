// Small helpers shared by the studio API.

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const newId = () => crypto.randomUUID();

export async function readJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'Body must be JSON'); }
}

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
