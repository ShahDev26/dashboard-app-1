// /api/status
//   GET           -> { [tcId]: status, ... }  (all overrides currently stored)
//   POST { tcId, status } -> upsert or clear when status is empty/'Not run'
//
// Backed by Upstash Redis (a single hash keyed 'mel:status').
// Env vars KV_REST_API_URL + KV_REST_API_TOKEN are provisioned by the
// "Upstash for Redis" marketplace integration on Vercel (it keeps the
// KV_* names for backward compat with the deprecated @vercel/kv package).
import { Redis } from '@upstash/redis';

const KEY = 'mel:status';
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const all = (await redis.hgetall(KEY)) || {};
      return res.status(200).json(all);
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const tcId = (body && body.tcId) || '';
      const status = ((body && body.status) || '').trim();
      if (!tcId) {
        return res.status(400).json({ error: 'tcId required' });
      }
      if (!status || status === 'Not run') {
        await redis.hdel(KEY, tcId);
      } else {
        await redis.hset(KEY, { [tcId]: status });
      }
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
