// /api/runs
//   GET                       -> { dates: ["2026-05-19", ...] }   (newest first)
//   GET ?date=YYYY-MM-DD      -> { date, runs: [...] }            (chronological)
//   POST { tcId, status, ... }-> { ok, run }                      (QA only)
//
// Storage:
//   mel:runs:YYYY-MM-DD  — Redis list, RPUSH JSON-encoded run on each POST
//   mel:runs:dates       — Redis set of dates that have at least one run
//
// A "run" record looks like:
//   {
//     runId:      "TC-AUTH-001-1779360000000",
//     tcId:       "TC-AUTH-001",
//     scenario:   "Login happy path (each role)",
//     module:     "Authentication" | "",
//     status:     "passed" | "failed" | "timedOut" | "skipped" | "interrupted",
//     env:        "dev" | "stage" | "prod",
//     startedAt:  "2026-05-19T07:42:13.123Z",
//     durationMs: 2031,
//     error:      "...optional, truncated to 500 chars..."
//   }
import { Redis } from '@upstash/redis';
import { roleFromRequest } from './whoami.js';

const KEY        = (date) => `mel:runs:${date}`;
const DATES_KEY  = 'mel:runs:dates';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asString(v, max = 500) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const date = (req.query?.date || '').toString().slice(0, 10);
      const from = (req.query?.from || '').toString().slice(0, 10);
      const to   = (req.query?.to   || '').toString().slice(0, 10);

      // Range query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
      if (from || to) {
        if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
          return res.status(400).json({ error: 'from/to must both be YYYY-MM-DD' });
        }
        if (from > to) {
          return res.status(400).json({ error: 'from must be <= to' });
        }
        const dates = [];
        for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
          dates.push(d.toISOString().slice(0, 10));
          if (dates.length > 366) break;  // safety: max 1 year
        }
        const lists = await Promise.all(dates.map(d => redis.lrange(KEY(d), 0, -1)));
        const runs = lists.flat().map(s => {
          try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; }
        }).filter(Boolean);
        return res.status(200).json({ from, to, runs });
      }

      // Single-date query
      if (!date) {
        const dates = (await redis.smembers(DATES_KEY)) || [];
        return res.status(200).json({ dates: dates.sort().reverse() });
      }
      if (!DATE_RE.test(date)) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
      const items = (await redis.lrange(KEY(date), 0, -1)) || [];
      const runs = items.map(s => {
        try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return null; }
      }).filter(Boolean);
      return res.status(200).json({ date, runs });
    }

    if (req.method === 'POST') {
      const role = roleFromRequest(req);
      if (!role)          return res.status(401).json({ error: 'unauthorized' });
      if (role !== 'qa')  return res.status(403).json({ error: 'only QA can record runs' });

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
      }

      const tcId = (body?.tcId || '').toString().trim();
      if (!tcId) return res.status(400).json({ error: 'tcId required' });

      const startedAt = (body.startedAt && !isNaN(Date.parse(body.startedAt)))
        ? new Date(body.startedAt).toISOString()
        : new Date().toISOString();
      const date = startedAt.slice(0, 10);

      const run = {
        runId:      `${tcId}-${Date.parse(startedAt)}`,
        tcId,
        scenario:   asString(body.scenario, 300),
        module:     asString(body.module, 100),
        status:     asString(body.status, 30),
        env:        asString(body.env, 20),
        startedAt,
        durationMs: Number(body.durationMs || 0) | 0,
        error:      body.error ? asString(body.error, 500) : undefined,
      };

      await Promise.all([
        redis.rpush(KEY(date), JSON.stringify(run)),
        redis.sadd(DATES_KEY, date),
      ]);

      return res.status(200).json({ ok: true, run });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
