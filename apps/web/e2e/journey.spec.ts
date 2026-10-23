import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const evidence = path.resolve(__dirname, '../../../docs/research/2026-10-21-digsconnect/journey');
const stages = ['01 Open CampusHomes', '02 Search hostels', '03 Create an account', '04 Reserve', '05 Message landlord', '06 Confirm booking', '07 Move in', '08 Enjoy your room'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('campushomes:cookie-notice', 'dismissed'));
  fs.mkdirSync(evidence, { recursive: true });
});

test('guide covers the full journey with keyboard control and genuine booking rules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/how-it-works');
  const tabs = page.getByRole('tablist', { name: 'CampusHomes journey steps' });
  await expect(tabs.getByRole('tab')).toHaveCount(8);
  for (const name of stages) {
    const tab = tabs.getByRole('tab', { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel', { name, exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 3 })).toBeVisible();
    await expect(panel.locator('.ch-journey-preview__browser')).toBeVisible();
    await expect(panel.locator('.ch-journey-preview__phone')).toBeVisible();
  }
  await tabs.getByRole('tab', { name: stages[7], exact: true }).press('Home');
  await expect(tabs.getByRole('tab', { name: stages[0], exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: stages[1], exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Next journey step' }).click();
  await expect(tabs.getByRole('tab', { name: stages[2], exact: true })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: stages[5], exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Request booking');
  await expect(page.getByRole('tabpanel')).toContainText('landlord confirms');
  await tabs.getByRole('tab', { name: stages[6], exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Confirm move-in');
  await expect(page.getByRole('tabpanel')).toContainText('landlord directly');
  await page.locator('header').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/sign-in\?next=%2Fhow-it-works/);
  await expect(page.getByRole('button', { name: 'Student sign in', exact: true })).toBeVisible();
});

test('device previews and contact banner fit phones, tablets and desktops in both themes', async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/how-it-works');
    const header = page.locator('header.ch-public-header');
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(header).toHaveCSS('color', 'rgb(255, 255, 255)');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await header.getByRole('button', { name: 'Toggle theme' }).click();
      await page.getByRole('tab', { name: stages[1], exact: true }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await expect(header).toHaveClass(/ch-public-header--scrolled/);
      await page.screenshot({ path: path.join(evidence, `journey-${width}-${theme}.png`), fullPage: true });
    }
    await header.getByRole('button', { name: 'Toggle theme' }).click();
    await page.goto('/contact');
    const photo = page.locator('.ch-contact-hero__image');
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: path.join(evidence, `contact-banner-${width}.png`) });
  }
});
