import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

test('desktop/mobile: hero and raffle follow server progress up/down without reloading or touching the cart',{
  skip:!process.env.PLAYWRIGHT_MODULE,
},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const names=['getRaffleAdvanceStats','renderRaffleAdvanceBlock','refreshFeaturedRaffleAdvance','startRaffleAdvanceRefresh','stopRaffleAdvanceRefresh'];
  const functions=names.map(name=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0]).join('\n');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const width of [1280,390]){
      const page=await browser.newPage({viewport:{width,height:900}});
      let percent=63.6;const calls=[];
      await page.route('**/*',route=>{
        if(route.request().url().includes('/availability?summary=1')){
          calls.push(route.request().method());
          return route.fulfill({contentType:'application/json',body:JSON.stringify({
            displayProgress:{percent,source:'mixed',manual:true,inventory_total:10000},
          })});
        }
        return route.fulfill({contentType:'text/html',body:'<main id="app"></main><input id="buyer" value="Cliente sin perder">'});
      });
      await page.goto('http://mixed-progress.test');
      await page.addStyleTag({content:fs.readFileSync(new URL('../public/styles.css',import.meta.url),'utf8')});
      await page.addScriptTag({content:`
        const app=document.getElementById('app'),API_BASE_URL=location.origin;
        const asArray=value=>Array.isArray(value)?value:[],escapeHtml=String;
        const getRaffleDisplayTitle=()=> 'Prueba',getRaffleDisplayTotal=()=>10000;
        let raffleAdvanceTimer=null,raffleAdvanceGeneration=0;
        ${functions}
        const originalTimeout=window.setTimeout;
        window.setTimeout=(fn,ms)=>{if(ms===30000){window.nextProgressTick=fn;return 0;}return originalTimeout(fn,ms);};
        const raffle={campaign:{id:40},displayProgress:{percent:60.1,source:'mixed',manual:true,inventory_total:10000}};
        const site={activeRaffles:[raffle]};
        app.innerHTML=renderRaffleAdvanceBlock(raffle)+renderRaffleAdvanceBlock(raffle,{compact:true});
        startRaffleAdvanceRefresh(site,'prueba');
      `});
      await page.waitForFunction(()=>[...document.querySelectorAll('[data-raffle-progress-meta]')].every(el=>el.textContent==='63.6% de avance'));
      percent=64;
      await page.evaluate(()=>window.nextProgressTick());
      assert.deepEqual(await page.locator('[data-raffle-progress-fill]').evaluateAll(els=>els.map(el=>el.style.width)),['64%','64%']);
      percent=55;
      await page.evaluate(()=>window.nextProgressTick());
      assert.deepEqual(await page.locator('[data-raffle-progress-meta]').allTextContents(),['55% de avance','55% de avance']);
      assert.equal(await page.locator('#buyer').inputValue(),'Cliente sin perder');
      await page.evaluate(()=>stopRaffleAdvanceRefresh());
      await page.evaluate(()=>window.nextProgressTick());
      assert.deepEqual(calls,['GET','GET','GET']);
      await page.close();
    }
  }finally{await browser.close();}
});
