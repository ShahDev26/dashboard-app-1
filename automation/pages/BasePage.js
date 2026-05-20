export class BasePage {
  constructor(page) { this.page = page; }

  async goto(path = '/') {
    await this.page.goto(path);
  }

  async screenshot(name) {
    await this.page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }

  url() { return this.page.url(); }
}
