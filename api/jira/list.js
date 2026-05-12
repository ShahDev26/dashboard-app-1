// GET /api/jira/list
//   Returns: { [tcId]: issueKey, ... }
//
// Reads the Upstash Redis hash `mel:jira` so the dashboard can render
// "ticketed" badges and link out to existing JIRA issues per TC.

import { Redis } from '@upstash/redis';

const KEY = 'mel:jira';
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  try {
    const all = (await redis.hgetall(KEY)) || {};
    return res.status(200).json(all);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
