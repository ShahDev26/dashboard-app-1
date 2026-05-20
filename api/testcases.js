// /api/testcases
//   GET                              -> { [tcId]: { scenario?, type?, severity?, pre?, steps?, expected?, br?, notes? } }
//   POST { tcId, fields }            -> merge edits for a single testcase
//   DELETE { tcId }                  -> remove edit overrides for a TC (revert to embedded baseline)
//
// QA-only on mutations. Edits are stored as field-level overrides in the Redis hash
// 'mel:tc:edits' so the embedded TC data in index.html acts as the immutable baseline
// and edits layer on top at page-load time.
import { Redis } from '@upstash/redis';
import { roleFromRequest } from './whoami.js';

const KEY = 'mel:tc:edits';
const EDITABLE_FIELDS = new Set(['scenario','type','severity','pre','steps','expected','br','notes']);

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const all = (await redis.hgetall(KEY)) || {};
      // Each entry is JSON-encoded; decode for the client
      const out = {};
      for (const tcId in all) {
        try { out[tcId] = typeof all[tcId] === 'string' ? JSON.parse(all[tcId]) : all[tcId]; }
        catch { /* skip malformed entries */ }
      }
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      if (roleFromRequest(req) !== 'qa') {
        return res.status(403).json({ error: 'only QA can edit testcases' });
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const tcId = (body && body.tcId) || '';
      const fieldsIn = (body && body.fields) || {};
      if (!tcId) return res.status(400).json({ error: 'tcId required' });
      // Filter to allowed fields only
      const fields = {};
      for (const k of Object.keys(fieldsIn)) {
        if (EDITABLE_FIELDS.has(k)) fields[k] = String(fieldsIn[k] ?? '');
      }
      // Merge with whatever is already stored
      const existing = await redis.hget(KEY, tcId);
      let merged = {};
      if (existing) {
        try { merged = typeof existing === 'string' ? JSON.parse(existing) : existing; } catch {}
      }
      merged = { ...merged, ...fields };
      // If everything ends up empty, drop the entry
      const hasAny = Object.values(merged).some(v => v && v.trim && v.trim().length);
      if (!hasAny) {
        await redis.hdel(KEY, tcId);
      } else {
        await redis.hset(KEY, { [tcId]: JSON.stringify(merged) });
      }
      return res.status(200).json({ ok: true, fields: merged });
    }

    if (req.method === 'DELETE') {
      if (roleFromRequest(req) !== 'qa') {
        return res.status(403).json({ error: 'only QA can revert edits' });
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }
      const tcId = (body && body.tcId) || '';
      if (!tcId) return res.status(400).json({ error: 'tcId required' });
      await redis.hdel(KEY, tcId);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
