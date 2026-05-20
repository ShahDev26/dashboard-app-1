// POST /api/jira/create
//   Body: { tcId, issueType, title, steps, expected, actual, severity?, screenshotBase64?, screenshotName? }
//   Returns: { key, url }
//
// Files a JIRA issue in MPSW under the dev.csv@enableindia.org account.
// Reporter = the token owner; assignee left unset (team triage).
// Stores the resulting issue key in Upstash Redis hash `mel:jira` keyed by tcId.

import { Redis } from '@upstash/redis';
import { roleFromRequest } from '../whoami.js';

const KEY = 'mel:jira';
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function adfDoc(blocks) {
  return { type: 'doc', version: 1, content: blocks };
}
function adfHeading(text, level = 3) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
function adfParagraph(text) {
  // Preserve newlines as hardBreak nodes
  const lines = (text || '').split('\n');
  const content = [];
  lines.forEach((line, i) => {
    if (line.length) content.push({ type: 'text', text: line });
    if (i < lines.length - 1) content.push({ type: 'hardBreak' });
  });
  if (!content.length) content.push({ type: 'text', text: ' ' });
  return { type: 'paragraph', content };
}

function buildDescription({ tcId, steps, expected, actual, severity }) {
  const blocks = [
    adfParagraph(`Filed from MEL Test Dashboard for test case ${tcId}.`),
  ];
  if (severity) blocks.push(adfParagraph(`Severity: ${severity}`));
  blocks.push(adfHeading('Steps to reproduce'));
  blocks.push(adfParagraph(steps || '(not provided)'));
  blocks.push(adfHeading('Expected result'));
  blocks.push(adfParagraph(expected || '(not provided)'));
  blocks.push(adfHeading('Actual result'));
  blocks.push(adfParagraph(actual || '(not provided)'));
  return adfDoc(blocks);
}

async function jiraFetch(path, init = {}) {
  const cloudId = process.env.JIRA_CLOUD_ID;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const headers = {
    Authorization: `Basic ${auth}`,
    Accept: 'application/json',
    ...(init.headers || {}),
  };
  if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    init = { ...init, body: JSON.stringify(init.body) };
  }
  return fetch(`https://api.atlassian.com/ex/jira/${cloudId}${path}`, { ...init, headers });
}

async function uploadAttachment(issueKey, base64, name) {
  const buf = Buffer.from(base64, 'base64');
  const form = new FormData();
  // Node 18+ FormData accepts Blob
  const blob = new Blob([buf]);
  form.append('file', blob, name || 'screenshot.png');
  const cloudId = process.env.JIRA_CLOUD_ID;
  const email = process.env.JIRA_USER_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  return fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'X-Atlassian-Token': 'no-check',
    },
    body: form,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (roleFromRequest(req) !== 'qa') {
    return res.status(403).json({ error: 'only QA role can create JIRA tickets' });
  }
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const tcId = (body?.tcId || '').toString().trim();
    const issueType = (body?.issueType || 'Bug').toString().trim();
    const title = (body?.title || '').toString().trim();
    const steps = (body?.steps || '').toString();
    const expected = (body?.expected || '').toString();
    const actual = (body?.actual || '').toString();
    const severity = body?.severity ? body.severity.toString() : '';
    const screenshotBase64 = body?.screenshotBase64 || null;
    const screenshotName = (body?.screenshotName || 'screenshot.png').toString();

    if (!tcId) return res.status(400).json({ error: 'tcId is required' });
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!['Bug', 'Task'].includes(issueType)) {
      return res.status(400).json({ error: 'issueType must be Bug or Task' });
    }

    const projectKey = process.env.JIRA_PROJECT_KEY || 'MPSW';
    const payload = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary: `[${tcId}] ${title}`.slice(0, 240),
        description: buildDescription({ tcId, steps, expected, actual, severity }),
        labels: ['mel-test-dashboard', `tc:${tcId}`],
      },
    };

    const createResp = await jiraFetch('/rest/api/3/issue', { method: 'POST', body: payload });
    const createText = await createResp.text();
    if (!createResp.ok) {
      return res.status(createResp.status).json({
        error: 'jira create failed',
        status: createResp.status,
        detail: safeParse(createText),
      });
    }
    const created = safeParse(createText);
    const issueKey = created.key;

    let attachmentResult = null;
    if (screenshotBase64 && issueKey) {
      const attResp = await uploadAttachment(issueKey, screenshotBase64, screenshotName);
      attachmentResult = { ok: attResp.ok, status: attResp.status };
      if (!attResp.ok) {
        const attErr = await attResp.text();
        attachmentResult.detail = safeParse(attErr);
      }
    }

    await redis.hset(KEY, { [tcId]: issueKey });

    const browseUrl = `https://enableindiaorg.atlassian.net/browse/${issueKey}`;
    return res.status(200).json({
      key: issueKey,
      url: browseUrl,
      attachment: attachmentResult,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return { raw: (s || '').slice(0, 500) }; }
}
