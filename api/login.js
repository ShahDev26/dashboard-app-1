// POST /api/login  body: { password }
// Sets the mel_auth cookie if the password matches either the editor
// or the viewer password. The cookie value is the matching password,
// which lets middleware / API routes infer the role on each request.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const editor = process.env.DASHBOARD_PASSWORD || '';
  const viewer = process.env.DASHBOARD_VIEWER_PASSWORD || '';
  if (!editor && !viewer) {
    return res.status(500).json({
      error: 'No dashboard passwords are configured on the server',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const submitted = (body && body.password) || '';

  let matched = null;
  let role = null;
  if (editor && submitted === editor) { matched = editor; role = 'editor'; }
  else if (viewer && submitted === viewer) { matched = viewer; role = 'viewer'; }

  if (!matched) {
    return res.status(401).json({ error: 'invalid password' });
  }

  // 30-day cookie. HttpOnly so JS can't read it; Secure on Vercel.
  const cookie = [
    `mel_auth=${encodeURIComponent(matched)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=2592000',
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true, role });
}
