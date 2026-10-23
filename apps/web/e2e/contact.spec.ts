import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const evidence=path.resolve(__dirname,'../../../docs/research/2026-10-21-digsconnect/polish');
const floatingName='Chat with CampusHomes on WhatsApp (opens in a new tab)';

test('contact channels, navigation, clear theme toggle and floating WhatsApp adapt across sizes',async({page})=>{
  test.setTimeout(90000);fs.mkdirSync(evidence,{recursive:true});
  for(const [width,height] of [[1440,1000],[375,844],[768,1024],[1024,900],[844,390]]){
    await page.setViewportSize({width,height});await page.goto('/contact',{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Contact CampusHomes.',exact:true})).toBeVisible();
    await expect(page.locator('main a[href="tel:+256732152211"]').first()).toBeVisible();
    await expect(page.locator('main a[href="mailto:info@akolet.co.ug"]')).toBeVisible();
    await expect(page.locator('main a[href="https://wa.me/256768561023"]')).toBeVisible();
    await expect(page.locator('address')).toContainText('Maimood Hostel, Office J07, Nkinzi Road');
    await expect(page.locator('address')).toContainText('Opposite Makerere Eastern Gate');
    await expect(page.getByRole('link',{name:'Open directions',exact:false})).toHaveAttribute('href',/^https:\/\/www.google.com\/maps\/search\//);
    const floating=page.getByRole('link',{name:floatingName,exact:true});
    await expect(floating).toBeVisible();await expect(floating).toHaveAttribute('href','https://wa.me/256768561023');
    const cookie=page.getByRole('region',{name:'Cookie notice'});
    if(await cookie.isVisible()){
      if(width<1024)await expect.poll(async()=>{
        const f=await floating.boundingBox(),c=await cookie.boundingBox();return !!f&&!!c&&f.y+f.height<=c.y;
      }).toBe(true);
      await cookie.getByRole('button',{name:'OK',exact:true}).click();
    }
    const header=page.locator('header.ch-public-header');
    const toggle=header.getByRole('button',{name:'Toggle theme'});
    await toggle.hover();await expect(toggle).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await toggle.click();await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(toggle).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await page.screenshot({path:path.join(evidence,`contact-${width}-dark.png`),fullPage:true});
    await toggle.click();await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.screenshot({path:path.join(evidence,`contact-${width}.png`),fullPage:true});
    if(width<1024){
      await header.getByRole('button',{name:'Open menu',exact:true}).click();
      const drawer=page.getByRole('dialog',{name:'Mobile navigation'});
      await expect(drawer.getByRole('link',{name:'Contact Us',exact:true})).toBeVisible();
      await drawer.getByRole('link',{name:'Contact Us',exact:true}).click();
      await expect(drawer).not.toBeVisible();
    }else await expect(header.getByRole('link',{name:'Contact Us',exact:true})).toHaveAttribute('aria-current','page');
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
});

test('enlarged contact text stays within the phone viewport',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:375,height:844});await page.goto('/contact');
  await expect(page.getByRole('heading',{name:'Contact CampusHomes.',exact:true})).toBeVisible();
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:path.join(evidence,'contact-enlarged-phone.png')});
});

test('legacy contact URLs and signed-out report context survive sign-in entry',async({page})=>{
  const query=new URLSearchParams({tab:'contact',listingId:'10000000-0000-4000-8000-000000000001',subject:'Report listing: Kikoni test hostel'});
  await page.goto(`/support?${query}`);
  await expect(page).toHaveURL(/\/contact\?/);
  const signIn=page.getByRole('link',{name:'Sign in to open the inquiry desk',exact:true});
  const href=(await signIn.getAttribute('href'))!;
  const destination=new URL(href,'http://localhost').searchParams.get('next')!;
  expect(destination).toContain('listingId=10000000-0000-4000-8000-000000000001');
  expect(new URL(destination,'http://localhost').searchParams.get('subject')).toBe('Report listing: Kikoni test hostel');
  await signIn.click();
  await expect(page.getByRole('button',{name:'Student sign in',exact:true})).toBeVisible();
  const providerUrl=await page.getByRole('link').filter({has:page.getByRole('button',{name:'Student sign in',exact:true})}).getAttribute('href');
  expect(decodeURIComponent(providerUrl!)).toContain('/contact?');
});

test('floating contact stays above the phone reservation action',async({page})=>{
  await page.setViewportSize({width:375,height:844});
  await page.goto('/listings/10000000-0000-4000-8000-000000000001');
  const notice=page.getByRole('region',{name:'Cookie notice'});if(await notice.isVisible())await notice.getByRole('button',{name:'OK',exact:true}).click();
  const action=page.getByRole('link',{name:'Choose a room',exact:true}).filter({visible:true});
  const floating=page.getByRole('link',{name:floatingName,exact:true});
  await expect(action).toBeVisible();
  const a=await action.boundingBox(),f=await floating.boundingBox();
  expect(f!.y+f!.height).toBeLessThanOrEqual(a!.y);
});
