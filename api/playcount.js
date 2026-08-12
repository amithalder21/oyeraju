const Redis = require('ioredis');

const PLAYCOUNT_KEY = 'oyeraju:playcounts';
const REDIS_TIMEOUT_MS = 1500;

let redis;
function getClient() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: REDIS_TIMEOUT_MS,
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    redis.on('error', () => {});
  }
  return redis;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const id = (req.query && req.query.v) || '';

  try {
    const client = getClient();
    if (!id) {
      const all = await withTimeout(client.hgetall(PLAYCOUNT_KEY), REDIS_TIMEOUT_MS);
      res.status(200).json(all);
      return;
    }
    await withTimeout(client.hincrby(PLAYCOUNT_KEY, id, 1), REDIS_TIMEOUT_MS);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: false });
  }
};
