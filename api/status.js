// /api/status
//   GET                              -> { qa: {...}, ticket: {...} }
//   POST { tcId, status, kind }      -> upsert (clears when status is empty/'Not run')
//     kind: 'qa' | 'ticket'
//       - QA writes both
//       - Developer writes nothing (read-only)
//
// Two hashes:
//   mel:status:qa     — Status            (Not Run / Pass / Fail / On Hold)
//   mel:status:ticket — Ticket Status     (Pending / Done / On Hold)
//
// Pre-existing 'mel:status' (legacy single-track) and 'mel:status:dev' (removed) are
// migrated/cleaned the first time this endpoint runs after deploy.
import { Redis } from '@upstash/redis';
import { roleFromRequest } from './whoami.js';

const KEY_QA     = 'mel:status:qa';
const KEY_TICKET = 'mel:status:ticket';
const KEY_LEGACY = 'mel:status';
const KEY_DEV_OLD = 'mel:status:dev';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function migrateAndCleanup() {
  try {
    const [legacy, qa] = await Promise.all([
      redis.hgetall(KEY_LEGACY),
      redis.hgetall(KEY_QA),
    ]);
    const legacyHasRows = legacy && Object.keys(legacy).length > 0;
    const qaHasRows     = qa && Object.keys(qa).length > 0;
    if (legacyHasRows && !qaHasRows) {
      await redis.hset(KEY_QA, legacy);
      await redis.del(KEY_LEGACY);
    }
    // Developer status is no longer a thing — drop the old hash entirely.
    await redis.del(KEY_DEV_OLD);
  } catch { /* migration is best-effort */ }
}

export default async function handler(req, res) {
  try {
    await migrateAndCleanup();

    if (req.method === 'GET') {
      const [qa, ticket] = await Promise.all([
        redis.hgetall(KEY_QA),
        redis.hgetall(KEY_TICKET),
      ]);
      return res.status(200).json({ qa: qa || {}, ticket: ticket || {} });
    }

    if (req.method === 'POST') {
      const role = roleFromRequest(req);
      if (!role) return res.status(401).json({ error: 'unauthorized' });
      if (role !== 'qa') {
        return res.status(403).json({ error: 'only QA can change status' });
      }

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const tcId   = (body && body.tcId)   || '';
      const status = ((body && body.status) || '').trim();
      const kind   = ((body && body.kind)   || '').trim().toLowerCase();

      if (!tcId) return res.status(400).json({ error: 'tcId required' });
      if (kind !== 'qa' && kind !== 'ticket') {
        return res.status(400).json({ error: "kind must be 'qa' or 'ticket'" });
      }

      const key = kind === 'qa' ? KEY_QA : KEY_TICKET;
      const isEmpty = !status || status === 'Not run' || (kind === 'ticket' && status === 'Pending');
      if (isEmpty) {
        await redis.hdel(key, tcId);
      } else {
        await redis.hset(key, { [tcId]: status });
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
