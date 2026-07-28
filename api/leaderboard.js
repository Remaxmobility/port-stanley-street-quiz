// Serverless function (Vercel Node runtime, no dependencies — uses global
// fetch) backing the top-10 leaderboard. Talks to Vercel KV (Upstash Redis)
// via its REST API using a sorted set: member = JSON.stringify({name, score,
// date}), score = the same numeric score, so ZREVRANGE ... WITHSCORES gives
// us the list pre-sorted with no extra parsing beyond splitting pairs.
//
// Requires KV_REST_API_URL / KV_REST_API_TOKEN env vars — set automatically
// once a Vercel KV database is linked to this project (Storage tab -> Create
// Database -> KV -> Connect Project), no manual env var entry needed.

const LEADERBOARD_KEY = 'ps-leaderboard';
const MAX_ENTRIES = 10;
// Real max is 2780 (session 7: 88 streets, sum of all points, one deck with
// no repeats) — capped higher to avoid re-syncing this every dataset change,
// while still rejecting obviously fabricated scores from direct API calls.
const MAX_PLAUSIBLE_SCORE = 3000;

async function redis(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV_REST_API_URL/KV_REST_API_TOKEN not configured');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

function parsePairs(raw) {
  const list = [];
  for (let i = 0; i < raw.length; i += 2) {
    try {
      list.push(JSON.parse(raw[i]));
    } catch (e) {
      // skip a malformed member rather than failing the whole request
    }
  }
  return list;
}

async function getTop10() {
  const raw = await redis(['ZREVRANGE', LEADERBOARD_KEY, 0, MAX_ENTRIES - 1, 'WITHSCORES']);
  return parsePairs(raw);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.status(200).json({ list: await getTop10() });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') body = JSON.parse(body || '{}');
      body = body || {};

      const name = String(body.name || '').trim().slice(0, 20) || 'Anonymous';
      const score = Number(body.score);
      if (!Number.isInteger(score) || score < 0 || score > MAX_PLAUSIBLE_SCORE) {
        res.status(400).json({ error: 'Invalid score' });
        return;
      }

      const entry = { name, score, date: new Date().toISOString() };
      await redis(['ZADD', LEADERBOARD_KEY, score, JSON.stringify(entry)]);
      // Keep only the top 10 by score. ZREMRANGEBYRANK operates on ascending
      // rank, so 0..-(MAX_ENTRIES+1) removes everything except the last
      // MAX_ENTRIES elements (the highest scores).
      await redis(['ZREMRANGEBYRANK', LEADERBOARD_KEY, 0, -(MAX_ENTRIES + 1)]);

      res.status(200).json({ list: await getTop10(), entry });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Leaderboard unavailable' });
  }
}
