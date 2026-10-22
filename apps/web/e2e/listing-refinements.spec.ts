import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const listing='/listings/10000000-0000-4000-8000-000000000001';
const evidence=path.resolve(__dirname,'../../../docs/research/2026-10-21-digsconnect/polish');

test('sharing, landlord history, room details and amenity disclosure work on desktop and phone',async({page,context})=>{
  test.setTimeout(90000);fs.mkdirSync(evidence,{recursive:true});
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.goto(`${listing}?intent=reserve`,{waitUntil:'domcontentloaded'});
    const cookie=page.getByRole('region',{name:'Cookie notice'});
    if(await cookie.isVisible())await cookie.getByRole('button',{name:'OK',exact:true}).click();
    const landlord=page.getByRole('region',{name:'About the landlord'}).filter({visible:true});
    await expect(landlord).toContainText('Local Test Landlord');
    await expect(landlord).toContainText('January 2025');
    await expect(landlord).toContainText('60% answered within 24 hours');
    await expect(landlord).toContainText('80% of inquiries answered');
    const sharing=page.getByRole('region',{name:'Share this hostel'}).filter({visible:true});
    const whatsapp=sharing.getByRole('link',{name:'Share on WhatsApp'});
    await expect(whatsapp).toHaveAttribute('href',/^https:\/\/wa.me\/\?text=/);
    expect(decodeURIComponent((await whatsapp.getAttribute('href'))!)).not.toContain('intent=');
    await expect(sharing.getByRole('link',{name:'Share by email'})).toHaveAttribute('href',/^mailto:/);
    await expect(sharing.getByRole('link',{name:/facebook/i})).toHaveCount(0);
    await sharing.getByRole('button',{name:'Copy hostel link'}).click();
    await expect(sharing.getByRole('status')).toHaveText('Hostel link copied.');
    expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(`http://127.0.0.1:3100${listing}`);
    await page.screenshot({path:path.join(evidence,`sharing-landlord-${width}.png`)});

    const amenities=page.locator('section[aria-labelledby="facilities-heading"]');
    await expect(amenities.getByRole('heading',{name:'Amenities',exact:true})).toBeVisible();
    await expect(amenities.locator('li')).toHaveCount(6);
    const expand=amenities.getByRole('button',{name:'Show all 9 amenities'});
    await expand.click();await expect(amenities.getByRole('button',{name:'Show fewer'})).toHaveAttribute('aria-expanded','true');
    await expect(amenities.locator('li')).toHaveCount(9);
    await amenities.getByRole('button',{name:'Show fewer'}).click();
    await expect(amenities.locator('li')).toHaveCount(6);
    await expect(page.locator('section[aria-labelledby="rules-heading"] li svg')).toHaveCount(2);
    await page.getByRole('button',{name:'View details',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:'Single details',exact:true});
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Shared bathroom');
    await expect(dialog).toContainText('Deposit not stated');
    await expect(dialog.getByRole('heading',{name:'Room amenities'})).toBeVisible();
    await expect(dialog).toContainText('Study desk');
    await expect(dialog).toContainText('Wardrobe');
    await expect(dialog).not.toContainText('Electricity');
    await page.screenshot({path:path.join(evidence,`room-details-${width}.png`)});
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button',{name:'View details',exact:true}).first()).toBeFocused();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    if(width===390){
      await page.getByRole('button',{name:'Toggle theme'}).click();
      await page.getByRole('button',{name:'View details',exact:true}).first().click();
      await page.screenshot({path:path.join(evidence,'room-details-dark-phone.png')});
      await page.keyboard.press('Escape');
    }
  }
});

test('sign-in clock and information stay readable without covering controls',async({page})=>{
  test.setTimeout(60000);
  for(const width of [1440,390,844]){
    await page.setViewportSize({width,height:width===844?390:900});
    await page.goto(`/sign-in?next=${encodeURIComponent(`${listing}?room=single-false-500000-1-unknown&intent=reserve`)}`,{waitUntil:'domcontentloaded'});
    const clock=page.locator('.tabular-nums').first();
    await expect(clock).toHaveText(/\d{1,2}:\d{2}/);
    const card=page.getByRole('button',{name:'Student sign in',exact:true});
    await expect(card).toBeVisible();
    await expect(page.getByRole('link',{name:'Create an account',exact:true})).toBeVisible();
    const clockBox=await clock.boundingBox();const buttonBox=await card.boundingBox();
    expect(clockBox!.y+clockBox!.height).toBeLessThan(buttonBox!.y);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:path.join(evidence,`signin-readable-${width}.png`),fullPage:true});
  }
  await page.evaluate(()=>localStorage.setItem('theme','dark'));
  await page.setViewportSize({width:390,height:844});await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('.tabular-nums').first()).toHaveText(/\d{1,2}:\d{2}/);
  await page.screenshot({path:path.join(evidence,'signin-readable-dark-phone.png'),fullPage:true});
});
