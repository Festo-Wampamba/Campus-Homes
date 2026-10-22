import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
const evidence=path.resolve(__dirname,'../../../docs/research/2026-10-21-digsconnect/implementation');
const listing='/listings/10000000-0000-4000-8000-000000000001';
const viewports=[{width:360,height:800},{width:390,height:844},{width:768,height:1024},{width:1024,height:768},{width:1440,height:1000},{width:844,height:390}];
test('responsive discovery surfaces, keyboard filters and theme',async({page})=>{
  test.setTimeout(120000);fs.mkdirSync(evidence,{recursive:true});
  for(const viewport of viewports){
    await page.setViewportSize(viewport);
    for(const [name,url] of [['home','/'],['search','/search'],['detail',listing]] as const){
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await expect(page.locator('h1')).toBeVisible();
      const notice = page.getByRole('region',{name:'Cookie notice'});
      if(await notice.isVisible()) await notice.getByRole('button',{name:'OK',exact:true}).click();
      if(name==='search')await expect(page.getByText('Showing 20 of 23 hostels')).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
      await page.screenshot({path:path.join(evidence,`${name}-${viewport.width}.png`)});
    }
    await page.goto('/search',{waitUntil:'domcontentloaded'});
    await expect(page.getByText('Showing 20 of 23 hostels')).toBeVisible();
    const filters=page.getByRole('button',{name:'All filters'});await filters.click();
    const dialog=page.getByRole('dialog',{name:'Filter hostels'});await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Apply filters'})).toBeVisible();
    // Measure after the opening scale transition has settled.
    await expect.poll(async()=>{const rect=await dialog.getByRole('button',{name:'Close',exact:true}).boundingBox();return Math.min(rect!.width,rect!.height);}).toBeGreaterThanOrEqual(44);
    if(viewport.width<1280){const rect=await dialog.boundingBox();expect(rect!.height).toBeGreaterThan(viewport.height-5);}
    await page.screenshot({path:path.join(evidence,`filters-${viewport.width}.png`)});
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(filters).toBeFocused();
  }
  await page.setViewportSize({width:390,height:844});await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Toggle theme'}).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({path:path.join(evidence,'home-dark-390.png')});
  await page.goto(listing,{waitUntil:'domcontentloaded'});await page.screenshot({path:path.join(evidence,'detail-dark-390.png')});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/search',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Showing 20 of 23 hostels')).toBeVisible();
  await page.getByRole('button',{name:'All filters'}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'All filters'})).toBeFocused();
});
test('student and help destinations render inside their own shell',async({page,context})=>{
  test.setTimeout(90000);
  await context.addCookies([{name:'ch-local-test',value:'student',url:'http://127.0.0.1:3100'}]);
  await page.setViewportSize({width:390,height:844});
  for(const url of ['/dashboard','/saved','/recently-viewed','/reservations','/messages','/profile','/calendar','/faqs','/safety','/support?tab=contact','/landlords','/privacy','/terms']){
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText('Something went wrong',{exact:true})).not.toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  }
  await page.goto('/dashboard',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('dialog',{name:'Student navigation'})).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open navigation'})).toBeFocused();
  await page.getByRole('link',{name:'View profile'}).click();await expect(page).toHaveURL(/\/profile$/);
  await page.goto('/faqs',{waitUntil:'domcontentloaded'});await page.getByRole('searchbox',{name:'Search help topics'}).fill('no matching question xyz');await expect(page.getByText(/No answers match this search/)).toBeVisible();
});
