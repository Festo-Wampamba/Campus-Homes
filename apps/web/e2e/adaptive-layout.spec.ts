import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const evidence = process.env.CH_EVIDENCE_DIR || '/tmp/campushomes-adaptive-ui';
const sizes = [
  { width: 375, height: 812 }, { width: 844, height: 390 },
  { width: 1024, height: 768 }, { width: 1280, height: 720 },
  { width: 1366, height: 768 }, { width: 1536, height: 864 },
  { width: 1920, height: 1080 }, { width: 2560, height: 1440 },
];
async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true).catch(async () => { throw new Error(JSON.stringify(await page.evaluate(() => ({url:location.pathname,width:innerWidth,scroll:document.documentElement.scrollWidth,outside:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left< -1);}).slice(0,18).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,50),right:e.getBoundingClientRect().right}))})),null,2)); });
  await expect(page.getByText('Something went wrong', { exact: true })).not.toBeVisible();
}
async function contrast(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(elements => elements.map(el => {
    const canvas = document.createElement('canvas'); canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d')!;
    const rgba=(s:string) => { ctx.clearRect(0,0,1,1);ctx.fillStyle=s;ctx.fillRect(0,0,1,1);return Array.from(ctx.getImageData(0,0,1,1).data); };
    const layers: number[][]=[];
    for(let p:Element|null=el;p;p=p.parentElement)layers.push(rgba(getComputedStyle(p).backgroundColor));
    let bg=[255,255,255];
    for(const c of layers.reverse()){const a=c[3]/255;bg=bg.map((v,i)=>c[i]*a+v*(1-a));}
    const fg=rgba(getComputedStyle(el).color),alpha=fg[3]/255;
    const lum=(rgb:number[])=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const a=lum(bg),b=lum(fg.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha)));
    return {text:el.textContent,color:getComputedStyle(el).color,surface:getComputedStyle(el.parentElement!.parentElement!).backgroundColor,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  }));
}
test.describe('adaptive UI', () => {
    test.beforeEach(async ({page}) => {
      fs.mkdirSync(evidence,{recursive:true});
      await page.addInitScript(() => { localStorage.setItem('theme','light');localStorage.setItem('campushomes:cookie-notice','dismissed'); });
      await page.emulateMedia({reducedMotion:'reduce'});
    });
    test('public layouts and paired dark callout colors fit laptops and monitors',async({page,browserName})=>{
      test.setTimeout(300000);
      for(const size of sizes){
        await page.setViewportSize(size);
        await page.goto('/how-it-works',{waitUntil:'domcontentloaded'});
        await page.evaluate(()=>document.fonts.ready);
        await fits(page);
        for(const dark of [false,true]){
          await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
          const ratios=await contrast(page,'.ch-journey-hero__float strong, .ch-journey-hero__float small');
          for(const item of ratios)expect(item.ratio,`${size.width} ${dark} ${JSON.stringify(item)}`).toBeGreaterThanOrEqual(4.5);
          const caption=page.locator('.ch-journey-hero__image-caption strong');
          expect(await caption.evaluate(e=>parseFloat(getComputedStyle(e).lineHeight)/parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(1.15);
          await fits(page);
        }
        if([375,1366,1920].includes(size.width))await page.screenshot({path:path.join(evidence,`${browserName}-journey-${size.width}-dark.png`),fullPage:true});
      }
      // Route families at a compact laptop width; discovery keeps its own scroll rails.
      await page.setViewportSize({width:1024,height:768});
      for(const route of ['/','/search','/landlords','/contact','/safety','/support','/sign-in','/staff','/create-account','/privacy','/terms']){
        await page.goto(route,{waitUntil:'domcontentloaded'});if(!['/sign-in','/staff'].includes(route))await expect(page.locator('h1').first()).toBeVisible();await fits(page);
        await page.evaluate(()=>document.documentElement.classList.add('dark'));await fits(page);
      }
    });
    test('real management pages reflow with sidebar and enlarged text',async({page,context,browserName})=>{
      test.setTimeout(240000);
      await context.addCookies([{name:'ch-local-test',value:'admin',url:'http://127.0.0.1:3100'}]);
      for(const width of [375,1024,1280,1366,1920]){
        await page.setViewportSize({width,height:900});
        await page.goto('/admin',{waitUntil:'domcontentloaded'});await expect(page.locator('h1')).toBeVisible();
        await fits(page);
        const metric=page.locator('.ch-auto-grid').first();
        expect(await metric.locator('article').count()).toBe(4);
        for(const p of await metric.locator('p').all())expect(await p.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
        await page.evaluate(()=>document.documentElement.classList.add('dark'));
        for(const item of await contrast(page,'.ch-auto-grid article p, .ch-auto-grid article span.font-bold'))expect(item.ratio,item.text||'metric').toBeGreaterThanOrEqual(4.5);
      }
      for(const route of ['/admin/leadership','/admin/front-desk']){await page.goto(route);await fits(page);}
      await context.addCookies([{name:'ch-local-test',value:'landlord',url:'http://127.0.0.1:3100'}]);
      for(const width of [375,844,1280]){
        await page.setViewportSize({width,height:width===844?390:900});
        await page.goto('/landlord/tenants');await expect(page.getByRole('heading',{name:'Tenants',exact:true})).toBeVisible();await fits(page);
        await page.getByRole('button',{name:'Add students',exact:true}).click();
        const dialog=page.getByRole('dialog',{name:'Add students'});await expect(dialog).toBeVisible();
        await page.addStyleTag({content:'html{font-size:200% !important}'});
        await dialog.getByRole('button',{name:'Close',exact:true}).last().scrollIntoViewIfNeeded();
        await expect(dialog.getByRole('button',{name:'Close',exact:true}).last()).toBeVisible();
        await fits(page);await dialog.getByRole('button',{name:'Close',exact:true}).last().click();
      }
      await page.setViewportSize({width:1280,height:720});await page.goto('/landlord/rooms?tab=types');
      await page.getByRole('button',{name:'Add Room Type',exact:true}).click();
      const room=page.getByRole('dialog');await expect(room).toBeVisible();
      await room.evaluate(e=>{(e as HTMLElement).style.width='590px';});
      await expect.poll(()=>room.evaluate(e=>Math.round(e.getBoundingClientRect().width))).toBe(590);
      await expect.poll(()=>room.locator('.ch-auto-grid').nth(1).evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').filter(track=>parseFloat(track)>0).length)).toBeLessThan(3);
      await room.getByRole('button',{name:'Add Photos',exact:true}).scrollIntoViewIfNeeded();
      await expect(room.getByRole('button',{name:'Add Photos',exact:true})).toBeVisible();
      await fits(page);
      await page.screenshot({path:path.join(evidence,`${browserName}-room-resized.png`)});
    });
    test('student workspace and public text enlargement keep controls reachable',async({page,context,browserName})=>{
      test.setTimeout(180000);
      await context.addCookies([{name:'ch-local-test',value:'student',url:'http://127.0.0.1:3100'}]);
      for(const route of ['/dashboard','/saved','/reservations','/profile','/support']){
        await page.setViewportSize({width:375,height:812});await page.goto(route);await fits(page);
      }
      await context.clearCookies();
      for(const width of [375,853,1366]){
        await page.setViewportSize({width,height:900});await page.goto('/how-it-works');
        await page.addStyleTag({content:'html{font-size:200% !important}'});await fits(page);
        const header=page.locator('header');const menu=header.getByRole('button',{name:'Open menu'});
        if(await menu.isVisible()){await menu.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');}
      }
    });
  });
