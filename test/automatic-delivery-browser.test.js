import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

test('desktop/mobile: purchase summary updates automatically without opening WhatsApp or sending another payment',{
  skip:!process.env.PLAYWRIGHT_MODULE,
},async()=>{
  const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  const functions=['escapeHtml','formatCOP','renderDeliveryModalContent','renderDeliveryModal','paintDeliveryModal',
    'syncDeliveryModal','closeDeliveryModal','openDeliveryModal','refreshPublicPurchaseStatus'];
  const code=functions.map(name=>source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'))[0]).join('\n');
  const fixture={reference:'RP-BROWSER',payment_status:'approved',delivery_status:'sent',summary:{
    customer_name:'Cliente de prueba',customer_phone:'573000000001',ticket_count:2,raffle_name:'Sorteo prueba',amount_paid:10000}};
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    for(const width of [1280,390]){
      const context=await browser.newContext({viewport:{width,height:900}});
      const page=await context.newPage();const calls=[];const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const request=route.request();
        if(request.url().includes('/purchase-status?')){
          calls.push({method:request.method(),url:request.url()});
          return route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)});
        }
        return route.fulfill({contentType:'text/html',body:'<div id="app"></div>'});
      });
      await page.goto('http://public-purchase.test');
      await page.addStyleTag({content:css});
      await page.addScriptTag({content:`
        const deliveryModalState={requestId:0},raffleSelectorState={},paymentModalState={};
        const API_BASE_URL=location.origin;
        const currencyFormatter=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
        const readJsonResponse=response=>response.json();
        ${code}
        document.getElementById('app').innerHTML=renderDeliveryModal();
        document.addEventListener('click',e=>{if(e.target.closest('[data-action="close-delivery-modal"]'))closeDeliveryModal();});
        openDeliveryModal({slug:'prueba',raffle:{campaign:{id:7}},paymentReference:'RP-BROWSER',customerPhone:'573000000001',summary:${JSON.stringify(fixture.summary)}});
      `});
      const modal=page.getByRole('dialog');
      await modal.getByText(/fueron enviadas automáticamente/).waitFor();
      for(const text of ['Cliente de prueba','573000000001','Cantidad de boletas','Sorteo inscrito','Valor pagado']) await modal.getByText(text,{exact:true}).waitFor();
      assert.equal(await modal.locator('a').count(),0);
      assert.equal(await modal.getByRole('button').count(),1,'only Close, no WhatsApp action');
      assert.equal(await modal.locator('.purchase-summary').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth;}),true);
      assert.equal(calls.length,1);assert.equal(calls[0].method,'GET');
      await modal.getByRole('button',{name:'Cerrar',exact:true}).click();
      assert.equal(await page.locator('#delivery-modal').getAttribute('aria-hidden'),'true');
      assert.deepEqual(errors,[]);
      await context.close();
    }
  }finally{await browser.close();}
});
