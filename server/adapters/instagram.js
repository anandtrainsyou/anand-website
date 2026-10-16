// Instagram Reels: create a container from our video link, wait for Instagram to process it, then publish.

import { graph, bases, GRAPH_VERSION as V, PublishError } from '../graph.js';

export async function step({ env, account, text, options, progress, videoUrl, coverUrl, coverOffsetMs }) {
  const ig = bases(env).ig, token = account.accessToken, user = account.remoteId;

  if (!progress.container) {
    const cover = await coverUrl();
    const res = await graph(`${ig}/${V}/${user}/media`, {
      method: 'POST',
      params: {
        media_type: 'REELS', video_url: await videoUrl(), caption: text,
        share_to_feed: options.shareToFeed !== false,
        cover_url: cover, thumb_offset: cover ? null : coverOffsetMs,
        access_token: token,
      },
    });
    return { progress: { ...progress, container: res.id }, wait: 20 };
  }

  const c = await graph(`${ig}/${V}/${progress.container}`, { params: { fields: 'status_code,status', access_token: token } });
  switch (c.status_code) {
    case 'ERROR':
    case 'EXPIRED':
      throw new PublishError(`Instagram couldn’t process the video: ${c.status || c.status_code}`);
    case 'PUBLISHED': // published on an earlier run that didn't get to save
      return { progress, done: { remoteId: progress.mediaId || null, remoteUrl: progress.permalink || null } };
    case 'FINISHED': {
      const pub = await graph(`${ig}/${V}/${user}/media_publish`, { method: 'POST', params: { creation_id: progress.container, access_token: token } });
      let permalink = null;
      try {
        permalink = (await graph(`${ig}/${V}/${pub.id}`, { params: { fields: 'permalink', access_token: token } })).permalink;
      } catch { /* the post is live; the link is a nice-to-have */ }
      return { progress: { ...progress, mediaId: pub.id, permalink }, done: { remoteId: pub.id, remoteUrl: permalink } };
    }
    default: // IN_PROGRESS
      return { progress, wait: 15 };
  }
}
