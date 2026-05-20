import { test, expect } from '../fixtures/base.js';
import { LoginPage } from '../pages/LoginPage.js';
import { userFor } from '../config/env.js';
import { verifyAllTouchpoints } from '../utils/touchpoint-verifier.js';

/**
 * MEL Authentication module — all TC-AUTH-* cards from the dashboard.
 *
 * Conventions:
 *   - One `test()` per TC card. Test title = `TC-ID — scenario`.
 *   - Filename = module name (Authentication → authentication.spec.js).
 *   - Run a single TC:   npx playwright test -g "TC-AUTH-003"
 *   - Run whole module:  npx playwright test authentication
 *
 * Auth pattern: ONE-TIME login in `test.beforeAll` for the whole describe block.
 * All tests share the same BrowserContext + page, so the browser launches once,
 * logs in once, and every subsequent TC reuses the same authenticated session.
 *
 * Tests that MUST start unauthenticated (TC-AUTH-009, TC-AUTH-010) get their
 * own fresh context — see those blocks for the pattern.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Authentication', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await expect(login.passwordInput.first()).toBeVisible();
    await login.signIn(userFor('Admin'));
    await page.waitForURL(
      (url) => !new URL(url).pathname.startsWith('/login'),
      { timeout: 15_000 },
    );
  });

  test.afterAll(async () => {
    await context?.close();
  });

  // -- TC-AUTH-001 --------------------------------------------------------
  test('TC-AUTH-001 — Login happy path (each role)', async ({ env, tc }) => {
    const TC = await tc('TC-AUTH-001');
    annotate(test, TC, env);

    await expect(page).not.toHaveURL(/\/login(\.html)?$/);

    const results = await verifyAllTouchpoints(page, TC, {
      'Admin|Login page':       async (p) => expect(p.url()).not.toMatch(/\/login/),
      'State Head|Login page':  async (p) => expect(p.url()).not.toMatch(/\/login/),
      'GSCO|Login page':        async (p) => expect(p.url()).not.toMatch(/\/login/),
      'Any|Sidebar (per role)': async (p) => expect(p).toHaveURL(/.+/),
    });
    attachTouchpoints(test, results);
    expect(results.filter(r => r.status === 'fail')).toEqual([]);
  });

  // -- TC-AUTH-002 --------------------------------------------------------
  test.fixme('TC-AUTH-002 — Welcome email + Set Password flow (all roles)', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-002');
    annotate(test, TC, env);
    // TODO: needs email inbox access (mock or test mailbox) + Admin user-creation flow
  });

  // -- TC-AUTH-003 --------------------------------------------------------
  test.fixme('TC-AUTH-003 — Admin-triggered password reset (email)', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-003');
    annotate(test, TC, env);
    // TODO: needs Admin User-Management screen + test mailbox
  });

  // -- TC-AUTH-004 --------------------------------------------------------
  test.fixme('TC-AUTH-004 — Forgot Password (OTP via email or mobile)', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-004');
    annotate(test, TC, env);
    // TODO: needs OTP-capture hook (email + SMS), Forgot Password UI
  });

  // -- TC-AUTH-005 --------------------------------------------------------
  test.fixme('TC-AUTH-005 — Session persists across tab refresh and multiple tabs', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-005');
    annotate(test, TC, env);
    // TODO: multi-tab via context.newPage(); needs protected MEL routes
  });

  // -- TC-AUTH-006 --------------------------------------------------------
  test.fixme('TC-AUTH-006 — Logout ends session, protected routes require fresh login', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-006');
    annotate(test, TC, env);
    // TODO: needs profile menu Logout in MEL UI
  });

  // -- TC-AUTH-007 --------------------------------------------------------
  test.fixme('TC-AUTH-007 — Browser close ends session, reopening requires re-login', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-007');
    annotate(test, TC, env);
    // TODO: simulate browser quit via context.close() and a fresh context
  });

  // -- TC-AUTH-008 --------------------------------------------------------
  test.fixme('TC-AUTH-008 — Session persists during idle (no auto-expiry)', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-008');
    annotate(test, TC, env);
    // TODO: long-running; consider time-skip via clock fake instead of real wait
  });

  // -- TC-AUTH-009 --------------------------------------------------------
  test.fixme('TC-AUTH-009 — Invalid credentials at login', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-009');
    annotate(test, TC, env);
    // TODO: open fresh unauth context, try wrong password / unknown email
  });

  // -- TC-AUTH-010 --------------------------------------------------------
  test.fixme('TC-AUTH-010 — Unauthenticated protected route redirects to login', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-010');
    annotate(test, TC, env);
    // TODO: open fresh unauth context, visit protected URLs, assert redirect
  });

  // -- TC-AUTH-011 --------------------------------------------------------
  test.fixme('TC-AUTH-011 — Forgot Password with unknown email/mobile', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-011');
    annotate(test, TC, env);
  });

  // -- TC-AUTH-012 --------------------------------------------------------
  test.fixme('TC-AUTH-012 — Forgot Password with invalid OTP', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-012');
    annotate(test, TC, env);
  });

  // -- TC-AUTH-013 --------------------------------------------------------
  test.fixme('TC-AUTH-013 — Forgot Password with expired OTP', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-013');
    annotate(test, TC, env);
  });

  // -- TC-AUTH-014 --------------------------------------------------------
  test.fixme('TC-AUTH-014 — Forgot Password Resend OTP and request limit', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-014');
    annotate(test, TC, env);
  });

  // -- TC-AUTH-015 --------------------------------------------------------
  test.fixme('TC-AUTH-015 — Forgot Password multi-channel race', async ({ tc, env }) => {
    const TC = await tc('TC-AUTH-015');
    annotate(test, TC, env);
    // Policy gap — confirm product owner decision before automating
  });

});

// ---- helpers (local to this spec, kept tiny so each test stays readable) ----
function annotate(test, TC, env) {
  test.info().annotations.push(
    { type: 'tc-id',       description: TC.id },
    { type: 'scenario',    description: TC.scenario },
    { type: 'severity',    description: TC.severity },
    { type: 'env',         description: env.name },
    { type: 'touchpoints', description: String((TC.touchpoints || []).length) },
  );
}

function attachTouchpoints(test, results) {
  test.info().attachments.push({
    name: 'touchpoints.json',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(results, null, 2)),
  });
}
