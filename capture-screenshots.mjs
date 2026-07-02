/**
 * Portfolio screenshot capture script
 * Captures remaining screens from localhost:3000
 * Run: node capture-screenshots.mjs
 */

import { chromium } from 'playwright';
import { join } from 'path';

const BASE = '/Users/sayeed/Documents/designs/Sunaan/Career OS/Projects/Reddit Marketing Tool/06 Screenshots';
const HOST = 'http://localhost:3000';

async function run() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  async function goto(url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500); // Let React hydrate and Firestore data load
  }

  async function shot(folder, filename) {
    await page.waitForTimeout(1200);
    const dest = join(BASE, folder, filename);
    await page.screenshot({ path: dest, fullPage: true });
    console.log(`✅ ${folder}/${filename}`);
  }

  // ── 1. Dashboard — scroll to changelog ──────────────────────────────────
  await goto(`${HOST}/`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await shot('Iterations', 'iteration-phase1-changelog.png');

  // ── 2. App header close-up ───────────────────────────────────────────────
  await goto(`${HOST}/apps/reddit-visibility`);
  await page.screenshot({
    path: join(BASE, 'Product', 'app-header-full-screen-shell.png'),
    clip: { x: 0, y: 0, width: 1440, height: 62 },
  });
  console.log('✅ Product/app-header-full-screen-shell.png');

  // ── 3. Navigate into BudgetLee → Opportunities ───────────────────────────
  await page.click('text=BudgetLee');
  await page.waitForURL(/\/apps\/reddit-visibility\/.+/, { timeout: 10000 });
  const projectId = page.url().split('/').pop();
  console.log(`  Project ID: ${projectId}`);
  await page.waitForTimeout(2000);

  await page.click('text=Opportunities');
  await page.waitForTimeout(5000); // Firestore data load

  // ── 4. All posts — show total counts ────────────────────────────────────
  await shot('Impact', 'impact-bulk-analysis-counts.png');

  // ── 5. Reply filter active ───────────────────────────────────────────────
  // Click the filter button that contains "Reply"
  await page.locator('button', { hasText: /^Reply/ }).first().click();
  await page.waitForTimeout(1500);
  await shot('Impact', 'impact-reply-filter-active.png');

  // ── 6. Search by keywords panel ─────────────────────────────────────────
  await page.locator('button', { hasText: 'Search by keywords' }).click();
  await page.waitForTimeout(1200);
  await shot('Product', 'search-by-keywords-panel.png');
  // Close it
  const cancelBtn = page.locator('button', { hasText: 'Cancel' });
  if (await cancelBtn.isVisible()) await cancelBtn.click();
  await page.waitForTimeout(500);

  // ── 7. Admin Invitations ────────────────────────────────────────────────
  await page.goto(`${HOST}/admin/invitations`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('Stakeholders', 'stakeholder-user-invitations.png');

  // ── 8. Admin Settings ───────────────────────────────────────────────────
  await page.goto(`${HOST}/admin/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('Product', 'admin-settings.png');

  // ── 9. Full dashboard scroll (employee-style view without stats scroll) ──
  await page.goto(`${HOST}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot('Product', 'dashboard-full-scroll.png');

  // ── 10. Decisions: dashboard vs reddit tool side note ─────────────────
  // Screenshot the main dashboard showing sidebar
  await page.screenshot({
    path: join(BASE, 'Decisions', 'decision-fullscreen-vs-dashboard-sidebar.png'),
    fullPage: false,
  });
  console.log('✅ decision-fullscreen-vs-dashboard-sidebar.png');

  // ── 11. Reddit tool — no sidebar architecture ──────────────────────────
  await page.goto(`${HOST}/apps/reddit-visibility`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: join(BASE, 'Decisions', 'decision-fullscreen-app-no-sidebar.png'),
    fullPage: false,
  });
  console.log('✅ decision-fullscreen-app-no-sidebar.png');

  // ── 12. Three-tier decision system ────────────────────────────────────
  // Navigate to opportunities with all filters visible
  await page.goto(`${HOST}/apps/reddit-visibility`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.click('text=BudgetLee');
  await page.waitForURL(/\/apps\/reddit-visibility\/.+/);
  await page.click('text=Opportunities');
  await page.waitForTimeout(2500);
  // Click All to show all decision types
  await page.click('text=All');
  await page.waitForTimeout(1000);
  await shot('Decisions', 'decision-three-tier-analysis-system.png');

  await browser.close();
  console.log('\n🎉 All remaining screenshots captured!');
}

run().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
