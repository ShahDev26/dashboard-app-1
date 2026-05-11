# MEL Test Dashboard — Vercel deployment

A password-gated dashboard that surfaces every test case in the workbook and
lets you toggle status to `Pass` / `Fail` / `On Hold`. Status changes persist
to **Vercel KV** so anyone you share the URL with sees the latest values on
refresh.

```
dashboard-app/
├── api/
│   ├── login.js     POST /api/login  - validates password, sets cookie
│   ├── logout.js    POST /api/logout - clears cookie
│   └── status.js    GET/POST /api/status - reads/writes Vercel KV
├── middleware.js    Edge middleware - gates every request on cookie
├── public/
│   ├── login.html   The sign-in page
│   └── index.html   The dashboard (built from the workbook)
├── scripts/
│   └── build.py     Reads ../testing/...xlsx and emits public/index.html
├── package.json
├── vercel.json
└── README.md
```

## 1) Build the dashboard

```powershell
cd "D:\EI_Official\OneDrive - Enable India\Desktop\MEL-Project\dashboard-app"
python scripts/build.py
```

This reads `../testing/Admin_MasterData_TestPlan.xlsx` and writes
`public/index.html`. Re-run it whenever the workbook changes.

## 2) Deploy to Vercel (first time)

### a. Push the project to GitHub
Initialise this folder as a git repo and push it to a private GitHub repo.
(You can include the workbook in `../testing/` or use a separate flow to
just push `dashboard-app/`.)

### b. Import the repo in Vercel
- Go to https://vercel.com/new
- Pick your GitHub repo
- **Root Directory:** select `dashboard-app`
- Framework Preset: **Other** (Vercel auto-detects the api/ folder)
- Build Command: leave blank (no build needed; `public/index.html` is pre-built)
- Output Directory: `public`
- Click **Deploy**

### c. Add Vercel KV
- In the Vercel project, go to **Storage** → **Create Database** → **KV**
- Name it something like `mel-status`
- Click **Connect** and pick the dashboard project
- Vercel auto-sets the `KV_*` env vars in your project

### d. Set the password
- Go to **Settings** → **Environment Variables**
- Add `DASHBOARD_PASSWORD` with the shared password value (any string)
- Select **Production, Preview, Development**
- Save

### e. Redeploy
After adding env vars, redeploy (Deployments → ⋮ → Redeploy). Done.

## 3) Share with the developer
Send the developer:
- The Vercel URL (e.g. `https://mel-dashboard.vercel.app`)
- The shared password

They visit the URL → enter the password → see the dashboard.

## 4) Updating statuses
Anyone signed in can:
- Open any test card → modal → change the Status dropdown to
  `Pass`, `Fail`, `On Hold`, or `Not run`
- Changes save instantly to Vercel KV
- The developer's view picks up the change on next refresh

Status values flow: **embedded default (Not run)** → **KV override**. If you
clear the dashboard's Vercel KV, every test case returns to "Not run".

## 5) Updating test cases
1. Edit the Excel workbook (`testing/Admin_MasterData_TestPlan.xlsx`)
2. Run the build script again:
   ```powershell
   python scripts/build.py
   ```
3. Commit `public/index.html` and push — Vercel auto-deploys.

(Status overrides in KV persist across rebuilds — they're keyed by TC ID.)

## Local development

```powershell
npm install
vercel dev
```

This runs the dashboard + APIs locally with hot reload. You need to have the
Vercel CLI installed and the project linked (`vercel link`) so it pulls env
vars + KV credentials.

## Notes / honour system

Per the chosen design, there is **one shared password** that grants both view
and edit. The developer is trusted not to change statuses; if you ever want
strict separation, swap in two passwords (viewer / admin) — let the build
author know and the API + UI can be split.
