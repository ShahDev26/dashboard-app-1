// POST /api/logout — clears the auth cookie.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.setHeader('Set-Cookie',
    'mel_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return res.status(200).json({ ok: true });
}
