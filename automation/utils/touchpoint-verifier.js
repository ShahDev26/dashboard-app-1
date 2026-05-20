import { expect } from '@playwright/test';

/**
 * verifyTouchpoint(page, touchpoint, evidence)
 *   touchpoint: { role, screen, action } — from the TC's touchpoints[]
 *   evidence:   { url?, selector?, text?, custom? } — what to assert on the page
 *
 * Keep this dumb on purpose: real touchpoint checks live in the spec.
 * This wrapper just attaches the touchpoint metadata to the assertion failure
 * so screenshots + reports show which touchpoint failed.
 */
export async function verifyTouchpoint(page, touchpoint, evidence = {}) {
  const label = `[${touchpoint.role}] ${touchpoint.screen} — ${touchpoint.action}`;
  await expect.soft(page, label).toHaveURL(evidence.url ?? /.*/);
  if (evidence.selector) {
    await expect.soft(page.locator(evidence.selector), label).toBeVisible();
  }
  if (evidence.text) {
    await expect.soft(page.getByText(evidence.text), label).toBeVisible();
  }
  if (typeof evidence.custom === 'function') {
    await evidence.custom(page, touchpoint);
  }
}

/**
 * verifyAllTouchpoints — iterate every touchpoint on a TC and run the matching
 * evidence function. If no matcher is provided for a touchpoint, log it as
 * "manual verification required" so the report makes the gap explicit.
 */
export async function verifyAllTouchpoints(page, tc, matchers = {}) {
  const results = [];
  for (const tp of tc.touchpoints || []) {
    const key = `${tp.role}|${tp.screen}`;
    const matcher = matchers[key] || matchers[tp.screen];
    if (!matcher) {
      results.push({ ...tp, status: 'manual', reason: 'no matcher registered' });
      continue;
    }
    try {
      await matcher(page, tp);
      results.push({ ...tp, status: 'pass' });
    } catch (err) {
      results.push({ ...tp, status: 'fail', error: String(err.message || err) });
    }
  }
  return results;
}
