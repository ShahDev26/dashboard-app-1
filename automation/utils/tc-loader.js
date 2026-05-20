import { env } from '../config/env.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = '.tc-cache';
const CACHE_FILE = path.join(CACHE_DIR, 'testcases.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

let memoCache = null;

async function login() {
  const r = await fetch(`${env.dashboard.url}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: env.dashboard.password }),
    redirect: 'manual',
  });
  if (r.status !== 200 && r.status !== 204) {
    throw new Error(`Dashboard login failed (${r.status}). Set DASHBOARD_PASSWORD in .env.`);
  }
  const cookie = r.headers.get('set-cookie') || '';
  const match = cookie.match(/mel_auth=[^;]+/);
  if (!match) throw new Error('Dashboard login did not return mel_auth cookie.');
  return match[0];
}

async function fetchIndexHtml(cookie) {
  const r = await fetch(`${env.dashboard.url}/`, { headers: { cookie } });
  if (!r.ok) throw new Error(`Failed to load dashboard index.html (${r.status})`);
  return r.text();
}

async function fetchEdits(cookie) {
  const r = await fetch(`${env.dashboard.url}/api/testcases`, { headers: { cookie } });
  if (!r.ok) return {};
  return r.json();
}

function extractEmbeddedJson(html) {
  const m = html.match(/<script id="quest-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Could not find <script id="quest-data"> in dashboard HTML.');
  return JSON.parse(m[1]);
}

function flatten(modulesPayload, edits) {
  const out = {};
  for (const mod of modulesPayload.modules || []) {
    for (const tc of mod.tcs || []) {
      const edit = edits[tc.id] || {};
      out[tc.id] = {
        id: tc.id,
        module: { id: mod.id, name: mod.name, category: mod.category },
        scenario: edit.scenario ?? tc.scenario ?? '',
        type: edit.type ?? tc.type ?? '',
        severity: edit.severity ?? tc.severity ?? '',
        pre: edit.pre ?? tc.pre ?? '',
        steps: edit.steps ?? tc.steps ?? '',
        expected: edit.expected ?? tc.expected ?? '',
        br: edit.br ?? tc.br ?? '',
        notes: edit.notes ?? tc.notes ?? '',
        roles: tc.roles || [],
        touchpoints: tc.touchpoints || [],
      };
    }
  }
  return out;
}

async function readCache() {
  try {
    const stat = await fs.stat(CACHE_FILE);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
  } catch { return null; }
}

async function writeCache(data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2));
}

export async function loadAllTestcases({ fresh = false } = {}) {
  if (!fresh && memoCache) return memoCache;
  if (!fresh) {
    const cached = await readCache();
    if (cached) { memoCache = cached; return cached; }
  }
  const cookie = await login();
  const [html, edits] = await Promise.all([fetchIndexHtml(cookie), fetchEdits(cookie)]);
  const flat = flatten(extractEmbeddedJson(html), edits);
  await writeCache(flat);
  memoCache = flat;
  return flat;
}

export async function loadTestcase(tcId, opts) {
  const all = await loadAllTestcases(opts);
  const tc = all[tcId];
  if (!tc) throw new Error(`Testcase ${tcId} not found in dashboard.`);
  return tc;
}
