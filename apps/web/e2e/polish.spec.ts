import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
test.beforeEach(async({request})=>{await request.post('http://127.0.0.1:4400/__test/reset');});
const listing='/listings/10000000-0000-4000-8000-000000000001';
const evidence=path.resolve(__dirname,'../../../docs/research/2026-10-21-digsconnect/polish');
test('landlord header is transparent over the hero and solid on scroll',async({page})=>{
  test.setTimeout(90000);fs.mkdirSync(evidence,{recursive:true});
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.goto('/landlords',{waitUntil:'domcontentloaded'});
    const notice=page.getByRole('region',{name:'Cookie notice'});
    if(await notice.isVisible())await notice.getByRole('button',{name:'OK',exact:true}).click();
    const header=page.locator('header.ch-public-header');
    for(const theme of ['light','dark']){
      if(theme==='dark')await header.getByRole('button',{name:'Toggle theme'}).click();
      await page.evaluate(()=>window.scrollTo(0,0));
      await expect(header).toHaveClass(/ch-public-header--hero/);
      await expect(header).not.toHaveClass(/ch-public-header--scrolled/);
      await expect.poll(()=>header.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      await expect.poll(()=>header.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
      await page.screenshot({path:path.join(evidence,`landlord-header-${width}-${theme}-top.png`)});
      await page.evaluate(()=>window.scrollTo(0,500));
      await expect(header).toHaveClass(/ch-public-header--scrolled/);
      await expect(header).toHaveCSS('color',theme==='light'?'rgb(23, 63, 67)':'rgb(226, 241, 239)');
      await expect.poll(()=>header.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await page.screenshot({path:path.join(evidence,`landlord-header-${width}-${theme}-scrolled.png`)});
    }
    await header.getByRole('button',{name:'Toggle theme'}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    await expect(header).not.toHaveClass(/ch-public-header--scrolled/);
    if(width===390)await header.getByRole('button',{name:'Open menu',exact:true}).click();
    await header.getByRole('link',{name:'Find a room',exact:true}).filter({visible:true}).click();
    await expect(page).toHaveURL(/\/search/);
    await expect(header).not.toHaveClass(/ch-public-header--hero/);
  }
});
function contrast(a:string,b:string){
  const luminance=(value:string)=>{const channels=(value.match(/[\d.]+/g)??[]).slice(0,3).map(Number).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('navigation stays readable through home, search and property transitions',async({page})=>{
  fs.mkdirSync(evidence,{recursive:true});await page.setViewportSize({width:1440,height:1000});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('region',{name:'Cookie notice'}).getByRole('button',{name:'OK',exact:true}).click();
  const header=page.locator('header.ch-public-header');
  await expect(header).toHaveClass(/ch-public-header--hero/);
  await header.getByRole('link',{name:'Find a room',exact:true}).click();
  await expect(page.getByText('Showing 20 of 23 hostels')).toBeVisible();
  await expect(header).not.toHaveClass(/ch-public-header--hero/);
  const colors=await header.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,ink:getComputedStyle(el.querySelector('nav a')!).color}));
  expect(contrast(colors.bg,colors.ink)).toBeGreaterThanOrEqual(4.5);
  const map=await page.getByRole('complementary',{name:'Hostel map'}).boundingBox();
  const results=await page.getByRole('region',{name:'Search results'}).boundingBox();
  expect(map!.width).toBeGreaterThan(results!.width*1.5);expect(map!.y).toBeGreaterThan(72);
  await page.screenshot({path:path.join(evidence,'search-desktop.png')});
  await page.getByRole('button',{name:'Hide map',exact:true}).click();await expect(page.getByRole('complementary',{name:'Hostel map'})).toHaveCount(0);
  await page.getByRole('button',{name:'Map',exact:true}).click();await expect(page.getByRole('complementary',{name:'Hostel map'})).toBeVisible();
  await page.getByRole('region',{name:'Search results'}).locator('article a').first().click();
  await expect(page.locator('h1')).toHaveText('Kikoni test hostel');await expect(header).not.toHaveClass(/ch-public-header--hero/);
  await expect(header.getByRole('link',{name:'Sign in',exact:true})).toHaveAttribute('href',/next=%2Flistings%2F/);
  await page.getByRole('button',{name:'Select room',exact:true}).first().click();
  await expect.poll(async()=>decodeURIComponent((await header.getByRole('link',{name:'Sign in',exact:true}).getAttribute('href'))??'')).toContain('room=');
});
test('landlord onboarding and hostel information stay clear across themes and sizes',async({page})=>{
  test.setTimeout(120000);fs.mkdirSync(evidence,{recursive:true});
  for(const width of [390,1024,1440]){
    await page.setViewportSize({width,height:900});await page.goto('/landlords',{waitUntil:'domcontentloaded'});
    if(width===390)await page.getByRole('region',{name:'Cookie notice'}).getByRole('button',{name:'OK',exact:true}).click();
    await expect(page.locator('h1')).toBeVisible();
    const hero=page.locator('.ch-landlord-hero');
    const heroColor=await hero.locator('p').first().evaluate(el=>getComputedStyle(el).color);
    expect(heroColor).not.toBe('rgb(77, 103, 105)');
    await expect(page.getByRole('heading',{name:'Create an account',exact:true})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:path.join(evidence,`landlords-${width}.png`),fullPage:true});
    await page.goto(listing,{waitUntil:'domcontentloaded'});
    await expect(page.getByRole('heading',{name:'Location',exact:true})).toBeVisible();
    await expect(page.locator('section').filter({has:page.getByRole('heading',{name:'Location',exact:true})}).locator('.maplibregl-map')).toBeVisible();
    await expect(page.getByRole('heading',{name:'Single rooms',exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Shared rooms',exact:true})).toBeVisible();
    await expect(page.locator('main')).not.toContainText(/\d+\s+(beds?|units?|rooms?)\s+(free|available)/i);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:path.join(evidence,`hostel-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await page.goto(listing,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Read full description',exact:true}).click();
  await expect(page.getByText('End of controlled test description.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Toggle theme'}).click();await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({path:path.join(evidence,'hostel-dark.png'),fullPage:true});
  await page.goto('/landlords',{waitUntil:'domcontentloaded'});await page.screenshot({path:path.join(evidence,'landlords-dark.png'),fullPage:true});
});
test('reporting keeps listing context and sends only an explicit Ops inquiry',async({page,context})=>{
  await context.addCookies([{name:'ch-local-test',value:'student',url:'http://127.0.0.1:3100'}]);
  await page.setViewportSize({width:1440,height:1000});await page.goto(listing,{waitUntil:'domcontentloaded'});
  await page.getByRole('link',{name:'Report listing',exact:true}).first().click();
  await expect(page.getByRole('textbox',{name:'Subject',exact:true})).toHaveValue('Report listing: Kikoni test hostel');
  await page.getByRole('textbox',{name:'Details',exact:true}).fill('The room description needs to be reviewed by the team.');
  const sent=page.waitForRequest(req=>req.url().endsWith('/api/v1/inquiries')&&req.method()==='POST');
  await page.getByRole('button',{name:'Send to Ops team',exact:true}).click();
  const data=(await sent).postDataJSON();expect(data.category).toBe('safety');expect(data.listingId).toBeUndefined();expect(data.message).toContain(listing.split('/').pop());
});
test('distance comparisons use selected public locations and safety tips open the full guidance',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await page.goto(listing,{waitUntil:'domcontentloaded'});
  const calculator=page.getByRole('region',{name:'Distance estimator',exact:true});
  await expect(calculator.getByText('Approximate straight-line distance',{exact:true})).toBeVisible();
  await expect(calculator.getByRole('combobox',{name:'Campus',exact:true})).toHaveValue('MUK');
  await calculator.getByRole('combobox',{name:'To',exact:true}).selectOption('hostel');
  await expect(calculator.getByText('Choose a destination hostel to calculate the distance.')).toBeVisible();
  const other='10000000-0000-4000-8000-000000000002';
  await expect(calculator.getByRole('combobox',{name:'Destination hostel',exact:true}).locator(`option[value="${other}"]`)).toHaveCount(1);
  await calculator.getByRole('combobox',{name:'Destination hostel',exact:true}).selectOption(other);
  await expect(calculator.getByText('Approximate straight-line distance',{exact:true})).toBeVisible();
  await expect(calculator.getByRole('combobox',{name:'From',exact:true}).locator(`option[value="${other}"]`)).toHaveAttribute('disabled','');
  await calculator.getByRole('button',{name:'Load more hostels',exact:true}).click();
  await expect(calculator.getByRole('combobox',{name:'From',exact:true}).locator('option[value="10000000-0000-4000-8000-000000000023"]')).toHaveCount(1);
  await calculator.getByRole('button',{name:'Show comparison map',exact:true}).click();
  await expect(calculator.locator('#distance-comparison-map .maplibregl-map')).toBeVisible();
  await calculator.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,'distance-estimator-phone.png')});
  await calculator.getByRole('searchbox',{name:'Search published hostels',exact:true}).fill('no-match-hostel');
  await calculator.getByRole('button',{name:'Search hostels',exact:true}).click();
  await expect(calculator.getByText('No hostels match this search. Try another hostel name or area.')).toBeVisible();
  const tips=page.getByRole('complementary',{name:'Inquiry safety tips',exact:true});
  await expect(tips.locator('ol > li')).toHaveCount(3);
  await tips.getByRole('link',{name:'Find out more',exact:false}).click();
  await expect(page).toHaveURL(/\/safety$/);
  for(const name of ['Location','Rooms','Amenities','Photos','Landlord identity','Safety'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await page.screenshot({path:path.join(evidence,'safety-phone.png'),fullPage:true});
});
