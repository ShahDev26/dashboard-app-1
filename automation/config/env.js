import 'dotenv/config';

const ENV = (process.env.TEST_ENV || 'dev').toLowerCase();
const ALLOWED = ['dev', 'stage', 'prod'];
if (!ALLOWED.includes(ENV)) {
  throw new Error(`TEST_ENV must be one of ${ALLOWED.join(', ')} — got "${ENV}"`);
}

const pick = (key) => process.env[`${ENV.toUpperCase()}_${key}`] || '';

const role = (prefix) => ({
  email:    pick(`${prefix}_EMAIL`),
  mobile:   pick(`${prefix}_MOBILE`),
  password: pick(`${prefix}_PASS`),
});

export const env = {
  name: ENV,
  baseURL: pick('BASE_URL'),
  apiURL: pick('API_URL'),
  loginPath: pick('LOGIN_PATH') || '/login',
  users: {
    admin:      role('ADMIN'),
    stateHead:  role('STATEHEAD'),
    gsco:       role('GSCO'),
    firstLogin: role('FIRSTLOGIN'),
    blocked:    role('BLOCKED'),
    qaAdmin:    role('QAADMIN'),
  },
  dashboard: {
    url: process.env.DASHBOARD_URL || 'https://dashboard-app-sigma-gilt.vercel.app',
    password: process.env.DASHBOARD_PASSWORD || '',
  },
  runtime: {
    headless: String(process.env.HEADLESS ?? 'true').toLowerCase() !== 'false',
    screenshot: process.env.SCREENSHOT_ON_FAILURE || 'only-on-failure',
    video: process.env.VIDEO || 'retain-on-failure',
    trace: process.env.TRACE || 'retain-on-failure',
    timeout: Number(process.env.DEFAULT_TIMEOUT_MS || 30000),
  },
};

const ROLE_MAP = {
  admin: 'admin',
  statehead: 'stateHead', 'state head': 'stateHead', 'state-head': 'stateHead',
  gsco: 'gsco',
  firstlogin: 'firstLogin', 'first-login': 'firstLogin', 'first login': 'firstLogin',
  blocked: 'blocked', inactive: 'blocked',
  qaadmin: 'qaAdmin', 'qa admin': 'qaAdmin', 'qa-admin': 'qaAdmin', qa: 'qaAdmin',
};

export function userFor(role) {
  const norm = String(role || '').toLowerCase().trim();
  const key = ROLE_MAP[norm] ?? ROLE_MAP[norm.replace(/[\s_-]/g, '')];
  const user = key && env.users[key];
  if (!user || !(user.email || user.mobile) || !user.password) {
    throw new Error(`No credentials configured for role "${role}" in env "${ENV}"`);
  }
  return user;
}
