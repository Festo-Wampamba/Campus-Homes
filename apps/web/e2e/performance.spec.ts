import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test('record a mobile performance sample',async({page,context})=>{
  test.skip(!process.env.CH_PERF,'Opt-in: run against the production build, not the development compiler.');
  test.setTimeout(120000);
  await page.setViewportSize({width:390,height:844});
  const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.addInitScript(()=>{
    const metrics={lcp:0,cls:0,lcpElement:""};Object.assign(window,{chPerformance:metrics});
    new PerformanceObserver(list=>{for(const entry of list.getEntries()){
      metrics.lcp=entry.startTime;
      const element=(entry as PerformanceEntry & {element?:Element}).element;
      metrics.lcpElement=element?.tagName === 'IMG' ? `img: ${element.getAttribute('alt') ?? ''}` : `${element?.tagName ?? ''}: ${element?.textContent?.slice(0,120) ?? ''}`;
    }}).observe({type:'largest-contentful-paint',buffered:true});
    new PerformanceObserver(list=>{for(const entry of list.getEntries() as (PerformanceEntry & {hadRecentInput:boolean;value:number})[])if(!entry.hadRecentInput)metrics.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
  });
  const samples=[];
  for(const route of ['/','/search']){
    await page.goto(route,{waitUntil:'load'});await expect(page.locator('h1')).toBeVisible();
    if(route==='/search')await expect(page.getByText('Showing 20 of 23 hostels')).toBeVisible();
    await page.waitForTimeout(3000); // fixed observation window for late layout shifts
    const sample=await page.evaluate(()=>({...(window as unknown as {chPerformance:{lcp:number;cls:number;lcpElement:string}}).chPerformance,resources:performance.getEntriesByType('resource').length}));
    samples.push({route,...sample});
  }
  const evidence=path.resolve(__dirname,'../../../docs/research/2026-10-21-digsconnect/implementation');fs.mkdirSync(evidence,{recursive:true});
  fs.writeFileSync(path.join(evidence,'performance.json'),JSON.stringify({profile:{viewport:'390x844',cpuSlowdown:4,rttMs:150,downloadMbps:1.6,uploadMbps:.75,cache:'disabled',build:'production',inventory:'local fixtures',samplesPerRoute:1,observationAfterLoadMs:3000},targets:{lcpMs:2500,cls:.1},samples},null,2));
});
