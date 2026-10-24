// Run from the repository root:
// node apps/web/e2e/demo-journey.mjs --rehearse
// node apps/web/e2e/demo-journey.mjs
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3100';
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/research/2026-10-21-digsconnect/journey');
const rehearsal = process.argv.includes('--rehearse');
const stages = [
  ['01 Open CampusHomes', 'Step 1 - Open CampusHomes on your device'],
  ['02 Search hostels', 'Step 2 - Compare inspected hostels'],
  ['03 Create an account', 'Step 3 - Create your student account'],
  ['04 Reserve', 'Step 4 - Reserve an available bed for free'],
  ['05 Message landlord', 'Step 5 - Ask questions and arrange a viewing'],
  ['06 Confirm booking', 'Step 6 - Request booking; the landlord confirms'],
  ['07 Move in', 'Step 7 - Arrange and confirm your move-in'],
  ['08 Enjoy your room', 'Step 8 - Settle into your room'],
];

async function overlays(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    cursor.style.cssText = 'position:fixed;left:20px;top:20px;z-index:999999;pointer-events:none;filter:drop-shadow(1px 1px 2px #0005)';
    document.body.append(cursor);
    document.addEventListener('mousemove', event => { cursor.style.left = event.clientX + 'px'; cursor.style.top = event.clientY + 'px'; });
    const bar = document.createElement('div');
    bar.id = 'demo-subtitle';
    bar.style.cssText = 'position:fixed;bottom:16px;left:16px;width:294px;max-width:calc(100vw - 32px);box-sizing:border-box;z-index:999998;text-align:left;padding:14px 18px;border-radius:12px;background:#062f34f0;color:white;font:500 16px/1.45 system-ui;pointer-events:none;opacity:0;transition:opacity .25s';
    document.body.append(bar);
  });
}

async function subtitle(page, text) {
  if (rehearsal) return;
  await page.evaluate(text => {
    const bar = document.getElementById('demo-subtitle');
    if (!bar) throw new Error('Subtitle overlay missing after navigation');
    bar.textContent = text; bar.style.opacity = text ? '1' : '0';
  }, text);
}

async function moveAndClick(page, locator, label) {
  await expect(locator, `Missing demo control: ${label}`).toBeVisible();
  await locator.scrollIntoViewIfNeeded();
  await locator.click({ trial: true });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No clickable bounds: ${label}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: rehearsal ? 1 : 16 });
  if (!rehearsal) await page.waitForTimeout(350);
  await locator.click();
  console.log(`OK: ${label}`);
}

async function tour(page) {
  await page.goto(`${base}/contact`);
  await expect(page.getByRole('heading', { name: 'Contact CampusHomes.', exact: true })).toBeVisible();
  if (!rehearsal) {
    await overlays(page);
    await subtitle(page, 'CampusHomes - your housing journey, in one place');
    await page.mouse.move(540, 280, { steps: 20 });
    await page.waitForTimeout(3500);
  }
  await moveAndClick(page, page.locator('header').getByRole('link', { name: 'How it works', exact: true }), 'How it works navigation');
  await expect(page).toHaveURL(`${base}/how-it-works`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (!rehearsal) {
    await overlays(page);
    await subtitle(page, 'Explore an illustrated guide on phone and desktop');
    await page.waitForTimeout(3500);
  }
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.ch-journey-experience').getBoundingClientRect().top + scrollY - 88, behavior: 'smooth' }));
  if (!rehearsal) await page.waitForTimeout(1800);

  for (const [name, caption] of stages) {
    await subtitle(page, caption);
    const tab = page.getByRole('tab', { name, exact: true });
    await moveAndClick(page, tab, name);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel', { name, exact: true });
    await expect(panel.getByRole('heading', { level: 3 })).toBeVisible();
    await expect(panel.locator('.ch-journey-preview__browser')).toBeVisible();
    await expect(panel.locator('.ch-journey-preview__phone')).toBeVisible();
    if (!rehearsal) {
      const box = await panel.locator('.ch-journey-previews').boundingBox();
      if (!box) throw new Error('Device previews missing');
      await page.mouse.move(box.x + box.width * .35, Math.min(620, box.y + box.height * .5), { steps: 18 });
      await page.waitForTimeout(4200);
    }
  }
  if (!rehearsal) {
    await subtitle(page, 'Your account keeps the next step in view.');
    await page.waitForTimeout(3000);
    await subtitle(page, '');
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(output, 'journey-demo-final.png') });
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ch-journey-video-'));
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...(rehearsal ? {} : { recordVideo: { dir: temp, size: { width: 1280, height: 720 } } }) });
  await context.addInitScript(() => localStorage.setItem('campushomes:cookie-notice', 'dismissed'));
  const page = await context.newPage();
  let completed = false;
  try { await tour(page); completed = true; }
  finally {
    await context.close();
    if (completed && !rehearsal) {
      const video = page.video();
      if (!video) throw new Error('Expected video was not created');
      await video.saveAs(path.join(output, 'campushomes-journey.webm'));
    }
    await browser.close();
  }
  console.log(rehearsal ? 'REHEARSAL PASSED - all eight stages verified' : 'Video saved: ' + path.join(output, 'campushomes-journey.webm'));
})().catch(error => { console.error('DEMO FAILED:', error); process.exitCode = 1; });
