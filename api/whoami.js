// GET /api/whoami
// Returns { role: 'editor' | 'viewer' } based on which password the
// current session's cookie matches. Used by the dashboard JS on load
// to hide edit controls and the JIRA-ticket button for viewers.

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
  const editor = process.env.DASHBOARD_PASSWORD || '';
  const viewer = process.env.DASHBOARD_VIEWER_PASSWORD || '';
  const raw = (req.headers && req.headers.cookie) || '';
  const m = raw.match(/(?:^|;\s*)mel_auth=([^;]+)/);
  if (!m) return null;
  let v = '';
  try { v = decodeURIComponent(m[1]); } catch { v = m[1]; }
  if (editor && v === editor) return 'editor';
  if (viewer && v === viewer) return 'viewer';
  return null;
}
