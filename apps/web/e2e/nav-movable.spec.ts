import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const evidence=path.resolve(__dirname,'../../../docs/research/2026-10-21-digsconnect/polish');
const navOrder=['Find a room','For Landlords','How it works','Contact Us','Support'];
const shortcutName='Chat with CampusHomes on WhatsApp (opens in a new tab)';

test('contact hero header and navigation order match across themes and screen sizes',async({page})=>{
  test.setTimeout(90000);fs.mkdirSync(evidence,{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});await page.goto('/contact');
    const notice=page.getByRole('region',{name:'Cookie notice'});if(await notice.isVisible())await notice.getByRole('button',{name:'OK',exact:true}).click();
    const header=page.locator('header.ch-public-header');
    if(width===1440)await expect(header.locator('nav > a.ch-public-header__link')).toHaveText(navOrder);
    else{
      await header.getByRole('button',{name:'Open menu',exact:true}).click();
      const drawer=page.getByRole('dialog',{name:'Mobile navigation'});
      await expect(drawer.locator('nav > a').filter({hasNotText:'Sign in'})).toHaveText(navOrder);
      await drawer.getByRole('button',{name:'Close menu',exact:true}).click();
    }
    for(const theme of ['light','dark']){
      if(theme==='dark')await header.getByRole('button',{name:'Toggle theme'}).click();
      await page.evaluate(()=>window.scrollTo(0,0));
      await expect(header).toHaveClass(/ch-public-header--hero/);
      await expect(header).not.toHaveClass(/ch-public-header--scrolled/);
      await expect(header).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect(header).toHaveCSS('color','rgb(255, 255, 255)');
      if(width===1440)await expect(header.getByRole('link',{name:'Contact Us',exact:true})).toHaveCSS('color','rgb(255, 255, 255)');
      const heading=await page.locator('h1').boundingBox(),bar=await header.boundingBox();
      expect(heading!.y).toBeGreaterThanOrEqual(bar!.height);
      await page.screenshot({path:path.join(evidence,`contact-header-${width}-${theme}-top.png`)});
      await page.evaluate(()=>window.scrollTo(0,500));
      await expect(header).toHaveClass(/ch-public-header--scrolled/);
      await expect(header).toHaveCSS('color',theme==='light'?'rgb(23, 63, 67)':'rgb(226, 241, 239)');
      await page.screenshot({path:path.join(evidence,`contact-header-${width}-${theme}-scrolled.png`)});
    }
    await header.getByRole('button',{name:'Toggle theme'}).click();
  }
});

test('WhatsApp can be dragged, moved by keyboard and reset without opening chat during a drag',async({page,context})=>{
  await page.setViewportSize({width:1440,height:900});await page.goto('/contact');
  const cookie=page.getByRole('region',{name:'Cookie notice'});if(await cookie.isVisible())await cookie.getByRole('button',{name:'OK',exact:true}).click();
  const shortcut=page.getByRole('link',{name:shortcutName,exact:true});
  await expect(shortcut).toBeVisible();const start=(await shortcut.boundingBox())!;
  const popups:unknown[]=[];page.on('popup',popup=>popups.push(popup));
  await page.mouse.move(start.x+28,start.y+28);await page.mouse.down();
  await page.mouse.move(140,330,{steps:12});await page.mouse.up();
  await expect.poll(async()=>Math.abs((await shortcut.boundingBox())!.x-112)).toBeLessThan(8);
  expect(popups).toHaveLength(0);
  await shortcut.focus();const moved=(await shortcut.boundingBox())!;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async()=>(await shortcut.boundingBox())!.x).toBeGreaterThan(moved.x);
  await page.screenshot({path:path.join(evidence,'whatsapp-moved-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>{
    const b=(await shortcut.boundingBox())!;return b.x>=0&&b.y>=0&&b.x+b.width<=390&&b.y+b.height<=844;
  }).toBe(true);
  await shortcut.press('Home');
  await expect.poll(async()=>(await shortcut.boundingBox())!.x).toBeGreaterThan(280);
  expect(popups).toHaveLength(0);
  await context.route('https://wa.me/**',route=>route.fulfill({status:200,contentType:'text/html',body:'Local WhatsApp navigation check'}));
  const popupPromise=page.waitForEvent('popup');await shortcut.press('Enter');
  const popup=await popupPromise;await popup.waitForURL('https://wa.me/256768561023');await popup.close();
});

test('WhatsApp supports a touch drag on phones',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  const page=await context.newPage();await page.goto('http://127.0.0.1:3100/contact');
  const cookie=page.getByRole('region',{name:'Cookie notice'});
  const cookieShouldShow=await page.evaluate(()=>localStorage.getItem('campushomes:cookie-notice')!=='dismissed');
  if(cookieShouldShow){
    await expect(cookie).toBeVisible();
    await cookie.getByRole('button',{name:'OK',exact:true}).click();
    await expect(cookie).toBeHidden();
  }else await expect(cookie).toHaveCount(0);
  const shortcut=page.getByRole('link',{name:shortcutName,exact:true});await expect(shortcut).toBeVisible();
  await shortcut.click({trial:true});
  const box=(await shortcut.boundingBox())!;const session=await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+28,y:box.y+28}]});
  for(let step=1;step<=8;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+28+(100-box.x-28)*step/8,y:box.y+28+(350-box.y-28)*step/8}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=>Math.abs((await shortcut.boundingBox())!.x-72)).toBeLessThan(8);
  expect(context.pages()).toHaveLength(1);
  await page.screenshot({path:path.join(evidence,'whatsapp-moved-phone.png')});
  await context.close();
});
