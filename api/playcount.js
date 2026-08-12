const Redis = require('ioredis');

const PLAYCOUNT_KEY = 'oyeraju:playcounts';

let redis;
function getClient() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 5000,
    });
    redis.on('error', () => {});
  }
  return redis;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const id = (req.query && req.query.v) || '';

  try {
    const client = getClient();
    if (!id) {
      const all = await client.hgetall(PLAYCOUNT_KEY);
      res.status(200).json(all);
      return;
    }
    await client.hincrby(PLAYCOUNT_KEY, id, 1);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(200).json({ ok: false });
  }
};
