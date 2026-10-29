import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function load(ctx,names) {
  for(const name of names) {
    const match=source.match(new RegExp('(?:async )?function '+name+'\\([^]*?\\n}'));
    assert.ok(match,name); vm.runInContext(match[0],ctx);
  }
}
const summary={customer_name:'Cliente <Prueba>',customer_phone:'573000000001',ticket_count:2,raffle_name:'Premio',amount_paid:10000};

test('approved, processing and failed delivery show a safe summary without a WhatsApp-send button',()=>{
  const state={summary,paymentStatus:'approved',deliveryStatus:'processing',paymentReference:'RP-TEST'};
  const ctx=vm.createContext({deliveryModalState:state,formatCOP:value=>`$ ${value}`});
  load(ctx,['escapeHtml','renderDeliveryModalContent']);
  for(const status of ['processing','sent','pending_support']) {
    state.deliveryStatus=status;
    const html=ctx.renderDeliveryModalContent();
    assert.match(html,/Cliente &lt;Prueba&gt;/);
    for(const text of ['573000000001','Cantidad de boletas','Sorteo inscrito','Valor pagado','10000','RP-TEST']) assert.ok(html.includes(text));
    assert.doesNotMatch(html,/Enviar por WhatsApp|wa\.me|href=|data-action="download/);
    if(status==='sent') assert.match(html,/fueron enviadas automáticamente/);
    else assert.doesNotMatch(html,/fueron enviadas/);
  }
  state.paymentStatus='review';
  assert.doesNotMatch(ctx.renderDeliveryModalContent(),/Pago exitoso|Compra confirmada|Valor pagado|fueron enviadas/);
  assert.match(ctx.renderDeliveryModalContent(),/Cuando sea aprobado/);
});

test('upload opens summary automatically and retains buyer data before closing the cart',async()=>{
  for(const approved of [true,false]) {
    const state={site:{},slug:'prueba',raffle:{campaign:{id:7}},selected:['01','02'],loading:false};
    const calls={fetch:[],summary:[],closed:0};
    const ctx=vm.createContext({paymentModalState:state,raffleSelectorState:{},FormData,asArray:v=>Array.isArray(v)?v:[],
      API_BASE_URL:'https://example.invalid',window:{__PUBLIC_SITE_STATE__:{}},
      ensurePaymentModalContactReady:()=>true,awaitPackageBeforePayment:async()=>true,
      getRaffleSelectorSelectionSummary:()=>({total:10000,isComplete:true,completeTickets:2,groupSize:1}),
      groupRaffleSelections:selection=>selection,
      getPaymentModalContactPayload:()=>({customer_name:summary.customer_name,customer_phone:summary.customer_phone,customer_city:'Neiva'}),
      openReceiptUploadModal(){},submitPublicPaymentStateNotice(){},clearPersistedSelection(){},paintRaffleSelector(){},closeReceiptUploadModal(){},
      closePaymentModal:()=>{calls.closed++;state.raffle=null;},
      openDeliveryModal:payload=>calls.summary.push(payload),
      fetch:async(url,options)=>{calls.fetch.push({url,options});return {ok:true};},
      readJsonResponse:async()=>({payment_reference:'RP-TEST',auto_approved:approved,purchase_summary:{...summary,amount_paid:approved?10000:null},delivery_status:approved?'processing':'not_ready'}),
    });
    load(ctx,['submitPublicReceiptUpload']);
    await ctx.submitPublicReceiptUpload(new File(['test'],'comprobante.png',{type:'image/png'}));
    assert.equal(calls.fetch.length,1,'upload is the only write; no second send action');
    assert.equal(calls.fetch[0].options.method,'POST');
    assert.equal(calls.closed,1);
    assert.equal(calls.summary.length,1);
    assert.equal(calls.summary[0].summary.customer_name,summary.customer_name);
    assert.equal(calls.summary[0].customerPhone,summary.customer_phone);
    assert.equal(calls.summary[0].paymentStatus,approved?'approved':'review');
    assert.equal(calls.summary[0].raffle.campaign.id,7);
  }
});

test('status polling only reads; updates review through approval and send, stops after success',async()=>{
  const state={open:true,requestId:1,pollCount:0,slug:'prueba',raffle:{campaign:{id:7}},paymentReference:'RP-TEST',customerPhone:summary.customer_phone};
  const calls=[];const timers=[];
  let payload={reference:'RP-TEST',summary,payment_status:'review',delivery_status:'not_ready'};
  const ctx=vm.createContext({deliveryModalState:state,URLSearchParams,AbortSignal,API_BASE_URL:'https://example.invalid',
    window:{setTimeout:fn=>timers.push(fn)},paintDeliveryModal(){},
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true};},readJsonResponse:async()=>payload,
  });
  load(ctx,['refreshPublicPurchaseStatus']);
  await ctx.refreshPublicPurchaseStatus();
  assert.equal(state.paymentStatus,'review');assert.equal(timers.length,1);
  payload={...payload,payment_status:'approved',delivery_status:'processing'};
  await ctx.refreshPublicPurchaseStatus();
  payload={...payload,delivery_status:'sent'};
  await ctx.refreshPublicPurchaseStatus();
  assert.equal(state.deliveryStatus,'sent');assert.equal(timers.length,2);
  assert.equal(state.summary.ticket_count,2);
  assert.ok(calls.every(c=>!c.options.method&&c.options.cache==='no-store'&&c.url.includes('/purchase-status?')));
  state.open=false;
  await ctx.refreshPublicPurchaseStatus();
  assert.equal(calls.length,3);
});

test('late status from another purchase cannot overwrite the current one; network errors never report sent',async()=>{
  const state={open:true,requestId:1,pollCount:0,slug:'prueba',raffle:{campaign:{id:7}},paymentReference:'RP-TEST',customerPhone:summary.customer_phone,deliveryStatus:'processing'};
  let resolve;
  const ctx=vm.createContext({deliveryModalState:state,URLSearchParams,AbortSignal,API_BASE_URL:'https://example.invalid',
    window:{setTimeout(){}},paintDeliveryModal(){},fetch:()=>new Promise(done=>resolve=done),
    readJsonResponse:async()=>({reference:'RP-TEST',summary,payment_status:'approved',delivery_status:'sent'}),
  });
  load(ctx,['refreshPublicPurchaseStatus']);
  const pending=ctx.refreshPublicPurchaseStatus();
  state.requestId=2;
  resolve({ok:true});await pending;
  assert.equal(state.deliveryStatus,'processing');
  ctx.fetch=async()=>{throw Error('Sin conexión');};
  await ctx.refreshPublicPurchaseStatus();
  assert.equal(state.deliveryStatus,'processing');
  assert.match(state.notice,/No vuelvas a pagar/);
});
