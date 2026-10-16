// Stream an R2 object as an HTTP response, with Range support so players and platforms can seek.

export async function r2Response(bucket, key, request, cacheControl) {
  const obj = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return null;

  const headers = new Headers({ 'accept-ranges': 'bytes', 'cache-control': cacheControl, etag: obj.httpEtag });
  obj.writeHttpMetadata(headers);
  if (!('body' in obj)) return new Response(null, { status: 304, headers });

  if (obj.range && request.headers.has('range')) {
    const r = obj.range;
    const offset = r.suffix != null ? obj.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix != null ? r.suffix : (r.length ?? obj.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}
