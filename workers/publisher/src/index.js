// trainzoo-publisher: wakes up every minute and publishes whatever is due. See server/publisher.js.

import { runPublisher } from '../../../server/publisher.js';

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runPublisher(env).then(r => r.length && console.log(JSON.stringify(r))));
  },
};
