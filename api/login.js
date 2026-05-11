// POST /api/login  body: { password }
// Sets the mel_auth cookie if the password matches DASHBOARD_PASSWORD.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return res.status(500).json({
      error: 'DASHBOARD_PASSWORD is not configured on the server',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const submitted = (body && body.password) || '';

  if (submitted !== expected) {
    return res.status(401).json({ error: 'invalid password' });
  }

  // 30-day cookie. HttpOnly so JS can't read it; Secure on Vercel by default.
  const cookie = [
    `mel_auth=${encodeURIComponent(expected)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=2592000',
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
  return res.status(200).json({ ok: true });
}
