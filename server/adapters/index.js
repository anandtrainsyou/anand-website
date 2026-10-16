// Platforms the publisher can post to. Each adapter's step() moves one post one step forward:
//   step(ctx) → { progress, wait: seconds }   not done yet, call again later
//            → { progress, done: { remoteId, remoteUrl, note } }
// and throws PublishError when something goes wrong.

import * as instagram from './instagram.js';
import * as facebook from './facebook.js';

export const ADAPTERS = { instagram, facebook };
