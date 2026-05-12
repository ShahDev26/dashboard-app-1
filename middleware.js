// Edge Middleware — gates the entire site behind a shared password.
// Two passwords are supported, both stored as Vercel env vars:
//   DASHBOARD_PASSWORD         → editor role  (status edits, JIRA tickets)
//   DASHBOARD_VIEWER_PASSWORD  → viewer role  (read-only)
// /api/login validates the submitted password against both and sets a
// cookie whose value is the matched password. Middleware here just
// checks the cookie matches one of the two env vars; per-endpoint code
// distinguishes editor vs viewer when authorising mutations.

export const config = {
  // Anything except the login page (both the clean URL `/login` and the raw
  // `/login.html`, since `cleanUrls: true` in vercel.json rewrites between
  // them), the login API, and Vercel internals.
  matcher: '/((?!login(?:\\.html)?$|api/login$|_next/|_vercel/|favicon\\.ico).*)',
};

export default function middleware(request) {
  const url = new URL(request.url);
  const editor = process.env.DASHBOARD_PASSWORD || '';
  const viewer = process.env.DASHBOARD_VIEWER_PASSWORD || '';

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)mel_auth=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : '';

  const authed = !!value && ((editor && value === editor) || (viewer && value === viewer));
  if (authed) return; // pass through — role enforcement happens in API routes

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
