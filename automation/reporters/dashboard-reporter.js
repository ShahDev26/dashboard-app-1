import 'dotenv/config';

const TC_PATTERN = /\b(TC-[A-Z]+-\d+)\b/;

/**
 * Playwright custom reporter — pushes each TC run to the MEL Test Dashboard.
 * Triggered automatically when listed in playwright.config.js `reporter` array.
 *
 * Required env:
 *   DASHBOARD_URL       (default: https://dashboard-app-sigma-gilt.vercel.app)
 *   DASHBOARD_PASSWORD  (QA editor password — same one used to log into the dashboard)
 *
 * Quiet when DASHBOARD_PASSWORD is not set — useful for ad-hoc local debugging.
 */
export default class DashboardReporter {
  constructor() {
    this.url      = (process.env.DASHBOARD_URL || 'https://dashboard-app-sigma-gilt.vercel.app').replace(/\/+$/, '');
    this.password = process.env.DASHBOARD_PASSWORD || '';
    this.env      = (process.env.TEST_ENV || 'dev').toLowerCase();
    this.pending  = [];
    this.cookie   = null;
  }

  // Capture every test result (passed, failed, skipped, fixme).
  onTestEnd(test, result) {
    const m = (test.title || '').match(TC_PATTERN);
    if (!m) return;                                  // only push real TC cards

    const tcId       = m[1];
    const scenario   = (test.title || '').replace(TC_PATTERN, '').replace(/^\s*[—-]\s*/, '').trim();
    const moduleName = (test.parent?.title || '').trim();
    const errMsg     = result.error ? (result.error.message || String(result.error)) : '';

    this.pending.push({
      tcId,
      scenario,
      module:     moduleName,
      status:     result.status,                     // 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
      env:        this.env,
      startedAt:  new Date(result.startTime).toISOString(),
      durationMs: Math.round(result.duration || 0),
      error:      errMsg || undefined,
    });
  }

  async onEnd() {
    if (this.pending.length === 0) return;

    if (!this.password) {
      console.log(`\n[dashboard-reporter] DASHBOARD_PASSWORD not set — skipping upload of ${this.pending.length} run(s).`);
      return;
    }

    try {
      this.cookie = await this._login();
    } catch (e) {
      console.warn(`\n[dashboard-reporter] login failed: ${e.message}. ${this.pending.length} run(s) not uploaded.`);
      return;
    }

    let ok = 0, fail = 0;
    for (const run of this.pending) {
      try {
        const r = await fetch(`${this.url}/api/runs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: this.cookie },
          body: JSON.stringify(run),
        });
        if (r.ok) ok++; else fail++;
      } catch {
        fail++;
      }
    }
    console.log(`\n[dashboard-reporter] uploaded ${ok}/${this.pending.length} run(s) to ${this.url}${fail ? ` — ${fail} failed` : ''}.`);
  }

  async _login() {
    const r = await fetch(`${this.url}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: this.password }),
      redirect: 'manual',
    });
    if (r.status !== 200 && r.status !== 204) {
      throw new Error(`/api/login returned ${r.status}`);
    }
    const sc = r.headers.get('set-cookie') || '';
    const m = sc.match(/mel_auth=[^;]+/);
    if (!m) throw new Error('no mel_auth cookie returned');
    return m[0];
  }
}
