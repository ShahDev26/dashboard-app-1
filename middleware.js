// Edge Middleware — gates the entire site behind a single shared password.
// The password is read from the DASHBOARD_PASSWORD env var (set in Vercel).
// On successful login (/api/login), a long-lived cookie is set; middleware
// compares it to the env var on every request.

export const config = {
  // Anything except the login page (both the clean URL `/login` and the raw
  // `/login.html`, since `cleanUrls: true` in vercel.json rewrites between
  // them), the login API, and Vercel internals.
  matcher: '/((?!login(\\.html)?$|api/login$|_next/|_vercel/|favicon\\.ico).*)',
};

export default function middleware(request) {
  const url = new URL(request.url);
  const expected = process.env.DASHBOARD_PASSWORD || '';

  // Read mel_auth cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)mel_auth=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : '';

  if (expected && value === expected) {
    return; // authenticated — pass through
  }

  // Unauthenticated — API gets JSON 401, everything else redirects to /login
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Redirect to the canonical clean URL (`cleanUrls: true` in vercel.json
  // serves login.html at /login). Using /login here avoids a redirect loop:
  // /login.html → cleanUrls → /login → middleware → /login.html → …
  url.pathname = '/login';
  return Response.redirect(url.toString(), 302);
}
