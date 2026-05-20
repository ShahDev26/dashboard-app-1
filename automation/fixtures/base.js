import { test as base, expect } from '@playwright/test';
import { env, userFor } from '../config/env.js';
import { loadTestcase } from '../utils/tc-loader.js';
import { LoginPage } from '../pages/LoginPage.js';

/**
 * Custom test fixture — every spec gets:
 *   - env:        resolved env block (URL + creds for current TEST_ENV)
 *   - tc(id):     async loader that returns the TC's scenario/steps/expected/touchpoints
 *   - loginAs:    helper to log into the MEL platform as a given role
 *   - loginPage:  pre-built LoginPage POM bound to the active page
 */
export const test = base.extend({
  env: async ({}, use) => { await use(env); },

  tc: async ({}, use) => {
    await use((id, opts) => loadTestcase(id, opts));
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  loginAs: async ({ page }, use) => {
    await use(async (role) => {
      const creds = userFor(role);
      const lp = new LoginPage(page);
      await lp.goto();
      await lp.signIn(creds.username, creds.password);
      return creds;
    });
  },
});

export { expect };
