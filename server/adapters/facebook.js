// Facebook Reels on a Page: start an upload, let Facebook fetch our video link, finish (publish), wait until live.

import { graph, bases, GRAPH_VERSION as V, PublishError } from '../graph.js';

const phaseError = phase => phase?.errors?.map(e => e.message).join('; ') || 'unknown error';

export async function step({ env, account, text, progress, videoUrl, coverFile }) {
  const { fb, rupload } = bases(env), token = account.accessToken, page = account.remoteId;
  const p = { ...progress };

  if (!p.videoId) {
    const start = await graph(`${fb}/${V}/${page}/video_reels`, { method: 'POST', params: { upload_phase: 'start', access_token: token } });
    p.videoId = start.video_id;
  }
  if (!p.uploaded) {
    await graph(`${rupload}/video-upload/${V}/${p.videoId}`, {
      method: 'POST',
      headers: { authorization: `OAuth ${token}`, file_url: await videoUrl() },
    });
    p.uploaded = true;
    return { progress: p, wait: 15 };
  }

  const status = (await graph(`${fb}/${V}/${p.videoId}`, { params: { fields: 'status', access_token: token } })).status || {};

  if (!p.finished) {
    const up = status.uploading_phase?.status;
    if (up === 'error') throw new PublishError(`Facebook couldn’t download the video: ${phaseError(status.uploading_phase)}`);
    if (up !== 'complete') return { progress: p, wait: 15 };
    await graph(`${fb}/${V}/${page}/video_reels`, {
      method: 'POST',
      params: { upload_phase: 'finish', video_id: p.videoId, video_state: 'PUBLISHED', description: text, access_token: token },
    });
    p.finished = true;
    return { progress: p, wait: 20 };
  }

  for (const phase of ['processing_phase', 'publishing_phase']) {
    if (status[phase]?.status === 'error') throw new PublishError(`Facebook couldn’t publish the reel: ${phaseError(status[phase])}`);
  }
  if (status.publishing_phase?.status !== 'complete') return { progress: p, wait: 20 };

  // Custom cover: Facebook's Reels API has no cover field, so try the video thumbnail endpoint.
  // The reel is already live, so a refusal here is only a note, not a failure.
  let note = null;
  const cover = !p.coverTried && await coverFile();
  if (cover) {
    p.coverTried = true;
    try {
      const form = new FormData();
      form.append('source', cover.blob, cover.name);
      form.append('is_preferred', 'true');
      await graph(`${fb}/${V}/${p.videoId}/thumbnails`, { method: 'POST', params: { access_token: token }, formData: form });
    } catch (err) {
      note = `Posted, but Facebook didn’t accept the custom cover: ${err.message}`;
    }
  }

  let url = null;
  try {
    const link = (await graph(`${fb}/${V}/${p.videoId}`, { params: { fields: 'permalink_url', access_token: token } })).permalink_url;
    url = link && (link.startsWith('http') ? link : `https://www.facebook.com${link}`);
  } catch { /* live without a link */ }
  return { progress: p, done: { remoteId: p.videoId, remoteUrl: url, note } };
}
