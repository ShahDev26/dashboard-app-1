// GET /api/whoami
// Returns { role: 'qa' | 'developer' } based on which password the current
// session's cookie matches. The dashboard front-end uses the role to label
// the status column, gate JIRA ticket creation, and pick the report flavour.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const role = roleFromRequest(req);
  if (!role) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ role });
}

export function roleFromRequest(req) {
  const qaPwd  = process.env.DASHBOARD_PASSWORD || '';
  const devPwd = process.env.DASHBOARD_VIEWER_PASSWORD || '';
  const raw = (req.headers && req.headers.cookie) || '';
  const m = raw.match(/(?:^|;\s*)mel_auth=([^;]+)/);
  if (!m) return null;
  let v = '';
  try { v = decodeURIComponent(m[1]); } catch { v = m[1]; }
  if (qaPwd  && v === qaPwd)  return 'qa';
  if (devPwd && v === devPwd) return 'developer';
  return null;
}
