# mel-qa / automation

Playwright + JavaScript automation framework for the **GarvSe MEL Platform**.
Testcases are fetched **live** from the MEL Test Dashboard, executed against
one of three environments (dev / stage / prod), and the touchpoints listed on
each TC are matched against the running UI.

## Conventions

- **One file per module, one `test()` per TC card.** Filename = module name from the
  dashboard. `authentication.spec.js` contains every TC-AUTH-* card; `users.spec.js`
  will contain every TC-USR-*; etc. Each test title is `TC-ID — scenario`.
- **Login happens once.** `tests/auth.setup.js` runs ONCE per `playwright test` invocation,
  logs in, and saves cookies to `playwright/.auth/user.json`. Every TC spec inherits this
  storageState — no spec calls login UI directly.
- **Single browser, single session.** `workers: 1`, no parallel tabs, only chromium project.

```
automation/
├── config/env.js                  # 3-env (dev|stage|prod) resolver + role lookup
├── fixtures/base.js               # Custom test fixture: env, tc, loginAs, loginPage
├── pages/
│   ├── BasePage.js                # Reusable POM base
│   └── LoginPage.js               # Login selectors — single place to update
├── tests/
│   ├── auth.setup.js              # One-time login → saves storageState
│   └── authentication.spec.js     # All TC-AUTH-* cards (one test() each)
├── utils/
│   ├── tc-loader.js               # Fetches TCs live from dashboard /api + index.html, 5-min cache
│   └── touchpoint-verifier.js     # Iterates touchpoints[], records pass/fail/manual
├── playwright/.auth/              # Saved auth state (gitignored)
├── playwright.config.js
├── package.json
├── .env / .env.example
├── .gitignore
└── README.md
```

## Setup (once)

```bash
cd automation
npm install
npx playwright install chromium
cp .env.example .env                  # fill in passwords / URLs
```

## Run a specific testcase

Tests are titled `TC-ID — scenario`, so use `-g` to grep by TC ID:

```bash
npx playwright test -g "TC-AUTH-003"          # one TC across all modules
npx playwright test authentication            # whole Authentication module
npx playwright test authentication -g "001"   # combine module + TC number
```

To run everything: `npm test`. To watch the browser: `npm run test:headed`.

## Switch environment

```bash
npm run test:dev       # TEST_ENV=dev
npm run test:stage     # TEST_ENV=stage
npm run test:prod      # TEST_ENV=prod
# or persist in .env: TEST_ENV=stage
```

## Auth flow

```
   playwright test
        │
        ▼
   ┌─────────────────────┐
   │ setup project       │   tests/auth.setup.js
   │ (runs ONCE)         │   → posts to /api/login
   └──────────┬──────────┘   → saves playwright/.auth/user.json
              │ dependencies
              ▼
   ┌─────────────────────┐
   │ chromium project    │   every TC-*.spec.js
   │ (runs N specs)      │   starts with storageState pre-loaded
   └─────────────────────┘   → no login UI, no duplicate sessions
```

If cookies expire or the dashboard password rotates: `npm run auth:refresh`.

## How testcase data flows into specs

```
MEL Test Dashboard           tc-loader.js              spec
┌──────────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ /api/login           │───▶│ login + cookie   │    │ const TC =       │
│ /api/testcases       │───▶│ merge edits over │───▶│   await tc('...')│
│ /              HTML  │───▶│ embedded baseline│    │ // .steps        │
│ (script #quest-data) │    │ + 5-min cache    │    │ // .expected     │
└──────────────────────┘    └──────────────────┘    │ // .touchpoints  │
                                                    └──────────────────┘
```

Each TC has: `scenario`, `pre`, `steps`, `expected`, `severity`, `roles`,
`touchpoints[]` (role + screen + action). The spec drives the UI through the
steps, then `verifyAllTouchpoints` walks the touchpoints[] and records
pass / fail / manual per entry.

## Failure artifacts

Playwright writes to `test-results/` on failure:
- full-page screenshot (`screenshot: only-on-failure`)
- video (`video: retain-on-failure`)
- trace (`trace: retain-on-failure`) — open with `npx playwright show-trace`

HTML report (`playwright-report/`) bundles all of the above plus the
touchpoints JSON attached to each test. Open with `npm run report`.

## Add a new module / new TC

**New module:** create `tests/<module>.spec.js` (e.g. `users.spec.js`) with one
`test.describe('<Module>')` block. Add one `test('TC-ID — scenario', ...)` per
TC card the dashboard lists for that module.

**New TC in an existing module:** add another `test()` inside the existing
`describe()` block. Template:

```js
test('TC-XXX-NNN — short description', async ({ page, tc, env }) => {
  const TC = await tc('TC-XXX-NNN');
  annotate(test, TC, env);

  // Already logged in via storageState. Just navigate + act.
  await page.goto('/some/path');
  // ... execute TC.steps against the UI ...

  const results = await verifyAllTouchpoints(page, TC, {
    'Admin|Some Screen': async (p) => expect(p.locator('...')).toBeVisible(),
  });
  attachTouchpoints(test, results);
  expect(results.filter(r => r.status === 'fail')).toEqual([]);
});
```

Use `test.fixme('TC-ID — ...', ...)` for TCs whose UI isn't reachable yet —
they still appear in the report with the live TC metadata attached. Page
selectors live in `pages/`; specs stay thin.
