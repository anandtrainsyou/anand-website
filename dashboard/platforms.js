// What each platform's API accepts. Shared by the dashboard (eligibility checker, counters)
// and the API (validation), so a limit only ever changes here.
//
// thumbnail: 'image' = we can send a custom image, 'frame' = only a frame of the video, 'none' = platform picks.
// Limits are for API uploads, which are sometimes stricter than the apps.

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLATFORMS = {
  youtube: {
    name: 'YouTube Shorts', short: 'YT',
    video: { minDuration: 1, maxDuration: 180, maxFps: 60, maxBytes: 256 * GB, vertical: true },
    title: { max: 100, required: true },
    caption: { max: 5000, label: 'Description' },
    maxHashtags: 60, // more than 60 and YouTube ignores all of them
    thumbnail: 'image', thumbnailMaxBytes: 2 * MB, thumbnailNote: 'Needs a phone-verified channel.',
  },
  instagram: {
    name: 'Instagram Reels', short: 'IG',
    video: { minDuration: 3, maxDuration: 900, minFps: 23, maxFps: 60, maxBytes: 300 * MB },
    caption: { max: 2200, label: 'Caption' },
    maxHashtags: 30,
    thumbnail: 'image',
  },
  facebook: {
    name: 'Facebook Reels', short: 'FB',
    video: { minDuration: 3, maxDuration: 90, minFps: 24, maxFps: 60, maxBytes: 1 * GB, vertical: true, minWidth: 540, minHeight: 960 },
    caption: { max: 63206, label: 'Description' },
    thumbnail: 'image',
  },
  tiktok: {
    // The real max length depends on the account; TikTok tells us when the account is connected.
    name: 'TikTok', short: 'TT',
    video: { minDuration: 3, maxDuration: 600, minFps: 23, maxFps: 60, maxBytes: 4 * GB },
    caption: { max: 2200, label: 'Caption' },
    thumbnail: 'frame', thumbnailNote: 'TikTok only lets you pick a frame from the video.',
  },
  x: {
    name: 'X', short: 'X',
    video: { minDuration: 0.5, maxDuration: 140, maxFps: 60, maxBytes: 512 * MB, h264Only: true },
    caption: { max: 280, label: 'Post', weighted: true },
    thumbnail: 'none', thumbnailNote: 'X does not accept custom video thumbnails through its API.',
  },
  linkedin: {
    name: 'LinkedIn', short: 'IN',
    video: { minDuration: 3, maxDuration: 1800, maxFps: 60, maxBytes: 500 * MB },
    caption: { max: 3000, label: 'Post text' },
    thumbnail: 'image',
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS);

/** Caption + hashtags exactly as they will be sent. Blank per-platform fields fall back to the base ones. */
export function finalText(target, base) {
  const caption = (target.caption || '').trim() || (base.caption || '').trim();
  const tags = (target.hashtags || '').trim() || (base.hashtags || '').trim();
  return [caption, tags].filter(Boolean).join('\n\n');
}

export function countHashtags(text) {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

/** Length the way the platform counts it. X weighs links as 23 and most non-Latin characters/emoji as 2. */
export function textLength(platform, text) {
  if (!PLATFORMS[platform].caption.weighted) return [...text].length;
  let n = 0;
  const withoutUrls = text.replace(/https?:\/\/\S+/g, () => { n += 23; return ''; });
  for (const ch of withoutUrls) {
    const c = ch.codePointAt(0);
    const light = c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247);
    n += light ? 1 : 2;
  }
  return n;
}

const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtBytes = b => b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / MB)} MB`;

/**
 * Can this video go to this platform?
 * meta: { durationS, width, height, fps, sizeBytes, videoCodec, audioCodec } (any may be missing).
 * Returns { level: 'ok' | 'warn' | 'block', reasons: [] }. 'block' means the API would reject it.
 */
export function checkVideo(platform, meta) {
  const v = PLATFORMS[platform].video;
  const block = [], warn = [];
  const { durationS: d, width: w, height: h, fps, sizeBytes, videoCodec, audioCodec } = meta;

  if (d != null) {
    if (d > v.maxDuration) block.push(`${fmtTime(d)} is over the ${fmtTime(v.maxDuration)} max`);
    if (d < v.minDuration) block.push(`${d.toFixed(1)}s is under the ${v.minDuration}s min`);
  }
  if (fps != null) {
    if (v.maxFps && fps > v.maxFps + 0.5) block.push(`${Math.round(fps)}fps is over ${v.maxFps}fps`);
    if (v.minFps && fps < v.minFps - 0.5) block.push(`${Math.round(fps)}fps is under ${v.minFps}fps`);
  } else {
    warn.push('Frame rate unknown');
  }
  if (sizeBytes != null && sizeBytes > v.maxBytes) block.push(`${fmtBytes(sizeBytes)} is over ${fmtBytes(v.maxBytes)}`);
  if (w && h) {
    if (v.vertical && w > h) block.push('Needs a vertical or square video');
    else if (w > h) warn.push('Landscape video, will not show as a Reel/Short');
    if (v.minWidth && (w < v.minWidth || h < v.minHeight)) block.push(`Under ${v.minWidth}×${v.minHeight}`);
  }
  if (videoCodec) {
    const h264 = /^avc/i.test(videoCodec), hevc = /^(hvc|hev)/i.test(videoCodec);
    if (v.h264Only && !h264) block.push('Needs H.264 video');
    else if (!h264 && !hevc) warn.push(`Unusual codec (${videoCodec}), export H.264`);
  }
  if (audioCodec && !/^mp4a/i.test(audioCodec)) warn.push('Audio is not AAC');

  if (block.length) return { level: 'block', reasons: block };
  if (warn.length) return { level: 'warn', reasons: warn };
  return { level: 'ok', reasons: [] };
}
