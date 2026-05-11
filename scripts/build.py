# -*- coding: utf-8 -*-
"""
Build script for the deployable Vercel dashboard.

Reads Admin_MasterData_TestPlan.xlsx from ../../testing and emits
public/index.html with all TC data embedded. The dashboard fetches live
status overrides from /api/status on load and POSTs status changes back.

Run:
    cd dashboard-app
    python scripts/build.py
"""
import io, json, re, sys
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# On Vercel (or any environment without openpyxl), exit cleanly.
# The dashboard is pre-built locally and public/index.html is committed.
try:
    import openpyxl
except ImportError:
    print('openpyxl not installed — skipping rebuild (public/index.html is pre-built).')
    sys.exit(0)

# Also exit cleanly if the source workbook is not bundled with the deploy.
if not (Path(__file__).resolve().parent.parent.parent / 'testing' / 'Admin_MasterData_TestPlan.xlsx').exists():
    print('Source workbook not found in this checkout — skipping rebuild (public/index.html is pre-built).')
    sys.exit(0)

HERE = Path(__file__).resolve().parent
APP = HERE.parent
XLSX = APP.parent / 'testing' / 'Admin_MasterData_TestPlan.xlsx'
OUT = APP / 'public' / 'index.html'

MODULES = [
    ('Core', 'Authentication',            'auth',     'Authentication',          '🔐', 'tc'),
    ('Core', 'AM-01 Users',               'users',    'Users',                   '👥', 'tc'),
    ('Master Data', 'AM-02 GSC Centres',          'centres',   'GSC Centres',             '🏢', 'tc'),
    ('Master Data', 'AM-04 State',                'states',    'States',                  '🗺️', 'tc'),
    ('Master Data', 'AM-05 District',             'districts', 'Districts',               '📍', 'tc'),
    ('Master Data', 'AM-06 Block-Taluk',          'blocks',    'Blocks / Taluks',         '🏘️', 'tc'),
    ('Master Data', 'AM-07 Village',              'villages',  'Villages',                '🌾', 'tc'),
    ('Master Data', 'AM-08 Pincode',              'pincodes',  'Pincodes',                '📮', 'tc'),
    ('Master Data', 'AM-03 Disability',           'disability','Disability Types',        '♿', 'tc'),
    ('Master Data', 'AM-09 Course Type',          'courseType','Course Types',            '📚', 'tc'),
    ('Master Data', 'AM-10 Impl Partners',        'iPartners', 'Implementation Partners', '🤝', 'tc'),
    ('Master Data', 'AM-11 Course Partners',      'cPartners', 'Course Partners',         '🎓', 'tc'),
    ('Master Data', 'AM-12 Financial Partners',   'fPartners', 'Financial Partners',      '💰', 'tc'),
    ('Quality', 'WCAG Accessibility',             'a11y',     'Accessibility (WCAG)',     '⌨️', 'wcag'),
    ('Quality', 'Defect Log',                     'defects',  'Defect Log',               '🐛', 'defects'),
    ('Quality', 'Resolutions',                    'resol',    'Resolutions',              '✅', 'resol'),
]

ROLE_PATTERNS = [
    ('Admin',      re.compile(r'\b(?:Admin|admin)\b')),
    ('State Head', re.compile(r'\b(?:State Head|SH|state-head)\b')),
    ('GSCO',       re.compile(r'\b(?:GSCO|gsco|G S C O)\b')),
]

def detect_roles(*texts):
    blob = ' '.join(t for t in texts if t)
    found = [r for r, p in ROLE_PATTERNS if p.search(blob)]
    if not found:
        found = ['Any']
    return found

def safe(cell):
    v = cell.value if hasattr(cell, 'value') else cell
    return '' if v is None else str(v)


wb = openpyxl.load_workbook(XLSX, data_only=False)

modules_out = []
total_tcs = 0

for category, sheet_name, mod_id, mod_name, icon, layout in MODULES:
    if sheet_name not in wb.sheetnames:
        continue
    ws = wb[sheet_name]
    tcs = []

    if layout == 'tc':
        for r in range(2, ws.max_row + 1):
            tcid = safe(ws.cell(row=r, column=1))
            if not tcid: continue
            scenario = safe(ws.cell(row=r, column=2))
            ttype = safe(ws.cell(row=r, column=3)) or 'Functional'
            pre = safe(ws.cell(row=r, column=4))
            steps = safe(ws.cell(row=r, column=5))
            expected = safe(ws.cell(row=r, column=6))
            status = safe(ws.cell(row=r, column=8)) or 'Not run'
            severity = safe(ws.cell(row=r, column=9)) or 'Medium'
            br = safe(ws.cell(row=r, column=10))
            notes = safe(ws.cell(row=r, column=11))
            tcs.append({
                'id': tcid, 'scenario': scenario, 'type': ttype,
                'pre': pre, 'steps': steps, 'expected': expected,
                'status': status, 'severity': severity, 'br': br,
                'notes': notes, 'roles': detect_roles(scenario, pre, steps, expected),
            })
    elif layout == 'wcag':
        for r in range(5, ws.max_row + 1):
            tcid = safe(ws.cell(row=r, column=1))
            if not tcid: continue
            extras = []
            wcag_sc = safe(ws.cell(row=r, column=2));  level = safe(ws.cell(row=r, column=3))
            principle = safe(ws.cell(row=r, column=4)); surface = safe(ws.cell(row=r, column=6))
            viewport = safe(ws.cell(row=r, column=12))
            if wcag_sc: extras.append(f'WCAG SC: {wcag_sc} ({level})')
            if principle: extras.append(f'Principle: {principle}')
            if surface: extras.append(f'Surface: {surface}')
            if viewport: extras.append(f'Viewport: {viewport}')
            scenario = safe(ws.cell(row=r, column=5))
            pre = safe(ws.cell(row=r, column=7))
            steps = safe(ws.cell(row=r, column=8))
            expected = safe(ws.cell(row=r, column=9))
            tcs.append({
                'id': tcid, 'scenario': scenario, 'type': 'Accessibility',
                'pre': pre, 'steps': steps, 'expected': expected,
                'status': safe(ws.cell(row=r, column=13)) or 'Not run',
                'severity': safe(ws.cell(row=r, column=11)) or 'Serious',
                'br': ' · '.join(extras),
                'notes': safe(ws.cell(row=r, column=14)),
                'roles': detect_roles(scenario, pre, steps),
            })
    elif layout == 'defects':
        for r in range(4, ws.max_row + 1):
            tcid = safe(ws.cell(row=r, column=1))
            if not tcid: continue
            extras = []
            linked = safe(ws.cell(row=r, column=2))
            mod = safe(ws.cell(row=r, column=3))
            priority = safe(ws.cell(row=r, column=8))
            reporter = safe(ws.cell(row=r, column=9))
            date = safe(ws.cell(row=r, column=10))
            if linked: extras.append(f'Linked TC: {linked}')
            if mod: extras.append(f'Module: {mod}')
            if priority: extras.append(f'Priority: {priority}')
            if reporter: extras.append(f'Reported by: {reporter}')
            if date: extras.append(f'Date: {date}')
            title = safe(ws.cell(row=r, column=4))
            desc = safe(ws.cell(row=r, column=5))
            steps = safe(ws.cell(row=r, column=6))
            tcs.append({
                'id': tcid, 'scenario': title, 'type': 'Bug',
                'pre': desc, 'steps': steps, 'expected': '',
                'status': safe(ws.cell(row=r, column=11)) or 'Open',
                'severity': safe(ws.cell(row=r, column=7)) or 'Medium',
                'br': ' · '.join(extras), 'notes': '',
                'roles': detect_roles(title, desc, steps),
            })
    elif layout == 'resol':
        for r in range(4, ws.max_row + 1):
            tcid = safe(ws.cell(row=r, column=1))
            if not tcid: continue
            extras = []
            source = safe(ws.cell(row=r, column=2))
            linked = safe(ws.cell(row=r, column=7))
            if source: extras.append(f'Source: {source}')
            if linked: extras.append(f'Linked TC: {linked}')
            title = safe(ws.cell(row=r, column=3))
            desc = safe(ws.cell(row=r, column=4))
            verify = safe(ws.cell(row=r, column=6))
            tcs.append({
                'id': tcid, 'scenario': title, 'type': 'Verification',
                'pre': desc, 'steps': verify, 'expected': '',
                'status': safe(ws.cell(row=r, column=8)) or 'Open',
                'severity': safe(ws.cell(row=r, column=5)) or 'Medium',
                'br': ' · '.join(extras), 'notes': '',
                'roles': detect_roles(title, desc, verify),
            })

    if not tcs: continue
    modules_out.append({
        'category': category, 'id': mod_id, 'name': mod_name,
        'icon': icon, 'sheet': sheet_name, 'tcs': tcs,
    })
    total_tcs += len(tcs)


DATA = {
    'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    'sourceFile': XLSX.name,
    'totalTcs': total_tcs,
    'modules': modules_out,
}

DATA_JSON = json.dumps(DATA, ensure_ascii=False).replace('</', '<\\/')

HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>MEL Test Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:#f6f7fb; --surface:#ffffff; --surface-2:#f9fafc; --surface-hi:#eef0f6;
    --border:#e2e6ef; --border-hi:#cbd2de;
    --text:#0f172a; --text-2:#475569; --text-3:#94a3b8;
    --primary:#6366f1; --primary-hi:#4f46e5; --primary-soft:#eef2ff;
    --violet:#8b5cf6; --violet-soft:#f3eaff;
    --emerald:#10b981; --emerald-soft:#ecfdf5;
    --rose:#f43f5e; --rose-soft:#ffe4e6;
    --amber:#f59e0b; --amber-soft:#fef3c7;
    --orange:#fb923c; --orange-soft:#fff0e2;
    --red:#ef4444; --red-soft:#fee2e2;
    --slate:#64748b; --slate-soft:#f1f5f9;
    --shadow-sm:0 1px 2px rgba(15,23,42,0.04),0 1px 3px rgba(15,23,42,0.06);
    --shadow:0 4px 12px rgba(15,23,42,0.06),0 2px 4px rgba(15,23,42,0.04);
    --shadow-lg:0 16px 48px rgba(15,23,42,0.10),0 4px 12px rgba(15,23,42,0.06);
    --topbar-h:64px; --sidebar-w:272px;
  }
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;line-height:1.5;-webkit-font-smoothing:antialiased}
  .topbar{position:sticky;top:0;z-index:60;height:var(--topbar-h);background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 24px;gap:24px}
  .logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:var(--text);cursor:pointer;letter-spacing:-0.02em}
  .logo-mark{width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,var(--primary),var(--violet));display:grid;place-items:center;color:#fff;font-size:18px;box-shadow:0 4px 10px rgba(99,102,241,0.35)}
  .logo-sub{color:var(--text-3);font-weight:500;font-size:13px}
  .topnav{display:flex;align-items:center;gap:6px;margin-left:8px}
  .role-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text-2);font-size:13px;font-weight:500;cursor:pointer;user-select:none;transition:100ms}
  .role-chip:hover{background:var(--surface-hi);color:var(--text)}
  .role-chip .dot{width:6px;height:6px;border-radius:50%;background:var(--text-3)}
  .role-chip[data-role="Admin"] .dot{background:var(--primary)}
  .role-chip[data-role="State Head"] .dot{background:var(--violet)}
  .role-chip[data-role="GSCO"] .dot{background:var(--emerald)}
  .role-chip.on{background:var(--primary-soft);color:var(--primary-hi);border-color:var(--primary);font-weight:600}
  .role-chip.on[data-role="State Head"]{background:var(--violet-soft);color:var(--violet);border-color:var(--violet)}
  .role-chip.on[data-role="GSCO"]{background:var(--emerald-soft);color:var(--emerald);border-color:var(--emerald)}
  .top-stats{margin-left:auto;display:flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--text-2)}
  .stat-pill{padding:5px 11px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px}
  .stat-pill b{color:var(--text);font-weight:700;margin-right:3px}
  .stat-pill.pass b{color:var(--emerald)}
  .stat-pill.fail b{color:var(--red)}
  .stat-pill.hold b{color:var(--amber)}
  .stat-pill.idle b{color:var(--slate)}
  .top-meta{color:var(--text-3);font-size:11px}
  .logout-btn{padding:7px 12px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text-2);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:100ms}
  .logout-btn:hover{background:var(--surface-hi);color:var(--text);border-color:var(--border-hi)}
  .menu-btn{display:none;background:var(--surface);border:1px solid var(--border);border-radius:8px;width:36px;height:36px;align-items:center;justify-content:center;cursor:pointer;color:var(--text-2);font-size:18px}
  .shell{display:grid;grid-template-columns:var(--sidebar-w) 1fr;min-height:calc(100vh - var(--topbar-h))}
  .sidebar{position:sticky;top:var(--topbar-h);height:calc(100vh - var(--topbar-h));overflow-y:auto;background:var(--surface);border-right:1px solid var(--border);padding:18px 14px}
  .sidebar .home-link{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:var(--text-2);cursor:pointer;font-weight:600;font-size:13.5px;margin-bottom:14px}
  .sidebar .home-link:hover{background:var(--surface-hi);color:var(--text)}
  .sidebar .home-link.active{background:var(--primary-soft);color:var(--primary-hi)}
  .sidebar .category{margin-top:14px;padding:0 12px;font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.10em}
  .sidebar .module-link{display:flex;align-items:center;gap:10px;padding:8px 12px;margin-top:2px;border-radius:8px;color:var(--text-2);font-size:13.5px;font-weight:500;cursor:pointer;transition:80ms}
  .sidebar .module-link:hover{background:var(--surface-hi);color:var(--text)}
  .sidebar .module-link.active{background:var(--primary-soft);color:var(--primary-hi);font-weight:600}
  .sidebar .module-link .ic{font-size:16px}
  .sidebar .module-link .count{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-3);background:var(--surface-hi);padding:2px 8px;border-radius:999px;min-width:30px;text-align:center}
  .sidebar .module-link.active .count{background:rgba(99,102,241,0.18);color:var(--primary-hi)}
  main{padding:26px 32px 80px;max-width:1400px}
  .hero{background:linear-gradient(135deg,#fff,#f5f7ff);border:1px solid var(--border);border-radius:16px;padding:28px 32px;margin-bottom:26px;position:relative;overflow:hidden}
  .hero::after{content:'';position:absolute;right:-60px;top:-60px;width:240px;height:240px;background:radial-gradient(circle,rgba(99,102,241,0.15),transparent 70%)}
  .hero h1{margin:0 0 6px;font-size:28px;font-weight:800;letter-spacing:-0.02em;color:var(--text)}
  .hero p{margin:0;color:var(--text-2);font-size:14px}
  .hero .role-banner{margin-top:14px;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;background:var(--surface);border:1px solid var(--border);border-radius:999px;font-size:12px;color:var(--text-2)}
  .hero .role-banner b{color:var(--text);font-weight:600}
  .cat-block{margin-bottom:32px}
  .cat-title{font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.1em}
  .module-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .module-card{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:12px;cursor:pointer;transition:120ms}
  .module-card:hover{transform:translateY(-2px);border-color:var(--primary);box-shadow:var(--shadow)}
  .module-card .ic{font-size:28px;display:block;margin-bottom:10px}
  .module-card .name{font-weight:700;font-size:15px;color:var(--text)}
  .module-card .meta{font-size:12px;color:var(--text-2);margin-top:6px}
  .module-card .progress{height:4px;border-radius:999px;background:var(--surface-hi);margin-top:14px;overflow:hidden}
  .module-card .progress>div{height:100%;background:linear-gradient(90deg,var(--primary),var(--violet));transition:width 400ms ease}
  .crumb{font-size:12px;color:var(--text-3);margin-bottom:6px;font-family:'JetBrains Mono',monospace}
  .crumb a{color:var(--primary);text-decoration:none;cursor:pointer}
  .crumb a:hover{text-decoration:underline}
  .page-head{display:flex;align-items:center;gap:16px;margin-bottom:22px}
  .page-head .ic{width:56px;height:56px;border-radius:14px;background:var(--primary-soft);display:grid;place-items:center;font-size:28px}
  .page-head h1{margin:0;font-size:24px;font-weight:800;letter-spacing:-0.015em;color:var(--text)}
  .page-head .sub{font-size:13px;color:var(--text-2)}
  .filter-bar{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:22px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
  .fselect{padding:8px 32px 8px 12px;border:1px solid var(--border);border-radius:8px;background-color:var(--surface);background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px;font-family:'Inter',sans-serif;font-size:13px;color:var(--text);cursor:pointer;appearance:none;-webkit-appearance:none;-moz-appearance:none;min-width:150px;transition:100ms}
  .fselect:hover{border-color:var(--border-hi);background-color:var(--surface-hi)}
  .fselect:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
  .fselect.active{border-color:var(--primary);background-color:var(--primary-soft);color:var(--primary-hi);font-weight:600}
  .search{flex:1;min-width:200px;padding:7px 12px 7px 32px;border:1px solid var(--border);border-radius:8px;background:var(--surface) url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2394a3b8'%3E%3Cpath fill-rule='evenodd' d='M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z' clip-rule='evenodd'/%3E%3C/svg%3E") no-repeat 10px center;background-size:14px;font-family:'Inter',sans-serif;font-size:13px;color:var(--text);outline:none}
  .search:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
  .btn{padding:7px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;color:var(--text-2);font-family:'Inter',sans-serif;font-size:12px;font-weight:500;cursor:pointer;transition:100ms}
  .btn:hover{background:var(--surface-hi);color:var(--text);border-color:var(--border-hi)}
  .btn.primary{background:var(--primary-hi);border-color:var(--primary-hi);color:#fff}
  .btn.primary:hover{background:var(--primary);border-color:var(--primary);color:#fff}
  .tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
  .tc-card{position:relative;padding:16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;cursor:pointer;transition:120ms;overflow:hidden}
  .tc-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--accent,var(--primary))}
  .tc-card.type-Functional{--accent:var(--primary)}
  .tc-card.type-Negative{--accent:var(--rose)}
  .tc-card.type-Edge{--accent:var(--amber)}
  .tc-card.type-Integration{--accent:var(--violet)}
  .tc-card.type-Accessibility{--accent:var(--emerald)}
  .tc-card.type-Bug{--accent:var(--red)}
  .tc-card.type-Verification{--accent:var(--orange)}
  .tc-card:hover{transform:translateY(-2px);border-color:var(--border-hi);box-shadow:var(--shadow)}
  .tc-card .row1{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
  .tc-card .tcid{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--primary-hi);font-weight:600}
  .pill{display:inline-flex;align-items:center;padding:2px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border-radius:4px}
  .pill.type.Functional{background:var(--primary-soft);color:var(--primary-hi)}
  .pill.type.Negative{background:var(--rose-soft);color:#be123c}
  .pill.type.Edge{background:var(--amber-soft);color:#b45309}
  .pill.type.Integration{background:var(--violet-soft);color:#6d28d9}
  .pill.type.Accessibility{background:var(--emerald-soft);color:#047857}
  .pill.type.Bug{background:var(--red-soft);color:#b91c1c}
  .pill.type.Verification{background:var(--orange-soft);color:#c2410c}
  .pill.sev.Critical{background:var(--red-soft);color:#b91c1c}
  .pill.sev.High{background:var(--orange-soft);color:#c2410c}
  .pill.sev.Medium{background:var(--amber-soft);color:#b45309}
  .pill.sev.Low{background:var(--emerald-soft);color:#166534}
  .pill.sev.Serious{background:var(--rose-soft);color:#be123c}
  .pill.sev.Minor{background:var(--slate-soft);color:var(--slate)}
  .pill.sev.RESPONSIVE{background:var(--violet-soft);color:#6d28d9}
  .pill.status.Pass{background:var(--emerald-soft);color:#047857}
  .pill.status.Fail{background:var(--red-soft);color:#b91c1c}
  .pill.status.Open{background:var(--orange-soft);color:#c2410c}
  .pill.status[data-status="On Hold"]{background:var(--amber-soft);color:#b45309}
  .tc-card h3{margin:0 0 8px;font-size:14.5px;font-weight:600;color:var(--text);line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .tc-card .roles{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
  .role-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:10px;font-weight:600;background:var(--surface-2);color:var(--text-2);border:1px solid var(--border);border-radius:999px}
  .role-badge.role-Admin{color:var(--primary-hi);background:var(--primary-soft);border-color:var(--primary)}
  .role-badge.role-StateHead{color:var(--violet);background:var(--violet-soft);border-color:var(--violet)}
  .role-badge.role-GSCO{color:#047857;background:var(--emerald-soft);border-color:var(--emerald)}
  .role-badge.role-Any{color:var(--text-3)}
  .empty{grid-column:1/-1;padding:56px 20px;text-align:center;background:var(--surface);border:1px dashed var(--border);border-radius:12px;color:var(--text-3)}
  .empty b{display:block;color:var(--text);font-size:16px;font-weight:700;margin-bottom:4px}
  .modal-bg{position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:200;display:none;align-items:flex-start;justify-content:center;overflow-y:auto;padding:36px 16px}
  .modal-bg.on{display:flex}
  .modal{width:100%;max-width:820px;background:var(--surface);border-radius:16px;padding:28px 32px 26px;box-shadow:var(--shadow-lg)}
  .modal .x{float:right;background:var(--surface);border:1px solid var(--border);width:30px;height:30px;border-radius:7px;cursor:pointer;color:var(--text-2);font-size:18px;line-height:1}
  .modal .x:hover{background:var(--surface-hi);color:var(--text)}
  .modal .modal-row1{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .modal .modal-row1 .tcid{font-family:'JetBrains Mono',monospace;color:var(--primary-hi);font-weight:600;font-size:12.5px}
  .modal h2{margin:4px 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.01em;color:var(--text)}
  .modal section{margin-top:18px;padding-top:16px;border-top:1px solid var(--border)}
  .modal section:first-of-type{border-top:none;padding-top:0;margin-top:0}
  .modal h4{font-size:11px;font-weight:700;color:var(--text-3);margin:0 0 8px;text-transform:uppercase;letter-spacing:0.10em}
  .modal pre{margin:0;font-family:'Inter',sans-serif;font-size:13.5px;line-height:1.65;color:var(--text);white-space:pre-wrap;word-wrap:break-word}
  .modal-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
  .status-edit{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .status-edit label{font-size:12px;font-weight:600;color:var(--text-2)}
  .status-edit select{padding:7px 28px 7px 12px;border:1px solid var(--border);border-radius:8px;background-color:var(--surface);background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2364748b'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:14px;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;cursor:pointer;appearance:none;-webkit-appearance:none;-moz-appearance:none;min-width:140px;outline:none}
  .status-edit select:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
  .status-edit select[data-status="Pass"]{color:#047857;background-color:var(--emerald-soft);border-color:var(--emerald)}
  .status-edit select[data-status="Fail"]{color:#b91c1c;background-color:var(--red-soft);border-color:var(--red)}
  .status-edit select[data-status="On Hold"]{color:#b45309;background-color:var(--amber-soft);border-color:var(--amber)}
  .status-edit .save-ind{font-size:12px;color:var(--text-3);display:none}
  .status-edit .save-ind.on{display:inline}
  .status-edit .save-ind.ok{color:var(--emerald)}
  .status-edit .save-ind.err{color:var(--red)}
  @media (max-width:960px){.menu-btn{display:flex}.shell{grid-template-columns:1fr}.sidebar{position:fixed;top:var(--topbar-h);left:0;bottom:0;width:var(--sidebar-w);z-index:50;transform:translateX(-105%);transition:transform 220ms;box-shadow:var(--shadow-lg)}.sidebar.open{transform:translateX(0)}.topnav{display:none}.top-stats{display:none}main{padding:18px 14px 60px}}
  @media (max-width:520px){.tc-grid{grid-template-columns:1fr}.logo-sub{display:none}}
</style>
</head>
<body>
<div class="topbar">
  <button class="menu-btn" id="menuBtn" aria-label="Menu">☰</button>
  <div class="logo" id="goHome">
    <div class="logo-mark">▲</div>
    <div>MEL Test Dashboard<div class="logo-sub" id="roleSummary"></div></div>
  </div>
  <div class="topnav" id="topnav"></div>
  <div class="top-stats" id="topStats"></div>
  <button class="logout-btn" id="logoutBtn" title="Sign out">⏻ Sign out</button>
</div>
<div class="shell">
  <aside class="sidebar" id="sidebar"></aside>
  <main id="root"></main>
</div>
<div class="modal-bg" id="modalBg"><div class="modal" id="modal"></div></div>

<script id="quest-data" type="application/json">__DATA__</script>
<script>
const DATA = JSON.parse(document.getElementById('quest-data').textContent);
const STATUS_OVERRIDES = {};   // tcId -> live status from /api/status (overrides embedded)

function effectiveStatus(tc) {
  if (Object.prototype.hasOwnProperty.call(STATUS_OVERRIDES, tc.id)) {
    return STATUS_OVERRIDES[tc.id] || 'Not run';
  }
  return tc.status || 'Not run';
}

const state = {
  view: 'home', moduleId: null, role: 'All',
  filters: { type:'All', sev:'All', status:'All' },
  search: '',
};

const TYPES = ['Functional','Negative','Edge','Integration','Accessibility','Bug','Verification'];
const SEVS  = ['Critical','High','Medium','Low','Serious','Minor'];
const STATS = ['Not run','Pass','Fail','On Hold','Open'];
const ROLES = ['Admin','State Head','GSCO'];
const STATUS_CHOICES = ['Not run','Pass','Fail','On Hold'];

function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'on') for (const ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}
function tcMatchesRole(tc) {
  if (state.role === 'All') return true;
  return tc.roles.includes(state.role);
}

async function loadStatusOverrides() {
  try {
    const r = await fetch('/api/status', { credentials:'same-origin' });
    if (!r.ok) return;
    const data = await r.json();
    for (const k in data) STATUS_OVERRIDES[k] = data[k];
  } catch (e) { /* offline fallback to embedded statuses */ }
}

async function setStatusOnServer(tcId, status) {
  const r = await fetch('/api/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ tcId, status }),
  });
  if (!r.ok) throw new Error(r.status);
  if (!status || status === 'Not run') {
    delete STATUS_OVERRIDES[tcId];
  } else {
    STATUS_OVERRIDES[tcId] = status;
  }
}

function renderTopNav() {
  const top = document.getElementById('topnav');
  top.innerHTML = '';
  for (const r of ['All','Admin','State Head','GSCO']) {
    top.appendChild(el('span', {
      class:'role-chip' + (state.role===r?' on':''),
      'data-role': r,
      on: { click: () => { state.role = r; render(); } }
    }, r==='All' ? null : el('span',{class:'dot'}), r));
  }
}
function renderTopStats() {
  const stats = document.getElementById('topStats');
  const sub = document.getElementById('roleSummary');
  let total=0,pass=0,fail=0,hold=0,notRun=0;
  for (const m of DATA.modules) for (const tc of m.tcs) {
    if (!tcMatchesRole(tc)) continue;
    total++;
    const s = effectiveStatus(tc);
    if (s==='Pass') pass++;
    else if (s==='Fail') fail++;
    else if (s==='On Hold') hold++;
    else if (s==='Not run' || s==='') notRun++;
  }
  stats.innerHTML = '';
  stats.appendChild(el('span',{class:'stat-pill'},el('b',{},String(total)),' tests'));
  stats.appendChild(el('span',{class:'stat-pill pass'},el('b',{},String(pass)),' pass'));
  stats.appendChild(el('span',{class:'stat-pill fail'},el('b',{},String(fail)),' fail'));
  stats.appendChild(el('span',{class:'stat-pill hold'},el('b',{},String(hold)),' on hold'));
  stats.appendChild(el('span',{class:'stat-pill idle'},el('b',{},String(notRun)),' not run'));
  stats.appendChild(el('span',{class:'top-meta'},'· ' + DATA.generatedAt));
  sub.textContent = state.role==='All' ? 'All roles · ' + DATA.totalTcs + ' total tests' : state.role + ' · ' + total + ' tests';
}
function renderSidebar() {
  const sb = document.getElementById('sidebar');
  sb.innerHTML = '';
  sb.appendChild(el('div',{class:'home-link'+(state.view==='home'?' active':''),on:{click:goHome}},'⌂ ','Dashboard Home'));
  const byCat = {};
  for (const m of DATA.modules) (byCat[m.category] ||= []).push(m);
  for (const cat in byCat) {
    sb.appendChild(el('div',{class:'category'}, cat));
    for (const m of byCat[cat]) {
      const visible = m.tcs.filter(tcMatchesRole).length;
      sb.appendChild(el('div',{
        class:'module-link'+(state.moduleId===m.id?' active':''),
        on:{click: () => openModule(m.id)}
      }, el('span',{class:'ic'},m.icon), el('span',{}, m.name), el('span',{class:'count'},String(visible))));
    }
  }
}
function goHome() {
  state.view='home'; state.moduleId=null;
  state.filters={type:'All',sev:'All',status:'All'}; state.search='';
  closeSidebar(); render();
}
function openModule(id) {
  state.view='module'; state.moduleId=id;
  state.filters={type:'All',sev:'All',status:'All'}; state.search='';
  closeSidebar(); render();
  window.scrollTo({top:0});
}
function renderHome() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  const hero = el('div',{class:'hero'},
    el('h1',{},'Test Catalogue'),
    el('p',{},`Browse ${DATA.totalTcs} test cases across ${DATA.modules.length} modules. Use the role buttons on top to filter; pick a module from the sidebar to dig in.`)
  );
  if (state.role !== 'All') {
    const c = DATA.modules.reduce((acc,m)=>acc+m.tcs.filter(tcMatchesRole).length, 0);
    hero.appendChild(el('div',{class:'role-banner'},'Filtering by ',el('b',{},state.role),` · ${c} tests match`));
  }
  root.appendChild(hero);
  const byCat = {};
  for (const m of DATA.modules) (byCat[m.category] ||= []).push(m);
  for (const cat in byCat) {
    const block = el('div',{class:'cat-block'},
      el('div',{class:'cat-title'},cat),
      el('div',{class:'module-grid'}, ...byCat[cat].map(m=>moduleCard(m)))
    );
    root.appendChild(block);
  }
}
function moduleCard(m) {
  const visible = m.tcs.filter(tcMatchesRole);
  const total = visible.length;
  const pass = visible.filter(t => effectiveStatus(t)==='Pass').length;
  const fail = visible.filter(t => effectiveStatus(t)==='Fail').length;
  const tested = pass + fail;
  const pct = total ? Math.round(tested/total*100) : 0;
  return el('div',{class:'module-card', on:{click:()=>openModule(m.id)}},
    el('span',{class:'ic'}, m.icon),
    el('div',{class:'name'}, m.name),
    el('div',{class:'meta'}, String(total)+' tests · '+String(tested)+' covered'),
    el('div',{class:'progress'}, el('div',{style:`width:${pct}%`}))
  );
}
function renderModule() {
  const root = document.getElementById('root');
  root.innerHTML = '';
  const m = DATA.modules.find(x=>x.id===state.moduleId);
  if (!m) { goHome(); return; }
  root.appendChild(el('div',{class:'crumb'},
    el('a',{on:{click:goHome}},'⌂ Home'), el('span',{},' › '),
    el('span',{},m.category), el('span',{},' › '), el('span',{},m.name)));
  root.appendChild(el('div',{class:'page-head'},
    el('div',{class:'ic'},m.icon),
    el('div',{}, el('h1',{},m.name),
      el('div',{class:'sub'}, `${m.tcs.length} test cases · ${state.role==='All'?'All roles':state.role+' filter'}`))));
  const fb = el('div',{class:'filter-bar'});
  fb.appendChild(makeSelect('Type','type',['All',...TYPES]));
  fb.appendChild(makeSelect('Severity','sev',['All',...SEVS]));
  fb.appendChild(makeSelect('Status','status',['All',...STATS]));
  const search = el('input',{class:'search',type:'search',placeholder:'Search id, scenario, steps, expected…'});
  search.value = state.search;
  search.addEventListener('input', e => { state.search = e.target.value; renderGrid(m); });
  fb.appendChild(search);
  fb.appendChild(el('button',{class:'btn', on:{click:()=>exportCsv(m)}}, '⤓ Export CSV'));
  root.appendChild(fb);
  root.appendChild(el('div',{class:'tc-grid',id:'tcGrid'}));
  renderGrid(m);
}
function makeSelect(label,key,options) {
  const isActive = state.filters[key] && state.filters[key]!=='All';
  const sel = el('select',{class:'fselect'+(isActive?' active':''),'aria-label':label,
    on:{change: e => { state.filters[key]=e.target.value; renderModule(); }}});
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt==='All' ? label+': All' : opt;
    if (state.filters[key]===opt) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}
function filteredTcs(m) {
  const f = state.filters;
  const q = state.search.trim().toLowerCase();
  return m.tcs.filter(tc => {
    if (!tcMatchesRole(tc)) return false;
    if (f.type!=='All' && tc.type!==f.type) return false;
    if (f.sev!=='All' && tc.severity!==f.sev) return false;
    if (f.status!=='All' && effectiveStatus(tc)!==f.status) return false;
    if (q) {
      const blob = [tc.id, tc.scenario, tc.pre, tc.steps, tc.expected, tc.notes].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}
function renderGrid(m) {
  const grid = document.getElementById('tcGrid');
  grid.innerHTML = '';
  const tcs = filteredTcs(m);
  if (!tcs.length) {
    grid.appendChild(el('div',{class:'empty'}, el('b',{},'No tests match the filters'), 'Try clearing the role, type, severity, status filters, or the search.'));
    return;
  }
  for (const tc of tcs) grid.appendChild(tcCard(tc));
}
function tcCard(tc) {
  const c = el('div',{class:'tc-card type-'+(tc.type||'Functional'), on:{click:()=>openTc(tc)}});
  const s = effectiveStatus(tc);
  c.appendChild(el('div',{class:'row1'},
    el('span',{class:'tcid'}, tc.id),
    el('span',{class:'pill type '+(tc.type||'')}, tc.type||'Functional'),
    el('span',{class:'pill sev '+(tc.severity||'')}, tc.severity||'—'),
    (s && s!=='Not run') ? el('span',{class:'pill status '+s,'data-status':s}, s) : null
  ));
  c.appendChild(el('h3',{}, tc.scenario || '(no name)'));
  if (tc.roles && tc.roles.length) {
    const row = el('div',{class:'roles'});
    for (const r of tc.roles) {
      const cls = r==='State Head' ? 'role-StateHead' : 'role-'+r.replace(/\s/g,'');
      row.appendChild(el('span',{class:'role-badge '+cls},
        r==='Admin'?'👑 Admin':r==='State Head'?'🛡 State Head':r==='GSCO'?'🎯 GSCO':'◇ '+r));
    }
    c.appendChild(row);
  }
  return c;
}
function openTc(tc) {
  const m = document.getElementById('modal');
  m.innerHTML = '';
  m.appendChild(el('button',{class:'x',on:{click:closeTc}},'×'));
  const s = effectiveStatus(tc);
  m.appendChild(el('div',{class:'modal-row1'},
    el('span',{class:'tcid'}, tc.id),
    el('span',{class:'pill type '+(tc.type||'')}, tc.type||'Functional'),
    el('span',{class:'pill sev '+(tc.severity||'')}, tc.severity||'—'),
    (s && s!=='Not run') ? el('span',{class:'pill status '+s,'data-status':s}, s) : null));
  m.appendChild(el('h2',{}, tc.scenario || '(no name)'));
  if (tc.roles && tc.roles.length) {
    const r = el('div',{class:'roles', style:'margin-bottom:16px;'});
    for (const role of tc.roles) {
      const cls = role==='State Head' ? 'role-StateHead' : 'role-'+role.replace(/\s/g,'');
      r.appendChild(el('span',{class:'role-badge '+cls},
        role==='Admin'?'👑 Admin':role==='State Head'?'🛡 State Head':role==='GSCO'?'🎯 GSCO':'◇ '+role));
    }
    m.appendChild(r);
  }
  // Status edit row
  const sEdit = el('div',{class:'status-edit'});
  sEdit.appendChild(el('label',{},'Status:'));
  const sel = el('select',{'data-status':s,'aria-label':'Status'});
  for (const opt of STATUS_CHOICES) {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (s===opt) o.selected = true;
    sel.appendChild(o);
  }
  const ind = el('span',{class:'save-ind'},'');
  sel.addEventListener('change', async () => {
    const newStatus = sel.value;
    sel.setAttribute('data-status', newStatus);
    ind.className = 'save-ind on'; ind.textContent = 'Saving…';
    try {
      await setStatusOnServer(tc.id, newStatus);
      ind.className = 'save-ind on ok'; ind.textContent = '✓ Saved';
      renderTopStats(); renderSidebar();
      // Refresh card if module view is active
      if (state.view==='module') {
        const mod = DATA.modules.find(x=>x.id===state.moduleId);
        if (mod) renderGrid(mod);
      } else {
        renderHome();
      }
      setTimeout(()=>{ ind.className='save-ind'; ind.textContent=''; }, 1600);
    } catch (e) {
      ind.className = 'save-ind on err'; ind.textContent = '✕ Save failed';
    }
  });
  sEdit.appendChild(sel); sEdit.appendChild(ind);
  m.appendChild(el('section',{},
    el('h4',{},'Test Status'),
    sEdit
  ));
  if (tc.pre)      m.appendChild(section('Precondition', tc.pre));
  if (tc.steps)    m.appendChild(section('Steps', tc.steps));
  if (tc.expected) m.appendChild(section('Expected Result', tc.expected));
  if (tc.notes)    m.appendChild(section('Notes', tc.notes));
  if (tc.br)       m.appendChild(section('References', tc.br));
  const actions = el('div',{class:'modal-actions'});
  actions.appendChild(el('button',{class:'btn primary',on:{click:e=>copyTc(e.target,tc,'json')}},'Copy as JSON'));
  actions.appendChild(el('button',{class:'btn',on:{click:e=>copyTc(e.target,tc,'md')}},'Copy as Markdown'));
  m.appendChild(actions);
  document.getElementById('modalBg').classList.add('on');
}
function section(label,text){return el('section',{},el('h4',{},label),el('pre',{},text));}
function closeTc(){document.getElementById('modalBg').classList.remove('on');}
document.getElementById('modalBg').addEventListener('click',e=>{if(e.target===document.getElementById('modalBg'))closeTc();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTc();});
document.getElementById('goHome').addEventListener('click',goHome);
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await fetch('/api/logout',{method:'POST',credentials:'same-origin'}); } catch {}
  location.replace('/login.html');
});
function copyTc(btn,tc,fmt) {
  const s = effectiveStatus(tc);
  let text;
  if (fmt==='json') {
    text = JSON.stringify({...tc, status: s}, null, 2);
  } else {
    text = `# ${tc.id} — ${tc.scenario}\n\n` +
      `**Type:** ${tc.type}  ·  **Severity:** ${tc.severity}  ·  **Status:** ${s}\n` +
      `**Roles:** ${(tc.roles||[]).join(', ')}\n\n` +
      (tc.pre      ? `## Precondition\n${tc.pre}\n\n` : '') +
      (tc.steps    ? `## Steps\n${tc.steps}\n\n` : '') +
      (tc.expected ? `## Expected\n${tc.expected}\n\n` : '') +
      (tc.notes    ? `## Notes\n${tc.notes}\n\n` : '') +
      (tc.br       ? `## References\n${tc.br}\n` : '');
  }
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(()=>{ btn.textContent = orig; }, 1300);
  });
}
function exportCsv(m) {
  const rows = filteredTcs(m);
  if (!rows.length) { alert('Nothing to export — clear some filters first.'); return; }
  const headers = ['TC ID','Scenario','Type','Severity','Status','Roles','Precondition','Steps','Expected Result','References','Notes'];
  const csv = [headers.join(',')];
  for (const r of rows) {
    const cells = [r.id, r.scenario, r.type, r.severity, effectiveStatus(r),
      (r.roles||[]).join('; '), r.pre, r.steps, r.expected, r.br, r.notes];
    csv.push(cells.map(csvEscape).join(','));
  }
  const blob = new Blob(['﻿' + csv.join('\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${m.id}-filtered.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}
function csvEscape(v) {
  v = (v ?? '').toString();
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g,'""') + '"';
  return v;
}
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); }
document.getElementById('menuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});
function render() {
  renderTopNav(); renderTopStats(); renderSidebar();
  if (state.view==='home') renderHome(); else renderModule();
}
loadStatusOverrides().then(render).catch(render);
</script>
</body>
</html>
"""

html = HTML.replace('__DATA__', DATA_JSON)
OUT.write_text(html, encoding='utf-8')
print(f'Generated: {OUT}')
print(f'Total modules: {len(modules_out)}')
print(f'Total TCs:     {total_tcs}')
print(f'File size:     {OUT.stat().st_size/1024:.1f} KB')
