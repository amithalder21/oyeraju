const Redis = require('ioredis');

const PRESENCE_KEY = 'oyeraju:presence';
const TTL_MS = 30000;

let redis;
function getClient() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
      lazyConnect: false,
    });
    redis.on('error', () => {});
  }
  return redis;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const id = (req.query && req.query.id) || '';
  if (!id) {
    res.status(400).json({ count: null, error: 'missing_id' });
    return;
  }

  try {
    const client = getClient();
    const now = Date.now();

    const pipeline = client.pipeline();
    pipeline.zadd(PRESENCE_KEY, now, id);
    pipeline.zremrangebyscore(PRESENCE_KEY, 0, now - TTL_MS);
    pipeline.zcard(PRESENCE_KEY);
    const results = await pipeline.exec();

    const count = results[2][1];
    res.status(200).json({ count });
  } catch (err) {
    res.status(200).json({ count: null, error: 'presence_unavailable' });
  }
};
