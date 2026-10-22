import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const evidence = path.resolve(__dirname, '../../../docs/research/2026-10-21-digsconnect/support');

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(evidence, { recursive: true });
  await page.addInitScript(() => localStorage.setItem('campushomes:cookie-notice', 'dismissed'));
});

test('support hero, tabs and manual remain aligned and usable across screens and themes', async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 768, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/support');
    const header = page.locator('header.ch-public-header');
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(header).toHaveCSS('color', 'rgb(255, 255, 255)');
    const hero = await page.getByRole('heading', { level: 1 }).boundingBox();
    expect(hero!.y).toBeGreaterThanOrEqual(72);
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await header.getByRole('button', { name: 'Toggle theme' }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(header).not.toHaveClass(/ch-public-header--scrolled/);
      await page.screenshot({ path: path.join(evidence, `support-${width}-${theme}.png`), fullPage: true });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const ai = page.getByRole('tab', { name: 'Ask CampusHomes AI', exact: true });
      await ai.focus(); await page.keyboard.press('ArrowRight');
      const manual = page.getByRole('tab', { name: 'User manual', exact: true });
      await expect(manual).toBeFocused();
      await expect(manual).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveURL(/tab=manual/);
      await page.evaluate(() => window.scrollTo(0, 500));
      await expect(header).toHaveClass(/ch-public-header--scrolled/);
      const search = page.getByRole('searchbox', { name: 'Search the manual' });
      await search.fill('Request booking');
      await expect(page.getByRole('heading', { name: 'Booking a room', exact: true })).toBeVisible();
      await search.fill('zzzz-no-result');
      await expect(page.getByText('Nothing in the manual matches', { exact: false })).toBeVisible();
      await search.fill('');
      await page.screenshot({ path: path.join(evidence, `manual-${width}-${theme}.png`) });
      await ai.click();
      await expect(ai).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('textbox', { name: 'Ask CampusHomes AI', exact: true })).toBeVisible();
    }
    await header.getByRole('button', { name: 'Toggle theme' }).click();
  }
});

test('chat sends the entered question and presents answers and errors without breaking the layout', async ({ page }) => {
  let call = 0;
  await page.route('**/api/v1/support/ask', async route => {
    expect(route.request().postDataJSON().messages.at(-1).content).toBe(call ? 'Can you help again?' : 'How do I reserve a room?');
    call++;
    await route.fulfill({ status: call === 1 ? 200 : 503, contentType: 'application/json', body: JSON.stringify(call === 1 ? { reply: 'Sign in and choose an available room. Review the details before reserving for free.' } : { message: 'The assistant is temporarily unavailable. Please use the manual or contact our team.' }) });
  });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto('/support');
  const input = page.getByRole('textbox', { name: 'Ask CampusHomes AI', exact: true });
  const send = page.getByRole('button', { name: 'Send', exact: true });
  await expect(send).toBeDisabled();
  await input.fill('How do I reserve a room?');
  await send.click();
  await expect(page.getByRole('log')).toContainText('Review the details before reserving for free.');
  await input.fill('Can you help again?'); await input.press('Enter');
  await expect(page.getByRole('region', { name: 'CampusHomes AI', exact: true }).getByRole('alert')).toContainText('temporarily unavailable');
  await expect(send).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
