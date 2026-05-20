import { BasePage } from './BasePage.js';
import { env } from '../config/env.js';

/**
 * MEL login page object.
 *
 * Selectors live here. When MEL UI markup changes, update only this file —
 * every dependent spec keeps working.
 *
 * The page is reachable at `${baseURL}${env.loginPath}` (default `/login`).
 * MEL exposes ONE combined identifier field ("Phone or email") and one
 * password field. signIn() targets them via accessible name / placeholder
 * so it survives class/name attribute churn.
 */
export class LoginPage extends BasePage {
  constructor(page) {
    super(page);
    // MEL: a single textbox accepts either a 10-digit mobile or an email.
    this.identifierInput = page.getByPlaceholder(/mobile.*number.*or.*email/i)
      .or(page.getByLabel(/phone.*or.*email/i))
      .or(page.locator('input[name="email"], input[name="mobile"], input[type="email"]'));

    this.passwordInput = page.getByLabel(/^password/i)
      .or(page.locator('input[type="password"], input[name="password"], #password, #pwd'));

    this.submitButton = page.getByRole('button', { name: /^login$|^sign in$/i })
      .or(page.locator('button[type="submit"], #btn'));

    this.errorBanner = page.locator('[role="alert"], .error, [data-testid="login-error"]');
  }

  async goto(path = env.loginPath) {
    await this.page.goto(path);
  }

  /**
   * Sign in. Accepts either:
   *   signIn({ email?, mobile?, password })   — preferred; uses email if set, else mobile
   *   signIn(identifier, password)            — raw form
   */
  async signIn(userOrId, maybePassword) {
    let identifier, password;
    if (typeof userOrId === 'object' && userOrId !== null) {
      identifier = userOrId.email || userOrId.mobile || '';
      password = userOrId.password;
    } else {
      identifier = userOrId || '';
      password = maybePassword;
    }

    const idField = this.identifierInput.first();
    await idField.click();
    await idField.fill('');                          // clear any prefill
    await idField.pressSequentially(identifier, { delay: 30 }); // typed so React can react
    await this.passwordInput.first().fill(password ?? '');
    await this.submitButton.first().click();
  }

  async errorText() {
    if (await this.errorBanner.count() === 0) return '';
    return (await this.errorBanner.first().textContent())?.trim() || '';
  }
}
